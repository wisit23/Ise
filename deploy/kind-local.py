"""Persistent localhost access for the existing single-node development cluster.

Migration copies stopped PVC files into a separate kind cluster. It never deletes
the source cluster. Backups contain Secrets: keep .deploy-state private.
"""
import argparse
import copy
import datetime
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "reloop-local"
TARGET = "reloop-local-fixed"
NS = "reloop"
NODE = TARGET + "-control-plane"
STATE = ROOT / ".deploy-state" / "kind-local"
PORTS = {"frontend": (3000, 30080), "gateway": (8080, 30081)}
MONGO_COMMAND = ["sh", "-c", 'until getent hosts "$(hostname).mongo" >/dev/null; do sleep 2; done; exec docker-entrypoint.sh "$@"', "--"]


def run(*args, data=None, output=None):
    result = subprocess.run(args, input=data, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE)
    if result.returncode:
        # Never print stdin: Kubernetes resource documents can contain Secrets.
        raise RuntimeError(f"{' '.join(args[:6])} failed: " + result.stderr.decode(errors="replace"))
    return result.stdout.decode() if output is None else None


def kube(cluster, *args, data=None):
    return run("kubectl", "--context", "kind-" + cluster, "-n", NS, *args, data=data)


def get(cluster, resource):
    return json.loads(kube(cluster, "get", resource, "-o", "json"))


def apply(cluster, items):
    kube(cluster, "apply", "-f", "-", data=json.dumps({"apiVersion": "v1", "kind": "List", "items": items}).encode())


def clean(item):
    item = copy.deepcopy(item)
    item.pop("status", None)
    metadata = item["metadata"]
    for key in ("uid", "resourceVersion", "creationTimestamp", "generation", "managedFields", "ownerReferences", "finalizers"):
        metadata.pop(key, None)
    metadata.pop("annotations", None)
    if item["kind"] == "PersistentVolumeClaim":
        item["spec"].pop("volumeName", None)
    if item["kind"] == "Service":
        spec = item["spec"]
        if spec.get("clusterIP") != "None":
            spec.pop("clusterIP", None)
            spec.pop("clusterIPs", None)
        else:
            spec.pop("clusterIPs", None)
        if metadata["name"] in PORTS:
            port, node_port = PORTS[metadata["name"]]
            spec["type"] = "NodePort"
            spec["ports"] = [{"name": "tcp", "port": port, "targetPort": port, "nodePort": node_port}]
    return item


def volume_paths(cluster):
    result = {}
    for pv in get(cluster, "pv")["items"]:
        claim = pv["spec"].get("claimRef", {})
        if claim.get("namespace") != NS:
            continue
        path = pv["spec"].get("hostPath", {}).get("path", "")
        if not path.startswith("/var/local-path-provisioner/") or ".." in path.split("/"):
            raise RuntimeError("Unsupported storage path; migration only supports kind local-path PVCs")
        result[claim["name"]] = path
    return result


