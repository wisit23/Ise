"""Offline fresh-cutover regression tests; never contact Docker or a cluster."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from test_k8s_production import fixture, m

spec = importlib.util.spec_from_file_location("k8s_fresh_test", Path(__file__).with_name("k8s-fresh.py"))
fresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fresh)


class FreshTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / "checkout"
        self.state = Path(self.directory.name) / "state"
        self.root.mkdir()
        self.state.mkdir()
        self.instance = fresh.deployment_class(m, resume=False)(self.root, self.state, True)
        self.instance.config = fixture()
        self.instance.images = {name: "image-" + name for name in m.APPS + m.DATABASES}
        self.instance._build_storage_paths = [self.state]
        self.instance._build_disk_reserve = m.DISK_RESERVE
        disk = patch.object(m.shutil, "disk_usage")
        disk.start().return_value.free = 100 * 1024**3
        self.addCleanup(disk.stop)

    def test_fresh_resources_initialize_sql_and_mongo_without_enabling_apps(self):
        resources = fresh.fresh_resources(m, fixture(), self.instance.images, self.state, False)["items"]
        postgres = next(item for item in resources if item["kind"] == "Deployment" and item["metadata"]["name"] == "postgres")
        self.assertTrue(any(volume.get("configMap", {}).get("name") == "postgres-fresh-init"
                            for volume in postgres["spec"]["template"]["spec"]["volumes"]))
        sql = next(item for item in resources if item["kind"] == "ConfigMap")["data"]["00-reloop.sql"]
        self.assertIn('CREATE DATABASE "auth_service"', sql)
        self.assertEqual(sql.count("\\gexec"), 4)
        self.assertTrue(next(item for item in resources if item["kind"] == "Service" and item["metadata"]["name"] == "mongo")["spec"]["publishNotReadyAddresses"])
        for item in resources:
            if item["kind"] == "Deployment" and item["metadata"]["name"] in m.APPS:
                self.assertEqual(item["spec"]["replicas"], 0)

    def test_invalid_database_name_rejected(self):
        config = fixture()
        config["services"]["auth-service"]["environment"]["DATABASE_URL"] = "postgresql://postgres/a';DROP"
        with self.assertRaisesRegex(m.Blocked, "database name"):
            fresh.fresh_resources(m, config, self.instance.images, self.state, False)

    def inventory(self, *, service="auth-service", name="/ise-auth-service-1"):
        return {"Id": "app-id", "Name": name, "Image": "old-image", "Mounts": [],
                "Config": {"Labels": {"com.docker.compose.service": service}}}

    def test_unexpected_project_container_rejected_before_mutation(self):
        for item in (self.inventory(service="unrelated"), self.inventory(name="/reloop-tunnel")):
            with self.subTest(item=item), patch.object(m, "run", side_effect=["app-id", json.dumps([item])]) as command:
                with self.assertRaisesRegex(m.Blocked, "Unexpected"):
                    fresh.inspect_targets(m, {"name": "ise"})
                self.assertTrue(all(call.args[0][1] in ("ps", "inspect") for call in command.call_args_list))

    def test_empty_compose_stack_is_supported(self):
        with patch.object(m, "run", return_value=""):
            plan = fresh.inspect_targets(m, {"name": "ise"})
        self.assertEqual(plan["containers"], [])
        self.assertEqual(plan["volumes"], [])

    def test_reset_skips_missing_images_and_never_prunes_or_touches_tunnel(self):
        self.instance.plan = {"project": "ise", "containers": [{"id": "gone-app", "service": "auth-service", "image": "gone-image"}], "volumes": ["gone-volume"]}
        with patch.object(m, "run", return_value="") as command, patch.object(fresh.shutil, "disk_usage") as disk:
            disk.return_value.free = 25 * 1024**3
            self.instance.reset()
        calls = [call.args[0] for call in command.call_args_list]
        self.assertEqual(len(calls), 3)
        self.assertFalse(any("prune" in call or "rm" in call or "reloop-tunnel" in call for call in calls))

    def test_reset_rechecks_volume_references_before_removal(self):
        self.instance.plan = {"project": "ise", "containers": [], "volumes": ["app-volume"]}
        with patch.object(m, "run", side_effect=["", "app-volume", "other-container"]) as command:
            with self.assertRaisesRegex(m.Blocked, "another owner"):
                self.instance.reset()
        self.assertFalse(any("rm" in call.args[0] for call in command.call_args_list))

    def test_reset_stops_writers_before_databases(self):
        items = [{"id": "db", "image": "db-image", "service": "postgres"},
                 {"id": "app", "image": "app-image", "service": "auth-service"}]
        self.instance.plan = {"project": "ise", "containers": items, "volumes": []}
        def run(args, **kwargs):
            if args[1:3] == ["ps", "-a"]:
                return "db\napp"
            if args[1] == "inspect":
                item = next(item for item in items if item["id"] == args[2])
                return json.dumps([{"Config": {"Labels": {"com.docker.compose.project": "ise", "com.docker.compose.service": item["service"]}}}])
            return ""
        with patch.object(m, "run", side_effect=run) as command, patch.object(fresh.shutil, "disk_usage") as disk:
            disk.return_value.free = 25 * 1024**3
            self.instance.reset()
        stops = [call.args[0][-1] for call in command.call_args_list if call.args[0][1] == "stop"]
        self.assertEqual(stops, ["app", "db"])

    def test_resume_from_health_does_not_reset_build_or_migrate(self):
        self.instance.journal = {"fresh_stage": "health", "status": "incomplete"}
        with patch.object(self.instance, "prepare"), patch.object(self.instance, "health") as health, \
             patch.object(self.instance, "reset") as reset, patch.object(self.instance, "build_apps") as build, \
             patch.object(self.instance, "migrations") as migrate, patch.object(self.instance, "k"), \
             patch.object(self.instance, "schema_fingerprint", return_value="schema"):
            self.instance.deploy()
        health.assert_called_once()
        reset.assert_not_called()
        build.assert_not_called()
        migrate.assert_not_called()
        self.assertEqual(json.loads(self.instance.journal_path.read_text())["status"], "ready")

    def test_failed_stage_remains_pending_and_never_records_ready(self):
        self.instance.journal = {"fresh_stage": "import", "status": "incomplete"}
        with patch.object(self.instance, "prepare"), patch.object(self.instance, "import_images", side_effect=m.Blocked("import failed")), \
             patch.object(self.instance, "databases") as databases:
            with self.assertRaisesRegex(m.Blocked, "import failed"):
                self.instance.deploy()
        self.assertEqual(self.instance.journal["fresh_stage"], "import")
        self.assertEqual(self.instance.journal["status"], "incomplete")
        databases.assert_not_called()

    def test_failed_migration_is_not_retried(self):
        name = "auth-service-migrate-" + self.instance.run_dir.name.lower()
        job = {"metadata": {"name": name}, "status": {"conditions": [{"type": "Failed", "status": "True"}]}}
        with patch.object(self.instance, "k", return_value=json.dumps({"items": [job]})) as command, \
             patch.object(self.instance, "apply") as apply:
            with self.assertRaisesRegex(m.Blocked, "will not retry"):
                self.instance.migration("auth-service", ["node", "prisma/migrate.js"], "migrate")
        self.assertEqual(command.call_count, 1)
        apply.assert_not_called()

    def test_resume_rejects_unrelated_incomplete_journal(self):
        m.write_json(self.state / "journal.json", {"status": "incomplete", "run": str(self.instance.run_dir)})
        with self.assertRaises(m.Blocked):
            fresh.deployment_class(m, resume=True)(self.root, self.state, True, resume=True)

    def test_source_fingerprint_detects_untracked_content_change(self):
        source = self.root / "new-service.js"
        source.write_text("first")
        with patch.object(m, "run", return_value="new-service.js\0"):
            before = fresh.fingerprint(m, self.root, fixture())
            source.write_text("second")
            self.assertNotEqual(before, fresh.fingerprint(m, self.root, fixture()))

    def test_unexpected_target_data_is_not_initialized(self):
        (self.state / "data").mkdir()
        with patch.object(self.instance, "apply") as apply:
            with self.assertRaisesRegex(m.Blocked, "Unexpected target data"):
                self.instance.databases()
        apply.assert_not_called()

    def test_build_uses_private_cache_without_editing_source_dockerfile(self):
        cache = self.state / "build-cache" / "prisma"
        cache.mkdir(parents=True)
        original = "FROM node:22-alpine\nRUN npm install\nRUN npx prisma generate\n"
        dockerfile = self.root / "Dockerfile"
        dockerfile.write_text(original)
        for service in self.instance.config["services"].values():
            if "build" in service:
                service["build"]["context"] = str(self.root)
        with patch.object(m, "run") as command:
            self.instance.build_apps()
        self.assertEqual(dockerfile.read_text(), original)
        self.assertIn("COPY --from=prisma-cache", (self.instance.run_dir / "auth-service.Dockerfile").read_text())
        builds = [call.args[0] for call in command.call_args_list]
        self.assertEqual([args[-1] for args in builds], list(m.APPS))

    def test_streaming_import_connects_pipe_and_checks_both_exit_codes(self):
        producer, consumer = MagicMock(), MagicMock()
        producer.wait.return_value = 1
        consumer.wait.return_value = 0
        producer.poll.return_value = 1
        consumer.poll.return_value = 0
        with patch.object(self.instance, "check_import_disk_space"), \
             patch.object(m.subprocess, "Popen", side_effect=[producer, consumer]) as spawn:
            with self.assertRaisesRegex(m.Blocked, "streaming image import failed"):
                self.instance.import_images(["auth-service"])
        self.assertIs(spawn.call_args_list[1].kwargs["stdin"], producer.stdout)
        producer.stdout.close.assert_called_once()
        self.assertFalse((self.instance.run_dir / "images.tar").exists())

    def test_import_startup_failure_stops_producer(self):
        producer = MagicMock()
        producer.poll.return_value = None
        with patch.object(self.instance, "check_import_disk_space"), \
             patch.object(m.subprocess, "Popen", side_effect=[producer, OSError("cannot start consumer")]):
            with self.assertRaises(OSError):
                self.instance.import_images(["auth-service"])
        producer.kill.assert_called_once()
        producer.wait.assert_called_once()


if __name__ == "__main__":
    unittest.main()
