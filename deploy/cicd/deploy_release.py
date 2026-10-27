"""Deploy immutable releases into an already initialized cloud K3s installation.

Installed by the operator as a root-owned command, invoked over stdin by a dedicated
deployment runner. It never installs K3s, resets data, checks out main or builds.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import sys

import release as contract
import smoke

SPEC = importlib.util.spec_from_file_location("cloud_deployment", Path(__file__).parents[1] / "production-cloud" / "k8s-production.py")
cloud = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cloud)
GIB = 1024 ** 3


def pull_budget(settings):
    value = settings.get("image_pull_budget_gib", 4)
    contract.require(type(value) is int and value >= 1, "image_pull_budget_gib must be a positive integer")
    return value * GIB


def configuration(path, environment):
    info = path.stat()
    contract.require(info.st_uid == 0 and info.st_mode & 0o022 == 0, "Deployment config must be root-owned and not writable by others")
    value = json.loads(path.read_text())
    contract.require(value.get("environment") == environment == "production", "Environment mismatch")
    contract.require(value.get("same_origin_verified") is True, "Verify same-origin API/WebSocket proxy before enabling CD")
    contract.require(value.get("enabled") is True, "CD is disabled in server configuration")
    contract.require(value.get("namespace") == cloud.NAMESPACE, "This release path uses the existing reloop-production namespace")
    pull_budget(value)
    contract.require(Path(value.get("image_store", "/var/lib/rancher/k3s/agent/containerd")).is_absolute(),
                     "image_store must be an absolute containerd storage path")
    contract.require(Path(value["root"]).is_absolute() and Path(value["state"]).is_absolute(), "Root and state must be absolute paths")
    contract.require(not Path(value["state"]).resolve().is_relative_to(Path(value["root"]).resolve()), "State must be outside the checkout")
    for directory in (Path(value["root"]).resolve(), Path(value["state"]).resolve()):
        for parent in (directory, *directory.parents):
            info = parent.stat()
            contract.require(info.st_uid == 0 and info.st_mode & 0o022 == 0,
                             "Deployment checkout/state and their parents must be protected from runner writes")
    if value.get("pull_secret"):
        contract.require(bool(re.fullmatch(r"[a-z0-9]([-a-z0-9]*[a-z0-9])?", value["pull_secret"])), "Invalid registry pull-secret name")
    return value


class ReleaseDeployment(cloud.Deployment):
    def __init__(self, settings, release, mode, migrate):
        self.settings, self.release, self.mode = settings, contract.validate(release), mode
        contract.require(mode in ("promote", "rollback"), "Invalid deployment mode")
        root, state = Path(settings["root"]).resolve(), Path(settings["state"]).resolve()
        previous = json.loads((state / "journal.json").read_text())
        cloud.need(previous.get("status") == "ready", "Initialize K3s manually or recover its incomplete run before CD")
        cloud.need(not migrate or mode == "promote", "Rollback cannot run migrations")
        cloud.need(not migrate or settings.get("migration_backup_verified") is True,
                   "Verify off-VM backup/restore and external-writer maintenance before enabling migrations")
        super().__init__(root, state, migrate)
        self.previous_journal = copy.deepcopy(self.journal)
        cloud.write_json(self.run_dir / "previous-journal.json", self.previous_journal)
        cloud.write_json(self.run_dir / "release.json", release)

    def preflight(self):
        if self.migrate:
            self.backup_exporter()
        super().preflight()
        expected_arch = {"x86_64": "linux/amd64", "aarch64": "linux/arm64"}.get(platform.machine())
        cloud.need(expected_arch == self.release["platform"], "Release platform does not match this VM")
        cloud.need(contract.git(self.root, "remote", "get-url", "origin").decode().strip() in (
            "https://github.com/wisit23/Ise", "https://github.com/wisit23/Ise.git", "git@github.com:wisit23/Ise.git"),
            "Unexpected source repository")
        # Fetch metadata only. Do not advance a live checkout to main while deploying an older release.
        cloud.run(["git", "-C", str(self.root), "fetch", "origin", "refs/heads/main:refs/remotes/origin/main"])
        commit = self.release["commit"]
        cloud.run(["git", "-C", str(self.root), "merge-base", "--is-ancestor", commit, "refs/remotes/origin/main"])
        cloud.need(contract.schema_fingerprint(self.root, commit) == self.release["schema"], "Release schema fingerprint differs from source")
        self.config["registry_apps"] = list(cloud.APPS)
        self.config["registry_pull_secret"] = self.settings.get("pull_secret")
        # The immutable frontend uses the site's origin, independently of legacy build settings.
        self.config["services"]["frontend"]["environment"]["NEXT_PUBLIC_API_URL"] = ""
        self.config["services"]["frontend"]["build"]["args"]["NEXT_PUBLIC_API_URL"] = ""
        previous_release = self.journal.get("release")
        if self.mode == "rollback":
            cloud.need(previous_release and self.release["schema"] == self.journal["schema"],
                       "Rollback requires a recorded release and unchanged schema; review database recovery instead")
            previous_run = self.journal.get("previous_run")
            cloud.need(previous_run and Path(previous_run).resolve().parent == self.state.resolve(), "No recorded previous release")
            recorded = contract.load(Path(previous_run) / "release.json")
            cloud.need(recorded == self.release, "Rollback target must exactly match the previous successful release")
            self.rollback_config = json.loads((Path(previous_run) / "compose.json").read_text())
        elif previous_release:
            cloud.run(["git", "-C", str(self.root), "merge-base", "--is-ancestor", previous_release["commit"], commit])
        cloud.write_json(self.run_dir / "compose.json", self.config)
        smoke.check(self.settings["public_url"])

    def install(self):
        # This calls only the existing-cluster validation: __init__ forbids first install.
        super().install()
        if self.mode == "rollback":
            cloud.need(self.rollback_config == self.config,
                       "Config changed since the rollback target; reviewed recovery is required")
        cloud.write_json(self.run_dir / "compose.json", self.config)

    def schema_fingerprint(self):
        return self.release["schema"]

    def backup_exporter(self):
        exporter = Path("/usr/local/sbin/ise-backup-export")
        info = exporter.stat()
        cloud.need(info.st_uid == 0 and info.st_mode & 0o022 == 0 and os.access(exporter, os.X_OK),
                   "Backup exporter must be executable, root-owned and protected")
        return exporter

    def backup_kubernetes(self):
        super().backup_kubernetes()
        # Installed and reviewed by the operator. Failure keeps writers stopped.
        exporter = self.backup_exporter()
        cloud.run([str(exporter), str(self.run_dir)])

    def build(self):
        self.phase("pull-release-images")
        self.check_disk_space(pulling=True)
        self.images = {**self.journal["images"], **self.release["images"]}
        # Pull and run the exact images before stopping any live application.
        # Kubernetes handles authentication through the operator-provisioned pull secret.
        for index, name in enumerate(cloud.APPS):
            job_name = f"release-pull-{self.run_dir.name.lower()}-{index}"
            pod = {"automountServiceAccountToken": False, "restartPolicy": "Never",
                   "nodeSelector": {"kubernetes.io/hostname": self.config["node"]},
                   "containers": [{"name": "check", "image": self.images[name], "imagePullPolicy": "IfNotPresent",
                       "command": ["node", "-e", 'if(process.versions.node.split(".")[0]!=="24")process.exit(1);require.resolve(process.argv[1]);',
                                   "next" if name == "frontend" else "@reloop/shared"]}]}
            if self.settings.get("pull_secret"):
                pod["imagePullSecrets"] = [{"name": self.settings["pull_secret"]}]
            self.apply(cloud.resource("Job", job_name, {"backoffLimit": 0, "activeDeadlineSeconds": 300,
                       "ttlSecondsAfterFinished": 86400, "template": {"spec": pod}}))
            self.k("wait", "--for=condition=complete", "job/" + job_name, "--timeout=320s")
            self.k("delete", "job", job_name)
            self.check_disk_space()

    def check_disk_space(self, *, pulling=False):
        image_store = Path(self.settings.get("image_store", "/var/lib/rancher/k3s/agent/containerd"))
        cloud.need(image_store.is_dir(), "K3s image storage is missing; configure image_store before CD")
        # Match the legacy post-pull reserve, including a cold snapshot for migrations.
        data = self.state / "data"
        snapshot = int(cloud.run(["du", "-sb", str(data)], capture=True).split()[0]) if self.migrate and data.exists() else 0
        state_reserve = max(10 * GIB, snapshot + 2 * GIB)
        budget = pull_budget(self.settings) if pulling else 0
        same_disk = image_store.stat().st_dev == self.state.stat().st_dev
        required = {self.state: state_reserve + (budget if same_disk else 0)}
        if not same_disk:
            required[image_store] = 10 * GIB + budget
        for directory, needed in required.items():
            free = shutil.disk_usage(directory).free
            cloud.need(free >= needed,
                       f"Insufficient disk space at {directory}: {free / GIB:.1f} GiB free, "
                       f"{needed / GIB:.1f} GiB required. Live apps were not stopped; no images/data/backups were deleted.")

    def verify_deployment(self):
        super().verify_deployment()
        self.phase("public-smoke")
        smoke.check(self.settings["public_url"])
        for name in cloud.APPS:
            deployed = json.loads(self.k("get", "deployment/" + name, "-o", "json", capture=True))
            cloud.need(deployed["spec"]["template"]["spec"]["containers"][0]["image"] == self.images[name],
                       "Deployment image reference does not match the approved digest")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("environment", choices=("production",))
    parser.add_argument("mode", choices=("promote", "rollback"))
    parser.add_argument("migration", choices=("no-migrate", "migrate"))
    args = parser.parse_args()
    cloud.need(os.geteuid() == 0, "Run via the installed deployment command")
    settings = configuration(Path("/etc/ise-cicd.json"), args.environment)
    raw = sys.stdin.read(32769)
    cloud.need(len(raw) <= 32768, "Release manifest is too large")
    value = contract.validate(json.loads(raw))
    # Serialize with the existing manual deployment locks for the whole operation.
    import fcntl
    locks = []
    try:
        for directory in (Path(settings["state"]), Path(settings["root"]) / ".deploy-state"):
            cloud.need(directory.is_dir(), "Existing deployment state directory is required")
            stream = (directory / "lock").open("a")
            locks.append(stream)
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deployment = ReleaseDeployment(settings, value, args.mode, args.migration == "migrate")
        with (deployment.run_dir / "run.log").open("ab", buffering=0) as log:
            cloud.LOG = log
            try:
                deployment.deploy()
            except BaseException:
                import traceback
                log.write(traceback.format_exc().encode())
                print(f"Deployment failed during {deployment.stage}. Private diagnostics: {deployment.run_dir}", file=sys.stderr)
                raise
            finally:
                cloud.LOG = None
    finally:
        for stream in locks:
            stream.close()


if __name__ == "__main__":
    try:
        main()
    except (cloud.Blocked, OSError, ValueError, KeyError, KeyboardInterrupt):
        # Resolved configuration can contain secrets: detailed diagnostics stay on the VM.
        print("Deploy failed. Inspect the private deployment run.log/journal; no automatic rollback or data reset was attempted.", file=sys.stderr)
        sys.exit(1)
