"""Explicit fresh TEST cutover. Shares production manifests, builds and migrations.

Only recorded Compose containers/volumes are removed. Existing Kubernetes data
is never reset. A durable plan precedes deletion; resume never repeats a reset
after databases have started and never retries a failed migration automatically.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import time
from urllib.parse import urlsplit


def fingerprint(m, root, config):
    digest = hashlib.sha256(json.dumps(config, sort_keys=True).encode())
    # Include tracked and untracked source, respecting Git's existing exclusions.
    files = m.run(["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"], capture=True)
    for name in sorted(set(files.split("\0")) - {""}):
        path = root / name
        if path.is_file():
            digest.update(name.encode())
            with path.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
    return digest.hexdigest()


def inspect_targets(m, config):
    """Read and validate the complete destructive boundary before any deletion."""
    project = config.get("name", "")
    m.need(re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project), "Missing/invalid Compose project name.")
    ids = m.run(["docker", "ps", "-a", "-q", "--filter", f"label=com.docker.compose.project={project}"], capture=True).split()
    inventory = json.loads(m.run(["docker", "inspect", *ids], capture=True)) if ids else []
    allowed = set(m.APPS + m.DATABASES) | {"pgadmin", "mongo-init"}
    targets, volumes, owners = [], set(), {}
    for item in inventory:
        labels = item["Config"].get("Labels") or {}
        service = labels.get("com.docker.compose.service")
        m.need(item["Name"] != "/reloop-tunnel" and item["Name"].startswith("/" + project + "-")
               and service in allowed, "Unexpected Compose container; refuse fresh reset.")
        targets.append({"id": item["Id"], "service": service, "image": item["Image"]})
        for mount in item["Mounts"]:
            if mount["Type"] == "volume":
                volumes.add(mount["Name"])
        for index, destination in enumerate(m.FILES.get(service, ())):
            mounts = [mount for mount in item["Mounts"] if mount["Destination"] == destination]
            m.need(len(mounts) == 1 and mounts[0]["Type"] == "volume", f"{service}: unsupported data layout.")
            info = Path(mounts[0]["Source"]).stat()
            owners[m.snapshot_name(service, index)] = [info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)]
    if targets:
        m.need(set(m.APPS + m.DATABASES) <= {item["service"] for item in targets},
               "Partial Compose stack; review before fresh deployment.")
    target_ids = {item["id"] for item in targets}
    for volume in volumes:
        references = m.run(["docker", "ps", "-a", "--no-trunc", "-q", "--filter", f"volume={volume}"], capture=True).split()
        m.need(set(references) <= target_ids, "Application volume is shared; refuse deletion.")
    return {"project": project, "containers": targets, "volumes": sorted(volumes), "owners": owners}


def fresh_resources(m, config, images, state, enabled):
    sql = []
    for name in m.APPS[:4]:
        database = urlsplit(m.env_of(config["services"][name])["DATABASE_URL"]).path.lstrip("/")
        m.need(re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", database), "Unsupported SQL database name.")
        sql.append(f"SELECT 'CREATE DATABASE \"{database}\"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='{database}')\\gexec")
    result = m.manifests(config, images, state, apps_enabled=enabled)
    result["items"].append(m.resource("ConfigMap", "postgres-fresh-init", data={"00-reloop.sql": "\n".join(sql) + "\n"}))
    for item in result["items"]:
        if item["kind"] == "Deployment" and item["metadata"]["name"] == "postgres":
            pod = item["spec"]["template"]["spec"]
            pod["volumes"].append({"name": "fresh-init", "configMap": {"name": "postgres-fresh-init"}})
            pod["containers"][0]["volumeMounts"].append({"name": "fresh-init", "mountPath": "/docker-entrypoint-initdb.d", "readOnly": True})
        if item["kind"] == "Service" and item["metadata"]["name"] == "mongo":
            item["spec"]["publishNotReadyAddresses"] = True
    return result


def deployment_class(m, *, resume):
    class FreshDeployment(m.Deployment):
        def save(self, **fields):
            self.journal.update(fields)
            m.save_journal(self.journal_path, self.journal)

        def prepare(self):
            m.need((self.root / ".env").is_file(), "Missing server .env.")
            patterns = (self.root / ".dockerignore").read_text().splitlines()
            m.need(any(line.strip().rstrip("/") in (".deploy-state", "**/.deploy-state") for line in patterns)
                   and not any(line.strip().startswith("!") for line in patterns), "Exclude .deploy-state without re-inclusions.")
            m.need(Path("/run/systemd/system").is_dir(), "A systemd Linux host is required.")
            self.config = json.loads(m.run(self.compose + ["config", "--format", "json"], capture=True))
            m.validate_config(self.config)
            current = fingerprint(m, self.root, self.config)
            if resume:
                m.need(self.journal.get("status") == "incomplete" and self.journal.get("mode") == "fresh-test"
                       and self.journal.get("fresh_version") == 1, "No resumable fresh deployment.")
                m.need(self.journal.get("root") == str(self.root) and self.journal.get("source") == current,
                       "Source/config changed; restore the reviewed inputs before resume.")
                self.images = self.journal["images"]
                self.plan = json.loads((self.run_dir / "reset-plan.json").read_text())
                self.first = False
                self.install()
                namespace = json.loads(self.k("get", "namespace", m.NAMESPACE, "-o", "json", capture=True))
                m.need(namespace["metadata"]["uid"] == self.journal.get("namespace_uid"), "Namespace identity changed; review recovery.")
                return
            m.need(not self.journal and not (self.state / "data").exists(),
                   "Fresh mode only supports first installation; existing Kubernetes data is never erased.")
            memory = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
            m.need((os.cpu_count() or 0) >= 2 and int(memory["MemTotal"].split()[0]) >= 8_000_000
                   and int(memory["MemAvailable"].split()[0]) >= 2_000_000, "Need 2 CPUs, 8 GB RAM and 2 GB available RAM.")
            self.plan = inspect_targets(m, self.config)
            # Validate init SQL before recording/resetting anything.
            tag = self.run_dir.name.lower()
            self.images = {name: f"docker.io/reloop-production/{name}:{tag}" for name in m.APPS + m.DATABASES}
            self.install()  # Refuses any existing application namespace.
            fresh_resources(m, self.config, self.images, self.state, False)
            for name in m.DATABASES:
                source = next((item["image"] for item in self.plan["containers"] if item["service"] == name), None)
                if source is None:
                    source = self.config["services"][name].get("image")
                    m.need(source, f"Missing database image: {name}")
                    m.run(["docker", "pull", source])
                m.run(["docker", "tag", source, self.images[name]])
            m.write_json(self.run_dir / "compose.json", self.config)
            m.write_json(self.run_dir / "reset-plan.json", self.plan)
            self.save(status="incomplete", mode="fresh-test", fresh_version=1, backup_waived=True,
                      root=str(self.root), run=str(self.run_dir), source=current, images=self.images,
                      ports=m.public_ports(self.config), fresh_stage="namespace")
            namespace = m.resource("Namespace", m.NAMESPACE)
            namespace["metadata"].pop("namespace")
            self.apply(namespace)
            namespace = json.loads(self.k("get", "namespace", m.NAMESPACE, "-o", "json", capture=True))
            self.save(namespace_uid=namespace["metadata"]["uid"], fresh_stage="reset")

        def reset(self):
            # Revalidate identities/references on resume; never force removal or prune globally.
            existing = set(m.run(["docker", "ps", "-a", "--no-trunc", "-q"], capture=True).split())
            for item in self.plan["containers"]:
                if item["id"] not in existing:
                    continue
                info = json.loads(m.run(["docker", "inspect", item["id"]], capture=True))[0]
                labels = info["Config"].get("Labels") or {}
                m.need(labels.get("com.docker.compose.project") == self.plan["project"]
                       and labels.get("com.docker.compose.service") == item["service"], "Container ownership changed.")
            # Stop all writers before any database, even when inventory ordering differs.
            ordered = sorted(self.plan["containers"], key=lambda item: item["service"] in m.DATABASES)
            for item in ordered:
                if item["id"] in existing:
                    m.run(["docker", "update", "--restart=no", item["id"]])
                    m.run(["docker", "stop", "-t", "180", item["id"]])
            for item in ordered:
                if item["id"] in existing:
                    m.run(["docker", "rm", item["id"]])
            volumes = set(m.run(["docker", "volume", "ls", "-q"], capture=True).split())
            for volume in self.plan["volumes"]:
                if volume in volumes:
                    m.need(not m.run(["docker", "ps", "-a", "-q", "--filter", f"volume={volume}"], capture=True).strip(),
                           "Volume gained another owner; refuse deletion.")
                    m.run(["docker", "volume", "rm", volume])
            # Remove only app images recorded before reset and no longer used anywhere.
            available = set(m.run(["docker", "image", "ls", "--no-trunc", "-q"], capture=True).split())
            for image in sorted({item["image"] for item in ordered if item["service"] in m.APPS}):
                if image not in available:
                    continue
                if m.run(["docker", "ps", "-a", "-q", "--filter", f"ancestor={image}"], capture=True).strip():
                    continue
                info = json.loads(m.run(["docker", "image", "inspect", image], capture=True))[0]
                tags = info.get("RepoTags") or []
                # Unrelated tags are preserved even when they share an application image.
                for tag in tags:
                    if any(tag.startswith(self.plan["project"] + "-" + app + ":") for app in m.APPS):
                        m.run(["docker", "image", "rm", tag])
            m.need(shutil.disk_usage(self.state).free >= 20 * 1024**3,
                   "Need 20 GiB free after scoped reset. Free space manually; no global prune is performed.")

        def databases(self):
            if not self.journal.get("storage_started"):
                m.need(not (self.state / "data").exists(), "Unexpected target data; refuse to initialize it.")
                self.save(storage_started=True)
            for name, paths in m.FILES.items():
                for index, unused in enumerate(paths):
                    label = m.snapshot_name(name, index)
                    path = self.state / "data" / label
                    if not path.exists():
                        path.mkdir(parents=True, mode=0o700)
                        uid, gid, mode = self.plan["owners"].get(label, (0, 0, 0o755))
                        path.chmod(mode)
                        os.chown(path, uid, gid)
            self.apply(fresh_resources(m, self.config, self.images, self.state, False))
            script = ('try {var s=rs.status(); if(s.ok) {var c=rs.conf(); '
                      'if(c._id!=="rs0"||c.members.length!==1||c.members[0].host!=="mongo:27017") quit(2); quit(0);}} '
                      'catch(e) {if(e.code!==94) throw e;} '
                      'var r=rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]}); if(!r.ok) quit(2);')
            for attempt in range(60):
                try:
                    self.mongo_shell(None, script)
                    break
                except m.Blocked:
                    if attempt == 59:
                        raise
                    time.sleep(3)
            self.wait_databases()

        def migration(self, name, command, suffix):
            key = suffix + ":" + name
            completed = self.journal.get("completed_jobs", [])
            if key in completed:
                return
            job_name = f"{name}-{suffix}-{self.run_dir.name.lower()}"
            jobs = json.loads(self.k("get", "jobs", "-o", "json", capture=True))["items"]
            job = next((item for item in jobs if item["metadata"]["name"] == job_name), None)
            failed = job and (job.get("status", {}).get("failed") or any(
                item.get("type") == "Failed" and item.get("status") == "True"
                for item in job.get("status", {}).get("conditions", [])))
            m.need(not failed,
                   "A migration Job failed. Inspect its logs and repair deliberately; resume will not retry it.")
            if job and job.get("status", {}).get("succeeded"):
                self.k("logs", "job/" + job_name)
                self.k("delete", "job", job_name)
                self.k("delete", "secret", job_name + "-env")
            else:
                super().migration(name, command, suffix)
            self.save(completed_jobs=completed + [key])

        def migrations(self):
            for name in m.APPS[:4]:
                self.migration(name, ["node", "prisma/migrate.js"], "migrate")
            self.migration("chat-service", ["npx", "prisma", "db", "push", "--skip-generate"], "migrate")
            self.check_migrations()

        def health(self):
            self.apply(fresh_resources(m, self.config, self.images, self.state, True))
            for name in m.APPS:
                self.k("rollout", "status", "deployment/" + name, "--timeout=600s")
            self.k("exec", "deployment/gateway", "--", "node", "-e",
                   'fetch("http://127.0.0.1:8080/api/products/feed?limit=1",{signal:AbortSignal.timeout(10000)}).then(async r=>{'
                   'if(!r.ok||!Array.isArray((await r.json()).items))process.exit(1)}).catch(()=>process.exit(1))')
            self.k("exec", "deployment/frontend", "--", "node", "-e", 'if(process.env.NODE_ENV!=="production")process.exit(1)')
            m.check_host_ports(self.config)

        def deploy(self):
            self.prepare()
            stages = ("reset", "build", "import", "databases", "migrations", "health")
            stage = self.journal.get("fresh_stage")
            m.need(stage in stages, "Fresh namespace setup was interrupted; inspect namespace ownership before recovery.")
            for index in range(stages.index(stage), len(stages)):
                name = stages[index]
                self.phase("fresh-" + name)
                if name == "build":
                    self.build_apps()
                elif name == "import":
                    self.import_images(m.APPS + m.DATABASES)
                    m.need(shutil.disk_usage(self.state).free >= 2 * 1024**3, "Less than 2 GiB free after image import.")
                else:
                    getattr(self, name)()
                if index + 1 < len(stages):
                    self.save(fresh_stage=stages[index + 1])
            self.save(status="ready", fresh_stage="ready", schema=self.schema_fingerprint(), last_success=str(self.run_dir), previous_run=None)
            self.k("get", "pods", "-o", "wide")
            print(f"Fresh TEST deploy OK: {m.NAMESPACE}. Private logs: {self.run_dir}", flush=True)

    return FreshDeployment


def execute(m, root, state, *, resume):
    deployment = deployment_class(m, resume=resume)(root, state, True, resume=resume)
    with (deployment.run_dir / "run.log").open("ab", buffering=0) as log:
        m.LOG = log
        try:
            deployment.deploy()
        except (m.Blocked, OSError, ValueError, KeyError, KeyboardInterrupt) as error:
            print(f"Fresh deploy FAILED during {deployment.stage}: {type(error).__name__}. Inspect {deployment.run_dir}/run.log.", file=sys.stderr)
            # Never put raw configuration/exception values in the shared terminal.
            log.write((str(error) + "\n").encode())
            print("After resolving the cause, use --resume-fresh. Failed migration Jobs require manual review.", file=sys.stderr)
            return 1
    return 0
