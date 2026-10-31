"""Offline contract, release-mode integration and public-route failure tests."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))
import release
import deploy_release as deploy
import smoke


def manifest():
    return {"version": 1, "repository": "wisit23/Ise", "commit": "a" * 40, "schema": "b" * 64,
            "platform": "linux/amd64", "frontend_api": "same-origin",
            "run_url": "https://github.com/wisit23/Ise/actions/runs/123",
            "images": {app: f"ghcr.io/wisit23/ise-{app}@sha256:" + "c" * 64 for app in release.APPS}}


def config():
    services = {name: {"environment": {}, "build": {"args": {}}} for name in release.APPS}
    services["frontend"]["ports"] = [{"target": 3000, "published": "3000", "protocol": "tcp"}]
    services["gateway"]["ports"] = [{"target": 8080, "published": "8080", "protocol": "tcp"}]
    return {"services": services, "node": "test-node", "registry_apps": list(release.APPS), "registry_pull_secret": "ghcr-read"}


class ContractTests(unittest.TestCase):
    def test_complete_release_and_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "release.json"
            path.write_text(json.dumps(manifest()))
            self.assertEqual(release.load(path), manifest())

    def test_partial_or_duplicate_components_are_not_a_release(self):
        value = manifest()
        value["images"].pop("gateway")
        with self.assertRaisesRegex(ValueError, "seven"):
            release.validate(value)

    def test_mutable_foreign_and_malformed_images_rejected(self):
        for image in ("ghcr.io/wisit23/ise-gateway:latest", "evil.test/gateway@sha256:" + "c" * 64,
                      "ghcr.io/wisit23/ise-frontend@sha256:" + "c" * 64, "x; touch /tmp/unwanted"):
            value = manifest()
            value["images"]["gateway"] = image
            with self.subTest(image=image), self.assertRaises(ValueError):
                release.validate(value)

    def test_foreign_provenance_and_invalid_commit_rejected(self):
        for key, value in (("repository", "someone/repo"), ("commit", "main"),
                           ("run_url", "https://github.com/other/repo/actions/runs/123"),
                           ("frontend_api", "https://production.test"), ("platform", "windows/amd64")):
            record = manifest()
            record[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                release.validate(record)

    def test_schema_fingerprint_matches_legacy_and_is_revision_pinned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            for relative in release.SCHEMA_PATHS:
                path = root / relative / "schema.txt"
                path.parent.mkdir(parents=True)
                path.write_bytes(relative.encode())
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Test", "-c", "user.email=test@example.test",
                            "commit", "-qm", "fixture"], check=True)
            sha = release.git(root, "rev-parse", "HEAD").decode().strip()
            expected = hashlib.sha256()
            for relative in release.SCHEMA_PATHS:
                path = relative + "/schema.txt"
                expected.update(path.encode())
                expected.update(relative.encode())
            self.assertEqual(release.schema_fingerprint(root, sha), expected.hexdigest())
            (root / release.SCHEMA_PATHS[0] / "schema.txt").write_text("uncommitted change")
            self.assertEqual(release.schema_fingerprint(root, sha), expected.hexdigest())

    def test_oversized_manifest_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "release.json"
            path.write_bytes(b" " * 32769)
            with self.assertRaisesRegex(ValueError, "large"):
                release.load(path)


class DeploymentTests(unittest.TestCase):
    def test_server_configuration_requires_environment_routing_and_explicit_enable(self):
        settings = {"environment": "production", "same_origin_verified": True,
                    "enabled": True, "namespace": "reloop-production"}
        for key, value in (("environment", "staging"), ("same_origin_verified", False),
                           ("enabled", False), ("namespace", "default")):
            path = MagicMock()
            path.stat.return_value.st_uid = 0
            path.stat.return_value.st_mode = 0o100644
            candidate = {**settings, key: value}
            path.read_text.return_value = json.dumps(candidate)
            with self.subTest(key=key), self.assertRaises(ValueError):
                deploy.configuration(path, "production")

    def instance(self, directory, value=None, mode="promote", migrate=False):
        root, state = Path(directory) / "root", Path(directory) / "state"
        root.mkdir(exist_ok=True)
        state.mkdir(exist_ok=True)
        journal = {"status": "ready", "root": str(root.resolve()), "schema": manifest()["schema"],
                   "images": {name: "old-" + name for name in release.APPS + deploy.cloud.DATABASES}}
        (state / "journal.json").write_text(json.dumps(journal))
        settings = {"root": str(root), "state": str(state), "public_url": "https://site.test", "pull_secret": "ghcr-read"}
        instance = deploy.ReleaseDeployment(settings, value or manifest(), mode, migrate)
        # Disk behavior is exercised separately with controlled filesystems/capacity.
        instance.check_disk_space = MagicMock()
        return instance

    def test_polling_only_configuration_requires_a_documented_exception(self):
        path = MagicMock()
        path.stat.return_value.st_uid = 0
        path.stat.return_value.st_mode = 0o100644
        path.read_text.return_value = json.dumps({"environment": "production", "same_origin_verified": True,
                                                 "require_websocket": False})
        with self.assertRaisesRegex(ValueError, "documented WebSocket exception"):
            deploy.configuration(path, "production")

    def test_no_first_install_or_incomplete_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "journal.json").write_text('{"status":"incomplete"}')
            with self.assertRaisesRegex(deploy.cloud.Blocked, "recover"):
                deploy.ReleaseDeployment({"root": directory, "state": directory}, manifest(), "promote", False)

    def test_migration_requires_verified_backup_and_cannot_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(deploy.cloud.Blocked, "backup"):
                self.instance(directory, migrate=True)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(deploy.cloud.Blocked, "Rollback"):
                self.instance(directory, mode="rollback", migrate=True)

    def test_prefetch_pulls_all_images_without_building_or_stopping_apps(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.config = config()
            instance.k = MagicMock()
            instance.apply = MagicMock()
            instance.stop_apps = MagicMock()
            instance.build()
            self.assertEqual(instance.apply.call_count, 7)
            instance.stop_apps.assert_not_called()
            for call in instance.apply.call_args_list:
                pod = call.args[0]["spec"]["template"]["spec"]
                self.assertEqual(pod["imagePullSecrets"], [{"name": "ghcr-read"}])
                self.assertIn("@sha256:", pod["containers"][0]["image"])
            self.assertEqual(instance.images["postgres"], "old-postgres")

    def test_failed_pull_does_not_stop_live_apps(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.config = config()
            instance.apply = MagicMock()
            instance.k = MagicMock(side_effect=deploy.cloud.Blocked("pull failed"))
            instance.stop_apps = MagicMock()
            with self.assertRaises(deploy.cloud.Blocked):
                instance.build()
            instance.stop_apps.assert_not_called()

    def test_registry_policy_is_scoped_to_apps_and_migration_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.config = config()
            instance.images = {**instance.journal["images"], **manifest()["images"]}
            instance.k = MagicMock()
            instance.apply = MagicMock()
            instance.migration("auth-service", ["npx", "prisma", "migrate", "status"], "status")
            job = instance.apply.call_args_list[1].args[0]
            pod = job["spec"]["template"]["spec"]
            self.assertEqual(pod["containers"][0]["imagePullPolicy"], "IfNotPresent")
            self.assertEqual(pod["imagePullSecrets"], [{"name": "ghcr-read"}])
            self.assertEqual(job["spec"]["backoffLimit"], 0)

    def test_registry_workloads_preserve_database_policy_and_storage_paths(self):
        value = config()
        value["services"].update({name: {} for name in deploy.cloud.DATABASES})
        images = {**manifest()["images"], **{name: "local-" + name for name in deploy.cloud.DATABASES}}
        resources = deploy.cloud.manifests(value, images, Path("/private-state"), apps_enabled=True)["items"]
        deployments = {item["metadata"]["name"]: item for item in resources if item["kind"] == "Deployment"}
        for name in deploy.cloud.APPS + deploy.cloud.DATABASES:
            pod = deployments[name]["spec"]["template"]["spec"]
            container = pod["containers"][0]
            registry = name in deploy.cloud.APPS
            self.assertEqual(container["imagePullPolicy"], "IfNotPresent" if registry else "Never")
            self.assertEqual("imagePullSecrets" in pod, registry)
            self.assertEqual([mount["mountPath"] for mount in container["volumeMounts"]], list(deploy.cloud.FILES.get(name, ())))

    def test_public_failure_blocks_successful_journal_update(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.config = config()
            instance.k = MagicMock()
            with patch.object(deploy.cloud.Deployment, "verify_deployment"), patch.object(smoke, "check", side_effect=ValueError("bad public route")):
                with self.assertRaisesRegex(ValueError, "public route"):
                    instance.verify_deployment()
            saved = json.loads(instance.journal_path.read_text())
            self.assertNotIn("release", saved)

    def test_wrong_architecture_blocks_before_fetch_or_rollout(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            with patch.object(deploy.cloud.Deployment, "preflight"), patch.object(deploy.platform, "machine", return_value="aarch64"):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "platform"):
                    instance.preflight()

    def test_full_deploy_records_release_only_after_public_success(self):
        for succeeds in (True, False):
            with self.subTest(succeeds=succeeds), tempfile.TemporaryDirectory() as directory:
                instance = self.instance(directory)
                instance.config = config()
                for method in ("preflight", "install", "check_migrations", "stop_apps", "wait_databases"):
                    setattr(instance, method, MagicMock())
                instance.apply = MagicMock()
                def kubectl(*args, **kwargs):
                    if args[0] == "get" and args[1].startswith("deployment/"):
                        name = args[1].split("/")[1]
                        return json.dumps({"spec": {"template": {"spec": {"containers": [{"image": manifest()["images"][name]}]}}}})
                    return ""
                instance.k = MagicMock(side_effect=kubectl)
                failure = None if succeeds else ValueError("public failure")
                with patch.object(deploy.cloud, "manifests", return_value={}), patch.object(deploy.cloud.Deployment, "verify_deployment"), patch.object(smoke, "check", side_effect=failure):
                    if succeeds:
                        instance.deploy()
                    else:
                        with self.assertRaisesRegex(ValueError, "public failure"):
                            instance.deploy()
                saved = json.loads(instance.journal_path.read_text())
                self.assertEqual(saved["status"], "ready" if succeeds else "incomplete")
                self.assertEqual(saved.get("release"), manifest() if succeeds else None)
                instance.stop_apps.assert_called_once()

    def test_rollback_schema_mismatch_is_rejected_before_downtime(self):
        with tempfile.TemporaryDirectory() as directory:
            target = manifest()
            target["schema"] = "d" * 64
            instance = self.instance(directory, target, mode="rollback")
            instance.journal["release"] = manifest()
            instance.config = config()
            instance.stop_apps = MagicMock()
            with patch.object(deploy.cloud.Deployment, "preflight"), patch.object(deploy.platform, "machine", return_value="x86_64"), patch.object(release, "git", return_value=b"https://github.com/wisit23/Ise"), patch.object(release, "schema_fingerprint", return_value=target["schema"]), patch.object(deploy.cloud, "run"):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "unchanged schema"):
                    instance.preflight()
            instance.stop_apps.assert_not_called()

    def test_stale_promotion_is_blocked_before_downtime(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.journal["release"] = manifest()
            instance.config = config()
            instance.stop_apps = MagicMock()
            with patch.object(deploy.cloud.Deployment, "preflight"), patch.object(deploy.platform, "machine", return_value="x86_64"), patch.object(release, "git", return_value=b"https://github.com/wisit23/Ise"), patch.object(release, "schema_fingerprint", return_value=manifest()["schema"]), patch.object(deploy.cloud, "run", side_effect=["", "", deploy.cloud.Blocked("not an ancestor")]):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "ancestor"):
                    instance.preflight()
            instance.stop_apps.assert_not_called()

    def test_missing_backup_exporter_blocks_migration_before_server_work(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.migrate = True
            instance.backup_exporter = MagicMock(side_effect=FileNotFoundError("missing exporter"))
            with patch.object(deploy.cloud.Deployment, "preflight") as original:
                with self.assertRaises(FileNotFoundError):
                    instance.preflight()
                original.assert_not_called()

    def test_low_disk_blocks_before_any_pull_or_downtime(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.settings["image_store"] = str(instance.root)
            instance.config = config()
            instance.apply, instance.k, instance.stop_apps = MagicMock(), MagicMock(), MagicMock()
            instance.check_disk_space = lambda **kwargs: deploy.ReleaseDeployment.check_disk_space(instance, **kwargs)
            with patch.object(deploy.shutil, "disk_usage", return_value=MagicMock(free=13 * deploy.GIB)):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "14.0 GiB required"):
                    instance.build()
            instance.apply.assert_not_called()
            instance.stop_apps.assert_not_called()
            self.assertEqual(json.loads(instance.journal_path.read_text())["status"], "ready")

    def test_low_disk_after_first_pull_stops_remaining_pulls_with_live_apps_running(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.settings["image_store"] = str(instance.root)
            instance.config = config()
            instance.apply, instance.k, instance.stop_apps = MagicMock(), MagicMock(), MagicMock()
            instance.check_disk_space = lambda **kwargs: deploy.ReleaseDeployment.check_disk_space(instance, **kwargs)
            with patch.object(deploy.shutil, "disk_usage", side_effect=[MagicMock(free=20 * deploy.GIB), MagicMock(free=9 * deploy.GIB)]):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "10.0 GiB required"):
                    instance.build()
            self.assertEqual(instance.apply.call_count, 1)
            instance.stop_apps.assert_not_called()

    def test_migration_disk_budget_includes_snapshot_before_pull(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            instance.settings["image_store"] = str(instance.root)
            instance.migrate = True
            (instance.state / "data").mkdir()
            with patch.object(deploy.shutil, "disk_usage", return_value=MagicMock(free=25 * deploy.GIB)), patch.object(deploy.cloud, "run", return_value=str(20 * deploy.GIB) + " data"):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "26.0 GiB required"):
                    deploy.ReleaseDeployment.check_disk_space(instance, pulling=True)

    def test_image_disk_checked_independently_when_storage_is_on_another_mount(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.instance(directory)
            image_store = MagicMock()
            image_store.is_dir.return_value = True
            image_store.stat.return_value.st_dev = instance.state.stat().st_dev + 1
            with patch.object(deploy, "Path", return_value=image_store), patch.object(deploy.shutil, "disk_usage", side_effect=[MagicMock(free=50 * deploy.GIB), MagicMock(free=13 * deploy.GIB)]):
                with self.assertRaisesRegex(deploy.cloud.Blocked, "14.0 GiB required"):
                    deploy.ReleaseDeployment.check_disk_space(instance, pulling=True)

    def test_invalid_disk_budget_is_rejected(self):
        for value in (0, -1, True, 1.5, "4"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                deploy.pull_budget({"image_pull_budget_gib": value})


class SmokeTests(unittest.TestCase):
    def test_insecure_or_non_origin_urls_rejected_before_network(self):
        for url in ("http://site.test", "https://site.test/path", "https://user:pass@site.test", "https://site.test?x=1"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                smoke.check(url)

    def responses(self, feed=b'{"items":[]}', polling=b'0{"sid":"test-session"}'):
        result = []
        for body in (b"<html></html>", feed, polling):
            response = MagicMock()
            response.__enter__.return_value = response
            response.status, response.url = 200, "https://site.test"
            response.read.return_value = body
            result.append(response)
        return result

    def test_same_origin_api_polling_and_websocket_handshake(self):
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status = 101
        key = base64.b64encode(b"x" * 16).decode()
        response.getheader.return_value = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        with patch.object(smoke, "build_opener") as opener, patch.object(smoke.os, "urandom", return_value=b"x" * 16), patch.object(smoke.http.client, "HTTPSConnection", return_value=connection):
            opener.return_value.open.side_effect = self.responses()
            smoke.check("https://site.test")
            self.assertEqual(opener.return_value.open.call_count, 3)
            self.assertEqual(connection.request.call_args.kwargs["headers"]["Upgrade"], "websocket")

    def test_frontend_html_instead_of_feed_is_not_success(self):
        with patch.object(smoke, "build_opener") as opener:
            opener.return_value.open.side_effect = self.responses(feed=b"<html>frontend fallback</html>")
            with self.assertRaises(ValueError):
                smoke.check("https://site.test")

    def test_polling_fallback_is_not_a_websocket_upgrade(self):
        with patch.object(smoke, "build_opener") as opener, patch.object(smoke.http.client, "HTTPSConnection") as connection:
            opener.return_value.open.side_effect = self.responses()
            connection.return_value.getresponse.return_value.status = 200
            with self.assertRaisesRegex(ValueError, "upgrade"):
                smoke.check("https://site.test")

    def test_approved_polling_exception_does_not_relax_http_checks(self):
        connection = MagicMock()
        connection.getresponse.return_value.status = 400
        with patch.object(smoke, "build_opener") as opener, patch.object(smoke.http.client, "HTTPSConnection", return_value=connection):
            opener.return_value.open.side_effect = self.responses()
            smoke.check("https://site.test", require_websocket=False)
            opener.return_value.open.side_effect = self.responses(feed=b"<html>broken route</html>")
            with self.assertRaises(ValueError):
                smoke.check("https://site.test", require_websocket=False)

    def test_websocket_network_failure_is_tolerated_only_with_exception(self):
        connection = MagicMock()
        connection.getresponse.side_effect = OSError("proxy unavailable")
        with patch.object(smoke, "build_opener") as opener, patch.object(smoke.http.client, "HTTPSConnection", return_value=connection):
            opener.return_value.open.side_effect = self.responses()
            smoke.check("https://site.test", require_websocket=False)
            opener.return_value.open.side_effect = self.responses()
            with self.assertRaises(OSError):
                smoke.check("https://site.test")


if __name__ == "__main__":
    unittest.main()
