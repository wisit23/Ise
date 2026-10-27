"""Deploy failure regressions; no real Docker, cluster or production data."""
import json
from contextlib import redirect_stdout
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch, Mock

from test_k8s_production import fixture, m


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "checkout"
        self.state = Path(self.temp.name) / "state"
        self.root.mkdir()
        self.state.mkdir()
        self.instance = m.Deployment(self.root, self.state, False)
        self.instance.config = fixture()
        self.instance.images = {n: "docker.io/reloop-production/" + n + ":" +
                                self.instance.run_dir.name.lower() for n in m.APPS}
        self.instance._build_storage_paths = [self.state]
        self.instance._build_disk_reserve = 10 * 1024**3
        (self.state / "build-cache/prisma").mkdir(parents=True)
        (self.root / "Dockerfile").write_text("FROM node:22-alpine\nRUN npm install\n")
        for service in self.instance.config["services"].values():
            if "build" in service:
                service["build"]["context"] = str(self.root)

    def test_low_disk_blocks_build_before_starting_docker(self):
        builds = []
        def command(args, **kwargs):
            if "build" in args:
                builds.append(args)
            return ""
        with patch.object(m.shutil, "disk_usage", return_value=shutil._ntuple_diskusage(
                50 * 1024**3, 49 * 1024**3, 1024**3)), patch.object(m, "run", side_effect=command):
            with self.assertRaisesRegex(m.Blocked, "disk|space"):
                self.instance.build_apps()
        self.assertEqual(builds, [])

    def test_stopping_apps_does_not_wait_for_evicted_history(self):
        self.instance.first = False
        waits = []
        def kubectl(*args, **kwargs):
            if args[0] == "get":
                return json.dumps({"items": [
                    {"metadata": {"name": "old-evicted"}, "status": {"phase": "Failed"}},
                    {"metadata": {"name": "old-completed"}, "status": {"phase": "Succeeded"}},
                    {"metadata": {"name": "live-terminating"}, "status": {"phase": "Running"}},
                ]})
            if args[0] == "wait":
                waits.append(args)
            return ""
        with patch.object(self.instance, "k", side_effect=kubectl):
            self.instance.stop_apps()
        self.assertTrue(waits)
        for args in waits:
            self.assertIn("pod/live-terminating", args)
            self.assertNotIn("-l", args)
            self.assertNotIn("old-evicted", str(args))

    def test_only_terminal_pods_need_no_delete_wait(self):
        with patch.object(self.instance, "k", return_value=json.dumps({"items": [
                {"metadata": {"name": "old"}, "status": {"phase": "Failed"}}]})) as command:
            self.instance.wait_for_stopped_pods("auth-service", timeout=180)
        self.assertEqual(command.call_count, 1)
        self.assertEqual(command.call_args.args[0], "get")

    def test_low_import_space_blocks_both_processes(self):
        with patch.object(m, "run", return_value=json.dumps([{"Size": 2 * m.GIB}])), \
             patch.object(m.shutil, "disk_usage", return_value=shutil._ntuple_diskusage(50*m.GIB, 37*m.GIB, 13*m.GIB)), \
             patch.object(m.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(m.Blocked, "disk space"):
                self.instance.import_images(["auth-service"])
        spawn.assert_not_called()

    def test_checks_other_storage_filesystems(self):
        other = self.state / "other-storage"
        other.mkdir()
        self.instance._build_storage_paths.append(other)
        def usage(path):
            free = m.GIB if path == other else 30*m.GIB
            return shutil._ntuple_diskusage(50*m.GIB, 50*m.GIB-free, free)
        with patch.object(m.shutil, "disk_usage", side_effect=usage):
            with self.assertRaisesRegex(m.Blocked, "other-storage"):
                self.instance.check_build_disk_space()

    def test_quiet_build_is_interrupted_when_reserve_drops(self):
        count, children = [0], []
        marker = self.state / "must-not-complete"
        real_popen = subprocess.Popen
        def spawn(*args, **kwargs):
            child = real_popen(*args, **kwargs)
            children.append(child)
            return child
        def check():
            count[0] += 1
            if count[0] > 1:
                raise m.Blocked("disk reserve reached")
        script = "import time,pathlib; time.sleep(30); pathlib.Path(" + repr(str(marker)) + ").touch()"
        started = time.monotonic()
        with patch.object(m, "DISK_POLL_SECONDS", 0.05), patch.object(m.subprocess, "Popen", side_effect=spawn), \
             redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(m.Blocked, "disk reserve reached"):
                m.run([sys.executable, "-c", script], check_space=check)
        self.assertLess(time.monotonic()-started, 5)
        self.assertIsNotNone(children[0].poll())
        self.assertFalse(marker.exists())

    def test_import_monitor_stops_both_real_processes(self):
        children = [subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"],
                    start_new_session=os.name == "posix") for _ in range(2)]
        try:
            with patch.object(m, "DISK_POLL_SECONDS", 0.05):
                with self.assertRaisesRegex(m.Blocked, "disk reserve"):
                    with m.monitor_disk_space(Mock(side_effect=m.Blocked("disk reserve")), children):
                        children[1].wait(timeout=5)
            self.assertTrue(all(child.poll() is not None for child in children))
        finally:
            for child in children:
                if child.poll() is None:
                    child.kill()
                child.wait()

    def test_cleanup_preserves_live_rollback_container_and_shared_aliases(self):
        self.instance.first = False
        current = "run-20261025t100000z-1"
        previous = "run-20261024t100000z-1"
        stale = "run-20261023t100000z-1"
        self.instance.journal = {"status": "ready", "images": {
            "auth-service": "reloop-production/auth-service:"+current},
            "previous_run": str(self.state/previous)}
        def row(name, tag, identity):
            return {"Repository": "reloop-production/"+name, "Tag": tag, "ID": identity}
        rows = [row("auth-service", current, "current"), row("auth-service", stale, "current"),
                row("order-service", previous, "rollback"), row("chat-service", stale, "pod-image"),
                row("frontend", stale, "docker-container"), row("mongo", stale, "database"),
                row("product-service", stale, "unused"),
                {"Repository": "unrelated/frontend", "Tag": stale, "ID": "foreign"}]
        removed = []
        def command(args, **kwargs):
            if "pods" in args:
                return json.dumps({"items": [{"spec": {"containers": [
                    {"image": "docker.io/reloop-production/chat-service:"+stale}]}}]})
            if args[:3] == ["docker", "image", "ls"]:
                return "\n".join(json.dumps(r) for r in rows)
            if args[:3] == ["docker", "ps", "-a"]:
                return "container-id"
            if args[:2] == ["docker", "inspect"]:
                return "docker-container"
            if args[:3] == ["docker", "image", "rm"]:
                removed.append(args)
                return ""
            self.fail(str(args))
        with patch.object(m, "run", side_effect=command):
            self.instance.cleanup_unused_docker_images()
        self.assertEqual(removed, [["docker", "image", "rm",
                                  "docker.io/reloop-production/product-service:"+stale]])

    def test_unverified_import_never_deletes_docker_copy(self):
        self.instance.first = False
        self.instance.journal = {"status": "ready"}
        with patch.object(m, "run", return_value="") as command:
            with self.assertRaisesRegex(m.Blocked, "retaining Docker copy"):
                self.instance.cleanup_imported_docker_copy("auth-service")
        self.assertFalse(any(c.args[0][:3] == ["docker", "image", "rm"] for c in command.call_args_list))

    def test_successful_import_can_remove_only_current_run_copy(self):
        self.instance.first = False
        self.instance.journal = {"status": "ready"}
        image = self.instance.images["auth-service"]
        with patch.object(m, "run", return_value=image+"\n") as command:
            self.instance.cleanup_imported_docker_copy("auth-service")
        self.assertEqual(command.call_args.args[0], ["docker", "image", "rm", image])

    def test_fresh_and_resume_keep_docker_sources(self):
        for first, status in ((True, None), (False, "incomplete")):
            self.instance.first, self.instance.journal = first, {"status": status}
            with patch.object(m, "run") as command:
                self.instance.cleanup_unused_docker_images()
                self.instance.cleanup_imported_docker_copy("auth-service")
            command.assert_not_called()

    def test_bad_cpu_image_fails_before_downtime_and_keeps_ready_journal(self):
        instance = self.instance
        instance.first = False
        instance.journal = {"status": "ready", "schema": "schema1", "images": {n: "old-"+n for n in m.APPS+m.DATABASES}}
        m.write_json(instance.journal_path, instance.journal)
        jobs = []
        def kubectl(*args, **kwargs):
            if args[0] == "wait":
                raise m.Blocked("Unsupported CPU")
            return ""
        with patch.object(instance, "preflight"), patch.object(instance, "install"), \
             patch.object(instance, "schema_fingerprint", return_value="schema1"), \
             patch.object(instance, "build_apps"), patch.object(instance, "import_images"), \
             patch.object(instance, "apply", side_effect=jobs.append), \
             patch.object(instance, "k", side_effect=kubectl), patch.object(instance, "stop_apps") as stop:
            with self.assertRaisesRegex(m.Blocked, "Unsupported CPU"):
                instance.deploy()
        stop.assert_not_called()
        self.assertEqual(json.loads(instance.journal_path.read_text())["status"], "ready")
        pod = jobs[0]["spec"]["template"]["spec"]
        self.assertFalse(pod["automountServiceAccountToken"])
        self.assertNotIn("envFrom", pod["containers"][0])
        self.assertNotIn("volumes", pod)

    def test_product_runtime_check_exercises_native_image_conversion(self):
        self.instance.first = False
        jobs = []
        with patch.object(self.instance, "apply", side_effect=jobs.append), patch.object(self.instance, "k"):
            self.instance.verify_built_images()
        job = next(j for j in jobs if j["metadata"]["name"].startswith("product-service-runtime-"))
        command = job["spec"]["template"]["spec"]["containers"][0]["command"][-1]
        self.assertIn('require("sharp")', command)
        self.assertIn("toBuffer()", command)

    def test_first_cutover_checks_images_without_creating_namespace(self):
        with patch.object(m, "run") as command, patch.object(m.subprocess, "run"), \
             patch.object(self.instance, "apply") as apply:
            self.instance.verify_built_images()
        apply.assert_not_called()
        self.assertEqual(command.call_count, len(m.APPS))
        for call in command.call_args_list:
            args = call.args[0]
            self.assertEqual(args[:3], ["docker", "run", "--rm"])
            self.assertIn("--read-only", args)
            self.assertEqual(args[args.index("--network")+1], "none")
            self.assertNotIn("--volume", args)

    def test_kept_product_is_not_built_or_imported(self):
        instance = self.instance
        instance.first, instance.keep_services = False, ("product-service",)
        instance.journal = {"images": {n: "old-"+n for n in m.APPS+m.DATABASES}}
        live = {"status": {"readyReplicas": 1}, "spec": {"template": {"spec": {
            "containers": [{"image": "old-product-service"}]}}}}
        with patch.object(instance, "k", return_value=json.dumps(live)), \
             patch.object(instance, "build_apps"), patch.object(instance, "verify_built_images"), \
             patch.object(instance, "import_images") as imports:
            instance.build()
        self.assertEqual(instance.images["product-service"], "old-product-service")
        self.assertNotIn("product-service", imports.call_args.args[0])
        builds = []
        with patch.object(instance, "cleanup_unused_docker_images"), \
             patch.object(instance, "check_build_disk_space"), \
             patch.object(m, "run", side_effect=lambda args, **kw: builds.append(args) or ""):
            instance.build_apps()
        self.assertNotIn("product-service", [args[-1] for args in builds])

    def test_mongo_can_resolve_itself_before_becoming_primary(self):
        items = m.manifests(fixture(), {n: "image" for n in m.APPS+m.DATABASES}, self.state, apps_enabled=True)["items"]
        mongo = next(x for x in items if x["kind"] == "Service" and x["metadata"]["name"] == "mongo")
        self.assertTrue(mongo["spec"]["publishNotReadyAddresses"])

    def test_ready_node_with_disk_pressure_is_not_safe_to_build(self):
        node = {"status": {"conditions": [{"type": "Ready", "status": "True"},
                                           {"type": "DiskPressure", "status": "True"}]}}
        with self.assertRaisesRegex(m.Blocked, "DiskPressure"):
            m.validate_node_pressure(node)
        node["status"]["conditions"][1]["status"] = "False"
        m.validate_node_pressure(node)

    def test_kept_product_is_forbidden_during_migration_or_first_install(self):
        for migrate, existing in ((False, False), (True, True)):
            state = self.state / ("existing" if existing else "empty")
            state.mkdir()
            if existing:
                m.write_json(state/"journal.json", {"status": "ready"})
            with self.assertRaisesRegex(m.Blocked, "Keeping Product"):
                m.Deployment(self.root, state, migrate, keep_services=("product-service",))

    def test_cli_passes_keep_product_to_ordinary_update(self):
        with patch.object(m.sys, "argv", ["deploy", str(self.root), str(self.state),
                                          "--keep-service", "product-service"]), \
             patch.object(m, "LOG", None), patch.object(m, "Deployment", return_value=self.instance) as factory, \
             patch.object(self.instance, "deploy"):
            self.assertEqual(m.main(), 0)
        factory.assert_called_once_with(self.root.resolve(), self.state.resolve(), False,
                                        keep_services=("product-service",))

    def test_cli_rejects_keep_with_migration_before_deployment(self):
        with patch.object(m.sys, "argv", ["deploy", str(self.root), str(self.state),
                                          "--migrate", "--keep-service", "product-service"]), \
             patch.object(m, "Deployment") as factory:
            with self.assertRaisesRegex(m.Blocked, "Usage"):
                m.main()
        factory.assert_not_called()

    def test_storage_discovery_deduplicates_same_filesystem(self):
        del self.instance._build_storage_paths
        docker_root = self.state / "docker"
        docker_root.mkdir()
        with patch.object(m, "run", return_value=json.dumps({"DockerRootDir": str(docker_root)})), \
             patch.dict(m.os.environ, {"RELOOP_DOCKER_IMAGE_STORE": str(docker_root)}):
            self.instance.configure_build_storage()
        self.assertEqual(self.instance._build_storage_paths, [self.state])

    def test_migration_snapshot_reserve_is_checked_before_build(self):
        del self.instance._build_storage_paths
        self.instance.first, self.instance.migrate = False, True
        (self.state / "data").mkdir()
        def command(args, **kwargs):
            if args[0] == "docker":
                return json.dumps({"DockerRootDir": str(self.state)})
            self.assertEqual(args[:2], ["du", "-sb"])
            return str(18*m.GIB) + "\tdata"
        with patch.object(m, "run", side_effect=command), \
             patch.dict(m.os.environ, {"RELOOP_DOCKER_IMAGE_STORE": ""}), \
             patch.object(m.shutil, "disk_usage", return_value=shutil._ntuple_diskusage(50*m.GIB, 31*m.GIB, 19*m.GIB)):
            with self.assertRaisesRegex(m.Blocked, "20.00 GiB required"):
                self.instance.check_build_disk_space()


if __name__ == "__main__":
    unittest.main()
