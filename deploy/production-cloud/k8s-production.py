#!/usr/bin/env python3
"""Implementation of deploy-k8s.sh. Secrets and snapshots never enter the checkout.

Uses cold copies, not a cross-major database upgrade. Initial import is fail-closed:
an interrupted import requires reviewed recovery, never an automatic second restore.
"""
import codecs
import hashlib
import ipaddress
import json
import os
import re
import posixpath
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener
from urllib.error import URLError

APPS = ("auth-service", "product-service", "order-service", "support-service",
        "chat-service", "gateway", "frontend")
DATABASES = ("postgres", "mongo", "redis")
PORTS = dict(zip(APPS, (3001, 3002, 3003, 3006, 3004, 8080, 3000)))
FILES = {
    "auth-service": ("/app/services/auth-service/private-kyc-documents",),
    "product-service": ("/app/services/product-service/uploads",
                        "/app/services/product-service/review-uploads"),
    "order-service": ("/app/services/order-service/private-evidence",),
    "chat-service": ("/app/services/chat-service/private-attachments",),
    "postgres": ("/var/lib/postgresql/data",),
    "mongo": ("/data/db",),
    "redis": ("/data",),
}
NAMESPACE = "reloop-production"
OWNER = "reloop-deploy-k8s"
LOG = None


class Blocked(RuntimeError):
    pass


def need(condition, message):
    if not condition:
        raise Blocked(message)


def run(args, *, data=None, capture=False, output=None):
    """Never echo argv: a command may contain configuration/secrets."""
    if output is not None:
        with open(output, "wb") as stream:
            result = subprocess.run(args, input=data, stdout=stream, stderr=LOG)
    elif capture:
        result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=LOG)
    else:
        # Drain output continuously, including progress messages without newlines.
        # Spool optional stdin separately so large input/output cannot deadlock.
        with tempfile.TemporaryFile() as input_stream:
            if data is not None:
                input_stream.write(data)
                input_stream.seek(0)
            with subprocess.Popen(args, stdin=input_stream if data is not None else None,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT) as process:
                decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
                try:
                    while chunk := process.stdout.read1(65536):
                        if LOG is not None:
                            LOG.write(chunk)
                            LOG.flush()
                        print(decoder.decode(chunk), end="", flush=True)
                    print(decoder.decode(b"", final=True), end="", flush=True)
                    result = subprocess.CompletedProcess(args, process.wait())
                except BaseException:
                    # Match subprocess.run cleanup on interruption or output failure.
                    process.kill()
                    process.wait()
                    raise
    if result.returncode:
        raise Blocked(f"{Path(args[0]).name} failed (exit {result.returncode}); inspect private run.log.")
    return result.stdout.decode() if capture else ""


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def save_journal(path, value):
    temporary = path.with_suffix(".tmp")
    write_json(temporary, value)
    temporary.replace(path)


def env_of(service):
    value = service.get("environment", {})
    need(isinstance(value, dict), "Compose must resolve environment to an object.")
    return {key: str(item) for key, item in value.items() if item is not None}


def snapshot_name(service, index):
    return f"{service}-{index}"


def validate_archive(path):
    # Docker-produced archives still contain application-controlled filenames.
    # Reject links and special files rather than extracting them as host root.
    with tarfile.open(path) as archive:
        for member in archive:
            parts = Path(member.name).parts
            need(not member.name.startswith("/") and ".." not in parts,
                 "Unsafe path in backup archive.")
            need(member.isdir() or member.isfile(),
                 "Backup contains links/special files; review before migrating.")
            need(not member.mode & 0o6000, "Backup contains setuid/setgid permissions; review before migrating.")


def validate_data_archive(archive, name, config):
    validate_archive(archive)
    if name in DATABASES:
        pgdata = env_of(config["services"]["postgres"]).get("PGDATA", "/var/lib/postgresql/data")
        pg_relative = pgdata.removeprefix("/var/lib/postgresql/data").strip("/")
        marker = {"postgres": posixpath.join(pg_relative, "PG_VERSION"),
                  "mongo": "WiredTiger", "redis": "dump.rdb"}[name]
        with tarfile.open(archive) as entries:
            names = {posixpath.normpath(item.name) for item in entries if item.isfile()}
        need(marker in names, f"{name}: backup has no database marker; refusing an empty replacement.")


def verify_archive(path, target):
    with tarfile.open(path) as archive:
        for member in archive:
            if not member.isfile():
                continue
            actual = target / member.name
            need(actual.is_file() and not actual.is_symlink(), "Restored file missing or unsafe.")
            with archive.extractfile(member) as original, actual.open("rb") as restored:
                def digest(stream):
                    checksum = hashlib.sha256()
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        checksum.update(chunk)
                    return checksum.digest()
                need(digest(original) == digest(restored), "Restored file checksum differs.")


