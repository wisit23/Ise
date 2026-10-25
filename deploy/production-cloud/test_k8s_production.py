"""Offline regression tests. No real Docker, Kubernetes, network or server changes.
Run: python -B -m unittest discover -s deploy/production-cloud -p 'test_k8s_production.py' -v
"""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("k8s_production", Path(__file__).with_name("k8s-production.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    services = {}
    for app in m.APPS:
        env = {"INTERNAL_SERVICE_TOKEN": "private-fixture", "REDIS_URL": "redis://redis:6379"}
        if app not in ("frontend", "gateway"):
            env["DATABASE_URL"] = ("mongodb://mongo:27017/chat?replicaSet=rs0" if app == "chat-service"
                                   else "postgresql://reloop:secret@postgres:5432/" + app.replace("-", "_"))
        services[app] = {"build": {"dockerfile": "frontend/Dockerfile.prod" if app == "frontend" else "Dockerfile"},
                         "environment": env,
                         "volumes": [{"target": path} for path in m.FILES.get(app, ())]}
    for app, host in (("frontend", 3000), ("gateway", 8080)):
        services[app]["ports"] = [{"target": m.PORTS[app], "published": str(host), "protocol": "tcp"}]
    services["postgres"] = {"environment": {"POSTGRES_USER": "reloop", "POSTGRES_PASSWORD": "secret"}}
    services["mongo"] = {"command": ["--replSet", "rs0", "--bind_ip_all"]}
    services["redis"] = {}
    return {"services": services, "node": "re-loop"}


class ConfigTests(unittest.TestCase):
    def test_existing_config_accepted(self):
        m.validate_config(fixture())

    def test_external_database_blocked(self):
        config = fixture()
        config["services"]["auth-service"]["environment"]["DATABASE_URL"] = "postgresql://remote/db"
        with self.assertRaisesRegex(m.Blocked, "local postgres"):
            m.validate_config(config)

    def test_external_redis_blocked(self):
        config = fixture()
        config["services"]["chat-service"]["environment"]["REDIS_URL"] = "redis://remote"
        with self.assertRaisesRegex(m.Blocked, "local Redis"):
            m.validate_config(config)

    def test_development_frontend_blocked(self):
        config = fixture()
        config["services"]["frontend"]["build"]["dockerfile"] = "frontend/Dockerfile"
        with self.assertRaisesRegex(m.Blocked, "Dockerfile.prod"):
            m.validate_config(config)

    def test_extra_mount_blocked(self):
        config = fixture()
        config["services"]["auth-service"]["volumes"].append({"target": "/unhandled-data"})
        with self.assertRaisesRegex(m.Blocked, "extra persistent"):
            m.validate_config(config)

    def test_custom_startup_blocked(self):
        config = fixture()
        config["services"]["auth-service"]["command"] = ["npx", "prisma", "db", "push"]
        with self.assertRaisesRegex(m.Blocked, "startup commands"):
            m.validate_config(config)

    def test_custom_mongo_blocked(self):
        config = fixture()
        config["services"]["mongo"]["command"].append("--auth")
        with self.assertRaisesRegex(m.Blocked, "Mongo startup"):
            m.validate_config(config)

    def test_private_storage_overrides_cannot_escape_snapshot(self):
        for key, value in (("KYC_STORAGE_DIR", "/outside"),
                           ("REPORT_EVIDENCE_STORAGE_DIR", "/outside"),
                           ("REPORT_EVIDENCE_STORAGE_DIR", m.FILES["auth-service"][0] + "/../outside")):
            with self.subTest(key=key, value=value):
                config = fixture()
                config["services"]["auth-service"]["environment"][key] = value
                with self.assertRaises(m.Blocked):
                    m.validate_config(config)

    def test_pgdata_outside_snapshot_blocked(self):
        config = fixture()
        config["services"]["postgres"]["environment"]["PGDATA"] = "/outside/data"
        with self.assertRaisesRegex(m.Blocked, "PGDATA"):
            m.validate_config(config)

    def test_custom_pg_wal_blocked(self):
        config = fixture()
        config["services"]["postgres"]["environment"]["POSTGRES_INITDB_WALDIR"] = "/wal"
        with self.assertRaisesRegex(m.Blocked, "WAL"):
            m.validate_config(config)

    def test_host_port_conflict_blocked(self):
        config = fixture()
        config["services"]["gateway"]["ports"][0]["published"] = "6443"
        with self.assertRaisesRegex(m.Blocked, "conflicts with K3s"):
            m.validate_config(config)

    def test_private_binding_not_exposed(self):
        config = fixture()
        config["services"]["gateway"]["ports"][0]["host_ip"] = "127.0.0.1"
        with self.assertRaisesRegex(m.Blocked, "host IP"):
            m.validate_config(config)

    def test_published_ports_are_checked_without_http_proxy(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.status = 200
        with patch.object(m, "build_opener", return_value=opener):
            m.check_host_ports(fixture())
        self.assertEqual([call.args[0] for call in opener.open.call_args_list],
                         ["http://127.0.0.1:3000/", "http://127.0.0.1:8080/health"])

    def test_host_routing_failure_blocks_success(self):
        opener = MagicMock()
        opener.open.side_effect = m.URLError("unreachable")
        with patch.object(m, "build_opener", return_value=opener):
            with self.assertRaisesRegex(m.Blocked, "host-port routing failed"):
                m.check_host_ports(fixture())

    def test_production_manifests(self):
        images = {name: "docker.io/test/" + name + ":unique" for name in m.APPS + m.DATABASES}
        items = m.manifests(fixture(), images, Path("/private/state"), apps_enabled=False)["items"]
        deployments = {item["metadata"]["name"]: item for item in items if item["kind"] == "Deployment"}
        self.assertEqual(set(deployments), set(m.APPS + m.DATABASES))
        for name, item in deployments.items():
            self.assertEqual(item["spec"]["replicas"], int(name in m.DATABASES))
            pod = item["spec"]["template"]["spec"]
            container = pod["containers"][0]
            self.assertEqual(pod["nodeSelector"], {"kubernetes.io/hostname": "re-loop"})
            self.assertEqual(container["image"], images[name])
            self.assertEqual(container["imagePullPolicy"], "Never")
            self.assertNotIn("command", container)
            self.assertEqual(len(pod["volumes"]), len(m.FILES.get(name, ())))
            self.assertEqual("hostPort" in container["ports"][0], name in ("frontend", "gateway"))
            for volume in pod["volumes"]:
                self.assertEqual(volume["hostPath"]["type"], "Directory")
        secrets = {item["metadata"]["name"]: item for item in items if item["kind"] == "Secret"}
        self.assertEqual(secrets["frontend-env"]["stringData"]["NODE_ENV"], "production")
        self.assertEqual(secrets["auth-service-env"]["stringData"]["INTERNAL_SERVICE_TOKEN"], "private-fixture")
        self.assertNotIn("db push", json.dumps(items))
        self.assertNotIn("npm run dev", json.dumps(items))


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.archive = self.root / "backup.tar"

    def tearDown(self):
        self.temp.cleanup()

    def make_tar(self, name="./document", content=b"preserved content", kind=tarfile.REGTYPE):
        with tarfile.open(self.archive, "w") as archive:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            entry.size = len(content) if kind == tarfile.REGTYPE else 0
            archive.addfile(entry, io.BytesIO(content) if kind == tarfile.REGTYPE else None)

    def test_empty_database_archive_is_never_bootstrapped(self):
        self.make_tar("unrelated")
        for database in m.DATABASES:
            with self.subTest(database=database):
                with self.assertRaisesRegex(m.Blocked, "refusing an empty replacement"):
                    m.validate_data_archive(self.archive, database, fixture())

    def test_database_markers_are_required_at_correct_paths(self):
        for database, marker in (("postgres", "PG_VERSION"), ("mongo", "WiredTiger"), ("redis", "dump.rdb")):
            with self.subTest(database=database):
                self.make_tar("./" + marker)
                m.validate_data_archive(self.archive, database, fixture())
        config = fixture()
        config["services"]["postgres"]["environment"]["PGDATA"] = "/var/lib/postgresql/data/pgdata"
        self.make_tar("./pgdata/PG_VERSION")
        m.validate_data_archive(self.archive, "postgres", config)

    def test_valid_archive_and_exact_files(self):
        self.make_tar()
        m.validate_archive(self.archive)
        target = self.root / "restored"
        target.mkdir()
        (target / "document").write_bytes(b"preserved content")
        m.verify_archive(self.archive, target)

    def test_tampered_file_blocked(self):
        self.make_tar()
        target = self.root / "restored"
        target.mkdir()
        (target / "document").write_bytes(b"different")
        with self.assertRaisesRegex(m.Blocked, "checksum"):
            m.verify_archive(self.archive, target)

    def test_missing_file_blocked(self):
        self.make_tar()
        with self.assertRaisesRegex(m.Blocked, "missing"):
            m.verify_archive(self.archive, self.root)

    def test_traversal_blocked(self):
        for name in ("../outside", "/outside", "safe/../../outside"):
            with self.subTest(name=name):
                self.make_tar(name)
                with self.assertRaisesRegex(m.Blocked, "Unsafe path"):
                    m.validate_archive(self.archive)

    def test_privileged_permissions_blocked(self):
        with tarfile.open(self.archive, "w") as archive:
            entry = tarfile.TarInfo("unsafe")
            entry.mode = 0o4755
            archive.addfile(entry)
        with self.assertRaisesRegex(m.Blocked, "setuid/setgid"):
            m.validate_archive(self.archive)

    def test_links_and_devices_blocked(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE):
            with self.subTest(kind=kind):
                self.make_tar(kind=kind)
                with self.assertRaisesRegex(m.Blocked, "links/special"):
                    m.validate_archive(self.archive)


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "repo"
        self.state = Path(self.temp.name) / "state"
        self.root.mkdir()
        self.state.mkdir()
        self.events = []

    def tearDown(self):
        self.temp.cleanup()

    def deployment(self, migrate=False, existing=False):
        if existing:
            m.write_json(self.state / "journal.json", {"status": "ready", "root": str(self.root),
                "schema": "schema1", "images": {name: "old-image" for name in m.APPS + m.DATABASES},
                "ports": {"frontend": 3000, "gateway": 8080}, "last_success": "previous-run"})
        instance = m.Deployment(self.root, self.state, migrate)
        instance.config = fixture()
        instance.images = {name: "new-image" for name in m.APPS + m.DATABASES}
        return instance

    def exercise(self, instance, failure=None):
        patches = []
        for method in ("preflight", "install", "build", "stop_apps", "copy_from_compose",
                       "backup_kubernetes", "wait_databases", "check_migrations", "migration", "apply"):
            def action(*args, _method=method, **kwargs):
                self.events.append((_method, args))
                if _method == failure:
                    raise m.Blocked("injected failure")
            patcher = patch.object(instance, method, side_effect=action)
            patcher.start()
            patches.append(patcher)
        patches.append(patch.object(instance, "schema_fingerprint", return_value="schema1"))
        patches[-1].start()
        patches.append(patch.object(instance, "k", side_effect=lambda *args, **kw: self.events.append(("kubectl", args))))
        patches[-1].start()
        patches.append(patch.object(m, "check_host_ports", side_effect=lambda *a: self.events.append(("host-health", a))))
        patches[-1].start()
        try:
            instance.deploy()
        finally:
            for patcher in reversed(patches):
                patcher.stop()

    def test_initial_import_with_migrations(self):
        instance = self.deployment(migrate=True)
        self.exercise(instance)
        names = [event[0] for event in self.events]
        self.assertLess(names.index("build"), names.index("stop_apps"))
        self.assertLess(names.index("copy_from_compose"), names.index("migration"))
        self.assertLess(names.index("check_migrations"), names.index("kubectl"))
        migrations = [args for name, args in self.events if name == "migration"]
        self.assertEqual(len(migrations), 5)
        self.assertEqual(migrations[-1][1], ["npx", "prisma", "db", "push", "--skip-generate"])
        self.assertNotIn("--accept-data-loss", str(self.events))
        journal = json.loads(instance.journal_path.read_text())
        self.assertEqual(journal["status"], "ready")
        self.assertEqual(journal["schema"], "schema1")

    def test_first_run_without_migrate_never_changes_schema(self):
        instance = self.deployment()
        self.exercise(instance)
        self.assertFalse(any(name == "migration" for name, _ in self.events))
        self.assertTrue(any(name == "check_migrations" for name, _ in self.events))

    def test_build_failure_leaves_source_running_and_no_journal(self):
        instance = self.deployment()
        with self.assertRaises(m.Blocked):
            self.exercise(instance, failure="build")
        self.assertFalse(instance.journal_path.exists())
        self.assertFalse(any(name == "stop_apps" for name, _ in self.events))
        self.assertFalse(any(name == "apply" for name, _ in self.events))

    def test_backup_failure_never_starts_apps_and_blocks_reimport(self):
        instance = self.deployment(migrate=True)
        with self.assertRaises(m.Blocked):
            self.exercise(instance, failure="copy_from_compose")
        self.assertEqual(json.loads(instance.journal_path.read_text())["status"], "incomplete")
        self.assertFalse(any(name == "migration" for name, _ in self.events))
        with self.assertRaisesRegex(m.Blocked, "Previous run is incomplete"):
            m.Deployment(self.root, self.state, True)

    def test_migration_failure_does_not_start_apps(self):
        instance = self.deployment(migrate=True)
        with self.assertRaises(m.Blocked):
            self.exercise(instance, failure="migration")
        applied = [args[0] for name, args in self.events if name == "apply"]
        for payload in applied:
            if payload.get("kind") != "List":
                continue
            apps = [item for item in payload["items"] if item["kind"] == "Deployment"
                    and item["metadata"]["name"] in m.APPS]
            self.assertTrue(all(item["spec"]["replicas"] == 0 for item in apps))
        self.assertEqual(json.loads(instance.journal_path.read_text())["status"], "incomplete")

    def test_ordinary_update_checks_before_downtime_and_preserves_history(self):
        instance = self.deployment(existing=True)
        self.exercise(instance)
        names = [event[0] for event in self.events]
        self.assertLess(names.index("check_migrations"), names.index("stop_apps"))
        self.assertNotIn("backup_kubernetes", names)
        self.assertNotIn("copy_from_compose", names)
        journal = json.loads(instance.journal_path.read_text())
        self.assertEqual(journal["previous_run"], "previous-run")

    def test_existing_migrate_backs_up_current_kubernetes_not_stale_compose(self):
        instance = self.deployment(existing=True, migrate=True)
        self.exercise(instance)
        names = [event[0] for event in self.events]
        self.assertLess(names.index("stop_apps"), names.index("backup_kubernetes"))
        self.assertLess(names.index("backup_kubernetes"), names.index("migration"))
        self.assertNotIn("copy_from_compose", names)

    def test_pending_update_does_not_stop_apps(self):
        instance = self.deployment(existing=True)
        with self.assertRaises(m.Blocked):
            self.exercise(instance, failure="check_migrations")
        self.assertFalse(any(name == "stop_apps" for name, _ in self.events))
        self.assertEqual(json.loads(instance.journal_path.read_text())["status"], "ready")

    def test_database_changes_require_migrate_before_install_or_build(self):
        instance = self.deployment(existing=True)
        instance.journal["schema"] = "old-schema"
        with self.assertRaisesRegex(m.Blocked, "--migrate"):
            self.exercise(instance)
        self.assertEqual([name for name, _ in self.events], ["preflight"])

    def test_failed_redis_save_blocks_kubernetes_snapshot(self):
        instance = self.deployment(existing=True)
        with patch.object(instance, "k", return_value="ERR cannot save") as command, \
             patch.object(instance, "mongo_shell"), patch.object(instance, "snapshot") as snapshot:
            with self.assertRaisesRegex(m.Blocked, "Redis SAVE failed"):
                instance.backup_kubernetes()
        self.assertFalse(any(call.args[0] == "scale" for call in command.call_args_list))
        snapshot.assert_not_called()

    def test_flushes_data_before_kubernetes_cold_snapshot(self):
        instance = self.deployment(existing=True)
        events = []
        def kubectl(*args, **kwargs):
            events.append(args)
            return "OK" if args[-1] == "SAVE" else ""
        with patch.object(instance, "k", side_effect=kubectl), \
             patch.object(instance, "mongo_shell", side_effect=lambda *a: events.append(("mongo-fsync",))), \
             patch.object(instance, "snapshot", side_effect=lambda **kw: events.append(("snapshot",))), \
             patch.object(instance, "wait_databases"):
            instance.backup_kubernetes()
        save = next(i for i, args in enumerate(events) if args[-1] == "SAVE")
        stop = next(i for i, args in enumerate(events) if args[0] == "scale")
        snapshot = events.index(("snapshot",))
        self.assertLess(save, stop)
        self.assertLess(stop, snapshot)
        self.assertTrue(any("CHECKPOINT" in str(args) for args in events[:stop]))
        self.assertIn(("mongo-fsync",), events[:stop])

    def test_source_restart_policy_disabled_before_stop(self):
        instance = self.deployment()
        instance.containers = {name: {"id": "fixture-" + name} for name in m.APPS + m.DATABASES}
        with patch.object(m, "run") as command:
            instance.stop_apps()
        calls = [call.args[0] for call in command.call_args_list]
        self.assertEqual(calls[0][:3], ["docker", "update", "--restart=no"])
        self.assertEqual(set(calls[0][3:]), {"fixture-" + name for name in m.APPS + m.DATABASES})
        self.assertEqual(calls[1][:4], ["docker", "stop", "-t", "180"])

    def test_logical_backup_failure_does_not_stop_databases(self):
        instance = self.deployment()
        instance.containers = {name: {"id": "fixture-" + name} for name in m.APPS + m.DATABASES}
        with patch.object(m, "run", side_effect=m.Blocked("backup failed")) as command:
            with self.assertRaisesRegex(m.Blocked, "backup failed"):
                instance.copy_from_compose()
        self.assertEqual(command.call_count, 1)
        self.assertIn("pg_dumpall", str(command.call_args))

    def test_migration_job_uses_new_images_and_private_secret(self):
        instance = self.deployment()
        applied = []
        with patch.object(instance, "apply", side_effect=applied.append), patch.object(instance, "k") as command:
            instance.migration("auth-service", ["node", "prisma/migrate.js"], "migrate")
        self.assertEqual(applied[0]["kind"], "Secret")
        job = applied[1]
        container = job["spec"]["template"]["spec"]["containers"][0]
        self.assertEqual(container["image"], "new-image")
        self.assertEqual(container["command"], ["node", "prisma/migrate.js"])
        self.assertNotIn("env", container)
        self.assertEqual(job["spec"]["backoffLimit"], 0)
        self.assertEqual(container["envFrom"][0]["secretRef"]["name"], applied[0]["metadata"]["name"])
        self.assertTrue(any(call.args[:2] == ("delete", "secret") for call in command.call_args_list))

    def test_failed_migration_job_retains_diagnostics(self):
        instance = self.deployment()
        def fail_wait(*args, **kwargs):
            if args[0] == "wait":
                raise m.Blocked("migration failed")
        with patch.object(instance, "apply"), patch.object(instance, "k", side_effect=fail_wait) as command:
            with self.assertRaisesRegex(m.Blocked, "migration failed"):
                instance.migration("auth-service", ["node", "prisma/migrate.js"], "migrate")
        self.assertTrue(any(call.args[0] == "logs" for call in command.call_args_list))
        self.assertFalse(any(call.args[0] == "delete" for call in command.call_args_list))

    def test_orphaned_target_data_blocked_before_server_commands(self):
        instance = self.deployment()
        (self.state / "data").mkdir()
        with patch.object(m, "run") as command:
            with self.assertRaisesRegex(m.Blocked, "Target data already exists"):
                instance.preflight()
        command.assert_not_called()

    def test_failed_health_never_records_success(self):
        instance = self.deployment()
        # Actual command-boundary failure after startup.
        with patch.object(m.Deployment, "k", side_effect=m.Blocked("HTTP failed")):
            for method in ("preflight", "install", "build", "stop_apps", "copy_from_compose", "wait_databases", "check_migrations", "apply"):
                patcher = patch.object(instance, method)
                patcher.start()
                self.addCleanup(patcher.stop)
            with patch.object(instance, "schema_fingerprint", return_value="schema1"):
                with self.assertRaisesRegex(m.Blocked, "HTTP failed"):
                    instance.deploy()
        self.assertEqual(json.loads(instance.journal_path.read_text())["status"], "incomplete")


if __name__ == "__main__":
    unittest.main()