def wait_http(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            with opener.open(url, timeout=5) as response:
                if response.status == 200:
                    print(f"HTTP 200 {url}", flush=True)
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    raise RuntimeError(f"HTTP check failed: {url}")


def start():
    info = json.loads(run("docker", "inspect", NODE))[0]
    if info["Config"].get("Labels", {}).get("io.x-k8s.kind.cluster") != TARGET:
        raise RuntimeError("Target container is not owned by the expected kind cluster")
    bindings = info["HostConfig"]["PortBindings"]
    for _, (host_port, node_port) in PORTS.items():
        if {"HostIp": "127.0.0.1", "HostPort": str(host_port)} not in bindings.get(f"{node_port}/tcp", []):
            raise RuntimeError("Target node does not have the expected localhost port mappings")
    run("docker", "update", "--restart", "unless-stopped", NODE)
    run("docker", "start", NODE)
    deadline = time.monotonic() + 180
    while True:
        try:
            services = get(TARGET, "services")["items"]
            break
        except RuntimeError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(2)
    # Reapplying the development base can restore ClusterIP Services. Repair
    # only these two ports, preserving Service identity and all other fields.
    for name, (port, node_port) in PORTS.items():
        matching = [item for item in services if item["metadata"]["name"] == name]
        if len(matching) != 1:
            raise RuntimeError("Missing Service: " + name)
        service = matching[0]
        spec = service["spec"]
        if spec.get("selector", {}).get("app") != name or len(spec["ports"]) != 1 or spec["ports"][0]["port"] != port:
            raise RuntimeError("Unexpected Service configuration: " + name)
        if spec["type"] != "NodePort" or spec["ports"][0].get("nodePort") != node_port:
            spec["type"] = "NodePort"
            spec["ports"][0]["nodePort"] = node_port
            kube(TARGET, "replace", "-f", "-", data=json.dumps(service).encode())
    mongo = get(TARGET, "statefulset/mongo")
    container = mongo["spec"]["template"]["spec"]["containers"][0]
    if container.get("command") != MONGO_COMMAND:
        if container.get("command") or container.get("args") != ["--replSet", "rs0", "--bind_ip_all"]:
            raise RuntimeError("Unexpected MongoDB startup command; refusing to replace it")
        container["command"] = MONGO_COMMAND
        kube(TARGET, "replace", "-f", "-", data=json.dumps(mongo).encode())
        # An unready StatefulSet Pod can block its own rolling update. Replace
        # the Pod once when installing the guard; its PVC is retained.
        kube(TARGET, "delete", "pod", "mongo-0", "--ignore-not-found=true", "--wait=true")
    for name in ("statefulset/postgres", "statefulset/mongo", "deployment/redis"):
        kube(TARGET, "rollout", "status", name, "--timeout=180s")
    for item in get(TARGET, "deployments")["items"]:
        kube(TARGET, "rollout", "status", "deployment/" + item["metadata"]["name"], "--timeout=300s")
    for url in ("http://localhost:3000", "http://localhost:8080/health", "http://localhost:8080/api/products/feed?limit=1"):
        wait_http(url)
    print("Ready. No port-forward or separate proxy container is needed.", flush=True)


def migrate():
    clusters = run("kind", "get", "clusters").split()
    if TARGET in clusters:
        raise RuntimeError("Target cluster already exists. Run without -Migrate to start it; migration will never overwrite it.")
    if SOURCE not in clusters:
        raise RuntimeError("Source cluster reloop-local was not found")
    # A free bind proves no unrelated process will be displaced. Stop the old
    # port-forward explicitly before running this script.
    for port in (3000, 8080):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", port))
    nodes = json.loads(run("kubectl", "--context", "kind-" + SOURCE, "get", "nodes", "-o", "json"))["items"]
    if len(nodes) != 1 or nodes[0]["metadata"]["name"] != SOURCE + "-control-plane":
        raise RuntimeError("Only the existing single-node reloop-local cluster is supported")
    node_image = json.loads(run("docker", "inspect", SOURCE + "-control-plane"))[0]["Config"]["Image"]
    resources = get(SOURCE, "configmaps,secrets,services,persistentvolumeclaims,deployments,statefulsets")["items"]
    resources = [clean(item) for item in resources if item["metadata"]["name"] != "kube-root-ca.crt"]
    workloads = [item for item in resources if item["kind"] in ("Deployment", "StatefulSet")]
    if not workloads or not any(item["spec"].get("replicas", 1) > 0 for item in workloads):
        raise RuntimeError("Source workloads are already stopped. Recover the previous migration before retrying.")
    images = sorted({c["image"] for item in workloads for c in item["spec"]["template"]["spec"]["containers"] if c["image"].startswith("reloop/")})
    for image in images:
        run("docker", "image", "inspect", image)
    paths = volume_paths(SOURCE)
    claims = {item["metadata"]["name"] for item in resources if item["kind"] == "PersistentVolumeClaim"}
    if claims != set(paths):
        raise RuntimeError("Every PVC must be bound before copying")
    STATE.mkdir(parents=True, exist_ok=True)
    backup = STATE / datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup.mkdir()
    (backup / "resources.json").write_text(json.dumps(resources, indent=2), encoding="utf-8")
    print(f"Backup directory: {backup}", flush=True)
    # Stop writers before databases so the filesystem copies are consistent.
    for kind in ("Deployment", "StatefulSet"):
        for item in workloads:
            if item["kind"] == kind:
                kube(SOURCE, "scale", kind.lower() + "/" + item["metadata"]["name"], "--replicas=0")
        for item in workloads:
            if item["kind"] == kind:
                selector = item["spec"]["selector"]["matchLabels"]
                kube(SOURCE, "wait", "--for=delete", "pod", "-l", ",".join(f"{k}={v}" for k, v in selector.items()), "--timeout=180s")
    checksums = {}
    for claim, path in paths.items():
        archive = backup / (claim + ".tar")
        with archive.open("wb") as output:
            run("docker", "exec", SOURCE + "-control-plane", "tar", "--sort=name", "--numeric-owner", "-C", path, "-cpf", "-", ".", output=output)
        with archive.open("rb") as source:
            checksums[claim] = hashlib.file_digest(source, "sha256").hexdigest()
    (backup / "sha256.json").write_text(json.dumps(checksums, indent=2), encoding="utf-8")
    # The old node and its volumes remain intact for rollback; stop it to avoid
    # two full clusters competing for Docker Desktop's memory.
    run("docker", "stop", SOURCE + "-control-plane")
    config = backup / "kind.yaml"
    config.write_bytes(Path(__file__).with_suffix(".yaml").read_bytes())
    print("Creating cluster with permanent port mappings...", flush=True)
    run("kind", "create", "cluster", "--name", TARGET, "--image", node_image, "--config", str(config), "--wait", "180s")
    print("Loading the source application's Docker images...", flush=True)
    run("kind", "load", "docker-image", *images, "--name", TARGET)
    restore(backup, resources)


def restore(backup, resources):
    """Restore only before any target workloads have been created."""
    claims = {item["metadata"]["name"] for item in resources if item["kind"] == "PersistentVolumeClaim"}
    workloads = [item for item in resources if item["kind"] in ("Deployment", "StatefulSet")]
    for item in workloads:
        if item["kind"] == "StatefulSet" and item["metadata"]["name"] == "mongo":
            container = item["spec"]["template"]["spec"]["containers"][0]
            if not container.get("command") and container.get("args") == ["--replSet", "rs0", "--bind_ip_all"]:
                container["command"] = MONGO_COMMAND
    checksums = json.loads((backup / "sha256.json").read_text(encoding="utf-8"))
    apply(TARGET, [{"apiVersion": "v1", "kind": "Namespace", "metadata": {"name": NS}}])
    apply(TARGET, [item for item in resources if item["kind"] not in ("Deployment", "StatefulSet")])
    # WaitForFirstConsumer needs a scheduled Pod to provision PVC directories.
    pod = {"apiVersion": "v1", "kind": "Pod", "metadata": {"name": "volume-restore", "namespace": NS}, "spec": {
        "containers": [{"name": "hold", "image": "registry.k8s.io/pause:3.10", "volumeMounts": [
            {"name": "v" + str(i), "mountPath": "/restore/" + claim} for i, claim in enumerate(sorted(claims))]}],
        "volumes": [{"name": "v" + str(i), "persistentVolumeClaim": {"claimName": claim}} for i, claim in enumerate(sorted(claims))]}}
    apply(TARGET, [pod])
    print("Provisioning target PVCs...", flush=True)
    kube(TARGET, "wait", "--for=condition=Ready", "pod/volume-restore", "--timeout=180s")
    target_paths = volume_paths(TARGET)
    if set(target_paths) != claims:
        raise RuntimeError("Target PVC mapping is incomplete")
    kube(TARGET, "delete", "pod", "volume-restore", "--wait=true")
    for claim, path in target_paths.items():
        archive = backup / (claim + ".tar")
        with archive.open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != checksums[claim]:
                raise RuntimeError("Backup checksum mismatch: " + claim)
        # kind's /tmp is a separate mount; Docker cp can write underneath it.
        # Use the node's root filesystem so exec sees the same archive.
        run("docker", "cp", str(archive), NODE + ":/reloop-restore.tar")
        run("docker", "exec", NODE, "tar", "-C", path, "-xpf", "/reloop-restore.tar")
        run("docker", "exec", NODE, "rm", "/reloop-restore.tar")
        restored = backup / (claim + ".restored.tar")
        with restored.open("wb") as output:
            run("docker", "exec", NODE, "tar", "--sort=name", "--numeric-owner", "-C", path, "-cpf", "-", ".", output=output)
        with restored.open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != checksums[claim]:
                raise RuntimeError("Restored PVC differs from backup: " + claim)
        print("Verified PVC: " + claim, flush=True)
    apply(TARGET, [item for item in workloads if item["kind"] == "StatefulSet" or item["metadata"]["name"] == "redis"])
    print("Starting restored databases...", flush=True)
    for name in ("statefulset/postgres", "statefulset/mongo", "deployment/redis"):
        kube(TARGET, "rollout", "status", name, "--timeout=180s")
    apply(TARGET, [item for item in workloads if item["kind"] == "Deployment" and item["metadata"]["name"] != "redis"])
    print("Starting application Deployments...", flush=True)
    for item in workloads:
        kube(TARGET, "rollout", "status", item["kind"].lower() + "/" + item["metadata"]["name"], "--timeout=300s")
    (STATE / "last-backup.txt").write_text(str(backup), encoding="utf-8")
    start()


def resume(backup):
    backup = backup.resolve()
    if STATE.resolve() not in backup.parents:
        raise RuntimeError("Resume requires a backup inside .deploy-state/kind-local")
    info = json.loads(run("docker", "inspect", NODE))[0]
    if info["Config"].get("Labels", {}).get("io.x-k8s.kind.cluster") != TARGET:
        raise RuntimeError("Target container is not owned by the expected kind cluster")
    if get(TARGET, "deployments,statefulsets")["items"]:
        raise RuntimeError("Target workloads already exist; refusing to overwrite their data")
    source = json.loads(run("docker", "inspect", SOURCE + "-control-plane"))[0]
    if source["State"]["Running"]:
        raise RuntimeError("Source node must remain stopped while resuming restore")
    resources = json.loads((backup / "resources.json").read_text(encoding="utf-8"))
    restore(backup, resources)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--migrate", action="store_true", help="Copy the stopped source into a NEW cluster; keeps source for rollback")
    mode.add_argument("--resume", type=Path, help="Resume a backup restore before target workloads exist")
    args = parser.parse_args()
    try:
        if args.migrate:
            migrate()
        elif args.resume:
            resume(args.resume)
        else:
            start()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\nSource cluster and backup were not deleted. See deploy/kind-local.md for recovery.\n")