def public_ports(config):
    result = {}
    for app in ("frontend", "gateway"):
        bindings = config["services"][app].get("ports", [])
        need(len(bindings) == 1, f"{app}: expected one existing published port.")
        binding = bindings[0]
        need(isinstance(binding, dict) and binding.get("protocol", "tcp") == "tcp",
             "Unsupported published port configuration.")
        try:
            port = int(binding.get("published", 0))
            target = int(binding.get("target", 0))
        except (TypeError, ValueError):
            raise Blocked(f"{app}: published and target ports must be integers.") from None
        need(1 <= port <= 65535 and target == PORTS[app],
             f"{app}: invalid source port mapping.")
        host = binding.get("host_ip", "0.0.0.0")
        need(host == "0.0.0.0", "Non-default host IP binding requires a reviewed network configuration.")
        result[app] = port
    need(len(set(result.values())) == 2, "Frontend/gateway published ports overlap.")
    need(not set(result.values()) & {6443, 10250}, "Published port conflicts with K3s.")
    return result


def check_host_ports(config):
    # Test the host routing used by the existing reverse proxy, not only Pod-local HTTP.
    opener = build_opener(ProxyHandler({}))
    for name, port in public_ports(config).items():
        path = "/" if name == "frontend" else "/health"
        try:
            with opener.open(f"http://127.0.0.1:{port}{path}", timeout=10) as response:
                need(response.status == 200, f"{name}: host-port health check failed.")
        except (URLError, TimeoutError, OSError) as error:
            raise Blocked(f"{name}: host-port routing failed; inspect K3s networking/reverse proxy.") from error


def validate_storage_env(environment):
    directory = FILES["auth-service"][0]
    need(posixpath.normpath(environment.get("KYC_STORAGE_DIR", directory)) == directory,
         "Custom KYC storage directory needs manual migration review.")
    reports = posixpath.normpath(environment.get("REPORT_EVIDENCE_STORAGE_DIR", directory + "/report-evidence"))
    need(reports.startswith(directory + "/"), "Report evidence must stay inside the copied private KYC store.")
    return directory, reports


def validate_production_environment(values, label):
    """Validate resolved Compose values, not shell-evaluated dotenv text."""
    # Secret-policy checks disabled by request; uncomment to enforce them again.
    # for key in ("POSTGRES_PASSWORD", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "INTERNAL_SERVICE_TOKEN"):
    #     value = values.get(key, "")
    #     need(len(value) >= 32 and not re.search(r"change[_-]?me|example|reloop_dev|^dev[_-]", value, re.I),
    #          f"{label}: {key} must be at least 32 characters and not an example/development secret.")
    # need(len({values[key] for key in ("JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "INTERNAL_SERVICE_TOKEN")}) == 3,
    #      f"{label}: JWT access, refresh and internal tokens must be different.")
    loopback = True
    for key in ("APP_BASE_URL", "NEXT_PUBLIC_API_URL"):
        try:
            url = urlsplit(values.get(key, ""))
            need(url.scheme in ("http", "https") and url.hostname and not url.username
                 and not url.password and not url.query and not url.fragment,
                 f"{label}: {key} must be an absolute HTTP(S) URL without credentials, query or fragment.")
            host = url.hostname
            try:
                local = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = host == "localhost"
            if not local:
                loopback = False
                need(url.scheme == "https", f"{label}: {key} requires HTTPS for non-loopback use.")
        except ValueError:
            raise Blocked(f"{label}: invalid {key} URL.") from None
    transport = values.get("MAIL_TRANSPORT")
    need(transport in ("smtp", "log"), f"{label}: MAIL_TRANSPORT must be smtp or log.")
    need(loopback or transport == "smtp", f"{label}: non-loopback deployments require MAIL_TRANSPORT=smtp.")
    need(values.get("MAIL_FROM"), f"{label}: MAIL_FROM is required.")
    if transport == "smtp":
        need(values.get("SMTP_HOST"), f"{label}: SMTP_HOST is required.")
        need(bool(values.get("SMTP_USER")) == bool(values.get("SMTP_PASS")),
             f"{label}: SMTP_USER and SMTP_PASS must be set together.")
        port = values.get("SMTP_PORT", "587")
        need(str(port).isdigit() and 1 <= int(port) <= 65535, f"{label}: invalid SMTP_PORT.")


def validate_config(config):
    services = config["services"]
    for name in APPS + DATABASES:
        need(name in services, f"Missing Compose service: {name}")
    for name in APPS:
        need(services[name].get("build"), f"Missing build definition: {name}")
    for name in APPS[:-2]:
        url = urlsplit(env_of(services[name]).get("DATABASE_URL", ""))
        expected = "mongo" if name == "chat-service" else "postgres"
        need(url.hostname == expected, f"{name}: DATABASE_URL must address the local {expected} service.")
    for name in APPS:
        environment = env_of(services[name])
        validate_production_environment(environment, name)
        if "REDIS_URL" in environment:
            need(urlsplit(environment["REDIS_URL"]).hostname == "redis",
                 "Only the existing local Redis is supported.")
    need(services["frontend"].get("build", {}).get("dockerfile") == "frontend/Dockerfile.prod",
         "Frontend must use Dockerfile.prod.")
    need(not services["frontend"].get("volumes"), "Production frontend cannot have development mounts.")
    build_args = services["frontend"]["build"].get("args", {})
    need(build_args.get("NEXT_PUBLIC_API_URL") == env_of(services["frontend"]).get("NEXT_PUBLIC_API_URL"),
         "Frontend build NEXT_PUBLIC_API_URL must match its runtime environment.")
    pg = env_of(services["postgres"])
    need(pg.get("POSTGRES_USER") and pg.get("POSTGRES_PASSWORD"), "PostgreSQL credentials are missing.")
    for name in APPS:
        need(env_of(services[name]).get("POSTGRES_PASSWORD") == pg["POSTGRES_PASSWORD"],
             f"{name}: POSTGRES_PASSWORD must match the PostgreSQL service.")
    need(not pg.get("POSTGRES_INITDB_WALDIR"), "External PostgreSQL WAL directories need manual migration.")
    pgdata = pg.get("PGDATA", "/var/lib/postgresql/data")
    need((pgdata == "/var/lib/postgresql/data" or pgdata.startswith("/var/lib/postgresql/data/"))
         and ".." not in pgdata.split("/"), "PGDATA must remain inside the copied data directory.")
    need(not services["postgres"].get("command"), "Custom PostgreSQL commands need manual review.")
    need(not services["redis"].get("command"), "Custom Redis commands need manual review.")
    need(not env_of(services["mongo"]), "Mongo auth/custom environment needs manual migration review.")
    need(services["mongo"].get("command") == ["--replSet", "rs0", "--bind_ip_all"],
         "Custom Mongo startup options need manual migration review.")
    for name in APPS:
        need(not services[name].get("command") and not services[name].get("entrypoint"),
             f"{name}: custom startup commands need manual review.")
        allowed = set(FILES.get(name, ()))
        need(all(mount.get("target") in allowed for mount in services[name].get("volumes", [])),
             f"{name}: extra persistent mounts need manual migration review.")
    validate_storage_env(env_of(services["auth-service"]))
    public_ports(config)


def resource(kind, name, spec=None, **fields):
    versions = {"Deployment": "apps/v1", "Job": "batch/v1", "NetworkPolicy": "networking.k8s.io/v1"}
    item = {"apiVersion": versions.get(kind, "v1"), "kind": kind,
            "metadata": {"name": name, "namespace": NAMESPACE,
                         "labels": {"app.kubernetes.io/managed-by": OWNER}}}
    if spec is not None:
        item["spec"] = spec
    item.update(fields)
    return item


def environment(name, service):
    result = env_of(service)
    if name in APPS:
        result["NODE_ENV"] = "production"
        result.pop("WATCHPACK_POLLING", None)
        result.pop("CHOKIDAR_USEPOLLING", None)
        # .env *_PORT values publish the host ports. Pod listeners stay fixed to
        # match Services, probes and inter-service URLs, even with custom host ports.
        for app, port in PORTS.items():
            result[app.replace('-service', '').upper() + '_PORT'] = str(port)
        if name == "frontend":
            result["PORT"] = "3000"
    return result


def manifests(config, images, state, *, apps_enabled):
    """Production resources intentionally do not reuse development startup db-push."""
    # Mongo/Redis have no authentication in the imported topology. Restrict data
    # service ingress to this namespace; K3s' network-policy controller must stay enabled.
    items = [resource("NetworkPolicy", "data-services-ingress", {
        "podSelector": {"matchExpressions": [{"key": "app", "operator": "In", "values": list(DATABASES)}]},
        "policyTypes": ["Ingress"], "ingress": [{"from": [{"podSelector": {}}]}],
    })]
    bindings = public_ports(config)
    for name in APPS + DATABASES:
        service = config["services"][name]
        items.append(resource("Secret", name + "-env", type="Opaque",
                              stringData=environment(name, service)))
        port = PORTS.get(name, {"postgres": 5432, "mongo": 27017, "redis": 6379}.get(name))
        items.append(resource("Service", name, {"selector": {"app": name},
                     "ports": [{"name": "tcp", "port": port, "targetPort": port}]}))
        container = {"name": name, "image": images[name], "imagePullPolicy": "Never",
                     "envFrom": [{"secretRef": {"name": name + "-env"}}],
                     "ports": [{"containerPort": port}], "volumeMounts": []}
        if name in bindings:
            container["ports"][0]["hostPort"] = bindings[name]
        volumes = []
        for index, mount in enumerate(FILES.get(name, ())):
            label = snapshot_name(name, index)
            container["volumeMounts"].append({"name": label, "mountPath": mount})
            volumes.append({"name": label, "hostPath": {"path": str(state / "data" / label),
                                                        "type": "Directory"}})
        if name in APPS:
            # Use the image CMD: production frontend start, no automatic schema edits.
            container["startupProbe"] = {"httpGet": {"path": "/" if name == "frontend" else "/health",
                                                     "port": port}, "periodSeconds": 5,
                                         "failureThreshold": 120}
            container["readinessProbe"] = {"httpGet": {"path": "/" if name == "frontend" else "/health",
                                                       "port": port}, "periodSeconds": 5}
        elif name == "postgres":
            container["readinessProbe"] = {"exec": {"command": ["sh", "-c", 'pg_isready -U "$POSTGRES_USER"']},
                                           "periodSeconds": 5}
        elif name == "mongo":
            container["args"] = ["--replSet", "rs0", "--bind_ip_all"]
            container["readinessProbe"] = {"exec": {"command": ["sh", "-c",
                "mongo --quiet --eval 'quit(db.isMaster().ismaster ? 0 : 1)' 2>/dev/null || "
                "mongosh --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'"]}, "periodSeconds": 5}
        else:
            container["readinessProbe"] = {"exec": {"command": ["redis-cli", "ping"]}, "periodSeconds": 5}
        pod = {"automountServiceAccountToken": False,
               "nodeSelector": {"kubernetes.io/hostname": config["node"]},
               "terminationGracePeriodSeconds": 180 if name in DATABASES else 60,
               "containers": [container], "volumes": volumes}
        items.append(resource("Deployment", name, {"replicas": int(apps_enabled or name in DATABASES),
                     "strategy": {"type": "Recreate"}, "selector": {"matchLabels": {"app": name}},
                     "template": {"metadata": {"labels": {"app": name}}, "spec": pod}}))
    return {"apiVersion": "v1", "kind": "List", "items": items}


class Deployment:
    def __init__(self, root, state, migrate):
        self.root, self.state, self.migrate = root, state, migrate
        self.journal_path = state / "journal.json"
        self.journal = json.loads(self.journal_path.read_text()) if self.journal_path.exists() else {}
        need(self.journal.get("status") in (None, "ready"),
             "Previous run is incomplete. Read its run.log and recovery guide; automatic re-import is blocked.")
        self.first = not self.journal
        self.run_dir = state / (time.strftime("run-%Y%m%dT%H%M%SZ", time.gmtime()) + f"-{os.getpid()}")
        self.run_dir.mkdir(mode=0o700)
        self.compose = ["docker", "compose", "--env-file", str(root / ".env"), "-f", str(root / "docker-compose.yml")]
        if (root / "docker-compose.override.yml").exists():
            self.compose += ["-f", str(root / "docker-compose.override.yml")]
        self.compose += ["-f", str(root / "docker-compose.prod.yml")]
        # Never use the user's current context or a remote cluster.
        self.kubectl = ["k3s", "kubectl", "--kubeconfig", "/etc/rancher/k3s/k3s.yaml"]
        self.containers = {}
        self.stage = "preflight"

    def phase(self, value):
        self.stage = value
        print(f"[{value}] Logs: {self.run_dir / 'run.log'}", flush=True)

    def k(self, *args, **kwargs):
        return run(self.kubectl + ["-n", NAMESPACE, *args], **kwargs)

    def apply(self, items):
        # kubectl does not print the Secret values; private manifests are retained for recovery.
        path = self.run_dir / "resources.json"
        write_json(path, items)
        self.k("apply", "-f", str(path))

    def preflight(self):
        need(not self.first or not (self.state / "data").exists(),
             "Target data already exists without a ready journal; review recovery before any cutover.")
        need((self.root / ".env").is_file(), "Missing existing server .env.")
        if (self.root / ".deploy-state").exists():
            ignore = (self.root / ".dockerignore").read_text().splitlines()
            patterns = {line.strip().rstrip("/") for line in ignore}
            need(bool(patterns & {".deploy-state", "**/.deploy-state"}) and
                 not any(line.startswith("!") for line in patterns),
                 "Exclude .deploy-state in .dockerignore (without re-inclusions) before sending builds.")
        need(Path("/run/systemd/system").is_dir(), "A systemd Linux host is required.")
        run(["docker", "info"])
        self.config = json.loads(run(self.compose + ["config", "--format", "json"], capture=True))
        validate_config(self.config)
        write_json(self.run_dir / "compose.json", self.config)
        shutil.copy2(self.root / ".env", self.run_dir / "env.backup")
        if self.journal:
            need(self.journal["root"] == str(self.root), "Use the original deployment checkout.")
            old_ports = self.journal["ports"]
            need(public_ports(self.config) == old_ports, "Published port changes need a reviewed cutover.")
        if self.first:
            need((os.cpu_count() or 0) >= 2, "At least 2 CPUs are required; 4+ recommended.")
            memory = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
            need(int(memory["MemTotal"].split()[0]) >= 8_000_000, "At least 8 GB RAM required for this stack/build.")
            need(int(memory["MemAvailable"].split()[0]) >= 2_000_000, "Need at least 2 GB available before adding K3s.")
            required_disk = 20 * 1024**3
            source_bytes = 0
            for name in APPS + DATABASES:
                cid = run(self.compose + ["ps", "-q", name], capture=True).strip()
                need(cid and "\n" not in cid, f"Expected one running existing Compose container: {name}")
                info = json.loads(run(["docker", "inspect", cid], capture=True))[0]
                need(info["State"]["Running"], f"Source container is not running: {name}")
                need(not info["State"].get("Health") or info["State"]["Health"]["Status"] == "healthy",
                     f"Source container is not healthy: {name}")
                actual = dict(item.split("=", 1) for item in info["Config"].get("Env", []) if "=" in item)
                if name in APPS:
                    expected_environment = env_of(self.config["services"][name])
                    for key in ("DATABASE_URL", "REDIS_URL"):
                        need(actual.get(key) == expected_environment.get(key),
                             f"{name}: runtime {key} differs from Compose; reconcile before migration.")
                    if name == "auth-service":
                        need(validate_storage_env(actual) == validate_storage_env(expected_environment),
                             "Auth runtime private-storage paths differ from Compose; reconcile before migration.")
                self.containers[name] = {"id": cid, "image": info["Image"],
                                         "restart_policy": info["HostConfig"]["RestartPolicy"]}
                if name == "postgres":
                    for key in ("POSTGRES_USER", "POSTGRES_PASSWORD", "PGDATA"):
                        expected = env_of(self.config["services"][name]).get(key)
                        need(actual.get(key) == expected or (key == "PGDATA" and expected is None and
                             actual.get(key) == "/var/lib/postgresql/data"),
                             f"PostgreSQL runtime {key} differs from Compose; reconcile before migration.")
                if name in APPS:
                    need(all(item["Destination"] in FILES.get(name, ()) for item in info["Mounts"]),
                         f"{name}: runtime mounts differ from the supported production layout.")
                for mount in FILES.get(name, ()):
                    if name == "redis":
                        continue  # Redis /data can live in the container's writable layer.
                    sources = [item for item in info["Mounts"] if item["Destination"] == mount]
                    need(len(sources) == 1, f"{name}: expected a persistent mount at {mount}")
                    source_bytes += int(run(["du", "-sb", sources[0]["Source"]], capture=True).split()[0])
            self.copy_bytes = source_bytes
            need(shutil.disk_usage(self.state).free >= max(required_disk, source_bytes * 3 + 10 * 1024**3),
                 "Insufficient free disk for snapshots, restored copies and image builds.")
            # Restrict to the replica-set topology whose hostname will remain valid in Kubernetes.
            mongo = self.containers["mongo"]["id"]
            script = 'var c=rs.conf(); if(c._id!=="rs0" || c.members.length!==1 || c.members[0].host!=="mongo:27017") quit(2);'
            self.mongo_shell(mongo, script, docker=True)
            pg = self.containers["postgres"]["id"]
            tablespaces = run(["docker", "exec", pg, "sh", "-c",
                'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT count(*) FROM pg_tablespace WHERE spcname NOT IN (\'pg_default\',\'pg_global\')"'], capture=True).strip()
            need(tablespaces == "0", "Custom PostgreSQL tablespaces need manual migration.")
            pg_directory = run(["docker", "exec", pg, "sh", "-c",
                'psql -U "$POSTGRES_USER" -d postgres -Atc "SHOW data_directory"'], capture=True).strip()
            need(posixpath.normpath(pg_directory) == posixpath.normpath(env_of(self.config["services"]["postgres"]).get("PGDATA", "/var/lib/postgresql/data")),
                 "PostgreSQL data_directory differs from the copied mount; manual migration required.")
            for setting, expected in (("appendonly", "no"), ("dir", "/data"), ("dbfilename", "dump.rdb")):
                redis_info = run(["docker", "exec", self.containers["redis"]["id"], "redis-cli", "CONFIG", "GET", setting], capture=True)
                need(redis_info.strip().splitlines() == [setting, expected], "Custom Redis persistence requires manual migration review.")
            write_json(self.run_dir / "source-containers.json", self.containers)
        else:
            # Do not accidentally restart stale Compose writers beside the live Kubernetes stack.
            for name in APPS:
                need(not run(self.compose + ["ps", "-q", name], capture=True).strip(),
                     "Compose application containers are running beside Kubernetes; resolve before deploy.")

    def mongo_shell(self, container, script, *, docker=False):
        command = "mongo --quiet --eval \"$SCRIPT\" 2>/dev/null || mongosh --quiet --eval \"$SCRIPT\""
        if docker:
            return run(["docker", "exec", "-e", "SCRIPT=" + script, container, "sh", "-c", command], capture=True)
        return self.k("exec", "deployment/mongo", "--", "sh", "-c", command.replace("$SCRIPT", "$1"), "sh", script, capture=True)

    def install(self):
        self.phase("k3s")
        if not shutil.which("k3s"):
            need(self.first and not Path("/etc/rancher/k3s").exists(), "Existing K3s configuration requires manual review.")
            routes = json.loads(run(["ip", "-j", "route"], capture=True))
            networks = [ipaddress.ip_network("10.42.0.0/16"), ipaddress.ip_network("10.43.0.0/16")]
            for route in routes:
                if route.get("dst", "default") == "default":
                    continue
                network = ipaddress.ip_network(route["dst"], strict=False)
                need(not any(network.overlaps(item) for item in networks), "K3s CIDR conflicts with an existing host route.")
            need(not run(["ss", "-H", "-ltn", "sport = :6443"], capture=True).strip(), "Port 6443 is already in use.")
            installer = self.run_dir / "install-k3s.sh"
            run(["curl", "--fail", "--silent", "--show-error", "--location", "--proto", "=https",
                 "--tlsv1.2", "https://get.k3s.io", "-o", str(installer)])
            # No bundled ingress/load-balancer: they must not take the existing site's 80/443.
            run(["sh", str(installer), "server", "--disable", "traefik", "--disable", "servicelb",
                 "--write-kubeconfig-mode", "600"])
        need(Path("/etc/rancher/k3s/k3s.yaml").is_file(), "Missing local K3s kubeconfig.")
        context = json.loads(run(self.kubectl + ["config", "view", "--minify", "-o", "json"], capture=True))
        endpoint = urlsplit(context["clusters"][0]["cluster"]["server"])
        need(endpoint.scheme == "https" and endpoint.hostname in ("127.0.0.1", "localhost", "::1"),
             "K3s kubeconfig must address this VM's loopback endpoint, not a remote cluster.")
        run(self.kubectl + ["wait", "node", "--all", "--for=condition=Ready", "--timeout=180s"])
        nodes = json.loads(run(self.kubectl + ["get", "nodes", "-o", "json"], capture=True))["items"]
        need(len(nodes) == 1, "This script supports exactly one local K3s node.")
        self.config["node"] = nodes[0]["metadata"]["labels"]["kubernetes.io/hostname"]
        namespaces = json.loads(run(self.kubectl + ["get", "namespaces", "-o", "json"], capture=True))["items"]
        existing = next((item for item in namespaces if item["metadata"]["name"] == NAMESPACE), None)
        if self.first:
            need(existing is None, "Production namespace already exists without a ready journal; review recovery.")
        else:
            need(existing and existing["metadata"].get("labels", {}).get("app.kubernetes.io/managed-by") == OWNER,
                 "Production namespace ownership does not match this script.")

    def build(self):
        self.phase("build-and-import")
        tag = self.run_dir.name.lower()
        self.images = {name: f"docker.io/reloop-production/{name}:{tag}" for name in APPS}
        override = self.run_dir / "build-images.json"
        write_json(override, {"services": {name: {"image": image} for name, image in self.images.items()}})
        run(self.compose + ["-f", str(override), "build", *APPS])
        for name in DATABASES:
            if self.first:
                source = self.containers[name]["image"]
                target = f"docker.io/reloop-production/{name}:{tag}"
                run(["docker", "tag", source, target])
                self.images[name] = target
            else:
                self.images[name] = self.journal["images"][name]
        archive = self.run_dir / "images.tar"
        run(["docker", "save", "-o", str(archive), *[self.images[name] for name in APPS + (DATABASES if self.first else ())]])
        run(["k3s", "ctr", "-n", "k8s.io", "images", "import", str(archive)])

    def mark_pending(self):
        self.journal.update(status="incomplete", root=str(self.root), run=str(self.run_dir),
                            ports=public_ports(self.config))
        save_journal(self.journal_path, self.journal)

    def stop_apps(self):
        self.phase("maintenance")
        if self.first:
            # An old restart=always policy must not resurrect stale writers after a VM reboot.
            run(["docker", "update", "--restart=no", *[self.containers[name]["id"] for name in APPS + DATABASES]])
            run(["docker", "stop", "-t", "180", *[self.containers[name]["id"] for name in APPS]])
        else:
            self.k("scale", "deployment", *APPS, "--replicas=0")
            for app in APPS:
                self.k("wait", "pod", "-l", f"app={app}", "--for=delete", "--timeout=180s")

    def copy_from_compose(self):
        self.phase("backup-and-cold-copy")
        # Stop all writers first. Logical backups supplement the exact-image cold archives.
        pg, mongo, redis = (self.containers[name]["id"] for name in DATABASES)
        run(["docker", "exec", pg, "sh", "-c", 'pg_dumpall -U "$POSTGRES_USER"'], output=self.run_dir / "postgres.sql")
        run(["docker", "exec", mongo, "mongodump", "--archive", "--gzip"], output=self.run_dir / "mongo.archive.gz")
        need((self.run_dir / "postgres.sql").stat().st_size and (self.run_dir / "mongo.archive.gz").stat().st_size,
             "Database backup is empty; sources remain preserved.")
        result = run(["docker", "exec", redis, "redis-cli", "SAVE"], capture=True).strip()
        need(result == "OK", "Redis SAVE failed.")
        run(["docker", "stop", "-t", "180", *[self.containers[name]["id"] for name in DATABASES]])
        for name in DATABASES:
            stopped = json.loads(run(["docker", "inspect", self.containers[name]["id"]], capture=True))[0]["State"]
            need(not stopped["Running"] and stopped["ExitCode"] == 0,
                 f"{name} did not shut down cleanly; review before copying.")
        self.snapshot(restore=True)

    def snapshot(self, *, restore):
        for name, paths in FILES.items():
            for index, source in enumerate(paths):
                label = snapshot_name(name, index)
                archive = self.run_dir / (label + ".tar")
                if self.first:
                    run(["docker", "cp", self.containers[name]["id"] + ":" + source + "/.", "-"], output=archive)
                else:
                    run(["tar", "-cpf", str(archive), "-C", str(self.state / "data" / label), "."])
                validate_data_archive(archive, name, self.config)
                if restore:
                    target = self.state / "data" / label
                    need(not target.exists(), "Target data directory already exists; refusing overwrite.")
                    target.mkdir(parents=True, mode=0o700)
                    run(["tar", "--extract", "--preserve-permissions", "--same-owner", "-f", str(archive), "-C", str(target)])
                    verify_archive(archive, target)
        checksums = []
        for path in sorted(self.run_dir.glob("*.tar")):
            with path.open("rb") as stream:
                checksum = hashlib.sha256()
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    checksum.update(chunk)
            checksums.append(f"{checksum.hexdigest()}  {path.name}")
        (self.run_dir / "SHA256SUMS").write_text("\n".join(checksums) + "\n")

    def wait_databases(self):
        for name in DATABASES:
            self.k("rollout", "status", "deployment/" + name, "--timeout=300s")

    def backup_kubernetes(self):
        self.phase("backup-kubernetes")
        # Flush durable state after writers stop, including Redis queues, before the cold snapshot.
        self.k("exec", "deployment/postgres", "--", "sh", "-c",
               'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c CHECKPOINT')
        self.mongo_shell(None, 'if(!db.adminCommand({fsync:1}).ok) quit(2);')
        need(self.k("exec", "deployment/redis", "--", "redis-cli", "SAVE", capture=True).strip() == "OK",
             "Redis SAVE failed; refusing an incomplete queue backup.")
        self.k("scale", "deployment", *DATABASES, "--replicas=0")
        for name in DATABASES:
            self.k("wait", "pod", "-l", f"app={name}", "--for=delete", "--timeout=240s")
        self.snapshot(restore=False)
        self.k("scale", "deployment", *DATABASES, "--replicas=1")
        self.wait_databases()

    def migration(self, name, command, suffix):
        job_name = f"{name}-{suffix}-{self.run_dir.name.lower()}"
        secret_name = job_name + "-env"
        self.apply(resource("Secret", secret_name, type="Opaque",
                            stringData=environment(name, self.config["services"][name])))
        container = {"name": "migration", "image": self.images[name], "imagePullPolicy": "Never",
                     "command": command, "envFrom": [{"secretRef": {"name": secret_name}}]}
        job = resource("Job", job_name, {"backoffLimit": 0, "activeDeadlineSeconds": 600,
            "template": {"spec": {"automountServiceAccountToken": False, "restartPolicy": "Never",
            "nodeSelector": {"kubernetes.io/hostname": self.config["node"]}, "containers": [container]}}})
        self.apply(job)
        try:
            self.k("wait", "--for=condition=complete", "job/" + job_name, "--timeout=620s")
        finally:
            self.k("logs", "job/" + job_name)
        self.k("delete", "job", job_name)
        self.k("delete", "secret", secret_name)

    def check_migrations(self):
        for name in APPS[:4]:
            self.migration(name, ["npx", "prisma", "migrate", "status"], "status")

    def schema_fingerprint(self):
        checksum = hashlib.sha256()
        paths = [self.root / "backend" / "services" / name / "prisma" for name in APPS[:5]]
        paths += [self.root / "infra" / "postgres", self.root / "infra" / "mongo"]
        for path in paths:
            for file in sorted(path.rglob("*")):
                if file.is_file():
                    checksum.update(str(file.relative_to(self.root)).encode())
                    checksum.update(file.read_bytes())
        return checksum.hexdigest()

    def deploy(self):
        self.preflight()
        fingerprint = self.schema_fingerprint()
        if not self.first and not self.migrate:
            need(self.journal["schema"] == fingerprint, "Database-related files changed. Review and rerun with --migrate.")
        self.install()
        self.build()
        # On ordinary updates, check actual migration history before stopping the running apps.
        if not self.first and not self.migrate:
            self.check_migrations()
        data_root = self.state / "data"
        data_bytes = int(run(["du", "-sb", str(data_root)], capture=True).split()[0]) if data_root.exists() else 0
        snapshot_bytes = (2 * getattr(self, "copy_bytes", 0) if self.first
                          else data_bytes if self.migrate else 0)
        need(shutil.disk_usage(self.state).free >= max(10 * 1024**3, snapshot_bytes + 2 * 1024**3),
             "Not enough disk left after image build for a safe backup.")
        self.mark_pending()
        if self.first:
            ns = resource("Namespace", NAMESPACE)
            ns["metadata"].pop("namespace")
            self.apply(ns)
        self.stop_apps()
        if self.first:
            self.copy_from_compose()
        elif self.migrate:
            self.backup_kubernetes()
        self.phase("databases")
        self.apply(manifests(self.config, self.images, self.state, apps_enabled=False))
        self.wait_databases()
        self.phase("migration")
        if self.migrate:
            for name in APPS[:4]:
                self.migration(name, ["node", "prisma/migrate.js"], "migrate")
            self.migration("chat-service", ["npx", "prisma", "db", "push", "--skip-generate"], "migrate")
        self.check_migrations()
        self.phase("start-and-health")
        self.apply(manifests(self.config, self.images, self.state, apps_enabled=True))
        for name in APPS:
            self.k("rollout", "status", "deployment/" + name, "--timeout=600s")
        script = ('fetch("http://127.0.0.1:8080/api/products/feed?limit=1",{signal:AbortSignal.timeout(10000)})'
                  '.then(async r=>{if(!r.ok)throw Error("HTTP "+r.status);'
                  'if(!Array.isArray((await r.json()).items))throw Error("Invalid feed")})'
                  '.catch(e=>{console.error(e.message);process.exit(1)})')
        self.k("exec", "deployment/gateway", "--", "node", "-e", script)
        self.k("exec", "deployment/frontend", "--", "node", "-e",
               'if(process.env.NODE_ENV!=="production")process.exit(1)')
        check_host_ports(self.config)
        self.journal.update(status="ready", images=self.images, schema=fingerprint,
                            previous_run=self.journal.get("last_success"), last_success=str(self.run_dir))
        save_journal(self.journal_path, self.journal)
        self.k("get", "pods", "-o", "wide")
        print(f"Deploy OK (Kubernetes): {NAMESPACE}. Private backups/logs: {self.run_dir}")


def main():
    global LOG
    need(len(sys.argv) in (3, 4) and (len(sys.argv) == 3 or sys.argv[3] == "--migrate"),
         "Usage: bash deploy/production-cloud/deploy-k8s.sh [--migrate]")
    root, state = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    need(not state.is_relative_to(root), "State/backups must be outside the checkout.")
    deployment = Deployment(root, state, len(sys.argv) == 4)
    with (deployment.run_dir / "run.log").open("ab", buffering=0) as log:
        LOG = log
        try:
            deployment.deploy()
        except (Blocked, OSError, ValueError, KeyError, tarfile.TarError, KeyboardInterrupt) as error:
            print(f"Deploy FAILED during {deployment.stage}: {error}", file=sys.stderr)
            print(f"Inspect {deployment.run_dir}. Nothing was deleted; no automatic rollback was attempted.", file=sys.stderr)
            print("Services may be stopped. Read deploy/production-cloud/README.md before recovery.", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (Blocked, OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
