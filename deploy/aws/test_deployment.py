import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import bundle
import rollout


def release():
    registry = "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com"
    return {"format": 1, "node": "22", "commit": "a" * 40, "version_label": "new-release", "region": "ap-southeast-2", "registry": registry,
            "images": {app: registry + "/reloop/" + app + "@sha256:" + "b" * 64 for app in bundle.APPS}}


def config():
    return {"application": "reloop", "blue": "reloop-blue", "green": "reloop-green", "production_cname": "production.elasticbeanstalk.com",
            "production_url": "https://api.example.com", "blue_url": "https://blue.example.com", "green_url": "https://green.example.com"}


class FakeAws:
    def __init__(self):
        self.calls = []
        self.environments = [
            {"EnvironmentName": "reloop-blue", "ApplicationName": "reloop", "VersionLabel": "old-release", "CNAME": "production.elasticbeanstalk.com", "Status": "Ready", "Health": "Green"},
            {"EnvironmentName": "reloop-green", "ApplicationName": "reloop", "VersionLabel": "new-release", "CNAME": "candidate.elasticbeanstalk.com", "Status": "Ready", "Health": "Green"},
        ]

    def call(self, *args):
        self.calls.append(args)
        if args[:2] == ("elasticbeanstalk", "describe-environments"):
            return {"Environments": copy.deepcopy(self.environments)}
        if args[:2] == ("elasticbeanstalk", "swap-environment-cnames"):
            self.environments[0]["CNAME"], self.environments[1]["CNAME"] = self.environments[1]["CNAME"], self.environments[0]["CNAME"]
        if args[:2] == ("elasticbeanstalk", "update-environment"):
            name = args[args.index("--environment-name") + 1]
            target = next(e for e in self.environments if e["EnvironmentName"] == name)
            target["VersionLabel"] = args[args.index("--version-label") + 1]
        return {}

    def swaps(self):
        return [c for c in self.calls if c[:2] == ("elasticbeanstalk", "swap-environment-cnames")]


def staged_release():
    value = release()
    value["deployment"] = {"application": "reloop", "production_cname": config()["production_cname"], "active": "reloop-blue", "candidate": "reloop-green", "previous_version": "old-release"}
    return value


class BundleTests(unittest.TestCase):
    def test_bundle_has_only_stateless_backend_and_executable_lf_hooks(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            bundle.build(release(), output)
            with zipfile.ZipFile(output / "application.zip") as archive:
                self.assertNotIn(".env", archive.namelist())
                services = json.loads(archive.read("docker-compose.yml"))["services"]
                self.assertEqual(set(services), set(bundle.APPS))
                for app, service in services.items():
                    self.assertNotIn("volumes", service)
                    self.assertNotIn("build", service)
                    self.assertIn("/ready", service["healthcheck"]["test"][-1])
                    if app != "gateway":
                        self.assertNotIn("ports", service)
                        self.assertEqual(service["environment"]["MEDIA_STORAGE_DRIVER"], "s3")
                self.assertEqual(services["gateway"]["ports"], ["80:8080"])
                self.assertEqual(services["gateway"]["environment"]["RELEASE_ID"], release()["version_label"])
                self.assertEqual(services["auth-service"]["environment"]["DATABASE_URL"], bundle.required("DATABASE_URL_AUTH"))
                self.assertNotIn("JWT_REFRESH_SECRET", services["gateway"]["environment"])
                for name in archive.namelist():
                    if name.endswith(".sh"):
                        self.assertEqual(archive.getinfo(name).create_system, 3)
                        self.assertTrue(archive.getinfo(name).external_attr >> 16 & 0o111)
                        self.assertNotIn(b"\r", archive.read(name))

    def test_rejects_tags_foreign_registry_incomplete_or_cross_region_release(self):
        for field, value in [("node", "24"), ("commit", "main"), ("region", "ap-southeast-1")]:
            item = release()
            item[field] = value
            with self.assertRaises(ValueError):
                bundle.validate_release(item)
        for image in ["public.ecr.aws/evil:latest", release()["registry"] + "/reloop/gateway:latest"]:
            item = release()
            item["images"]["gateway"] = image
            with self.assertRaises(ValueError):
                bundle.validate_release(item)
        item = release()
        del item["images"]["chat-service"]
        with self.assertRaises(ValueError):
            bundle.validate_release(item)


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.record = Path(self.directory.name) / "record.json"
        self.aws = FakeAws()
        self.probe = patch.object(rollout, "probe", side_effect=lambda origin, version=None: version).start()
        self.addCleanup(patch.stopall)
        patch.object(rollout, "eventually", side_effect=lambda operation: operation()).start()

    def test_stage_updates_only_inactive_and_records_previous_version(self):
        value = rollout.stage(self.aws, config(), release(), Path("application.zip"), "artifact-bucket", self.record)
        updates = [c for c in self.aws.calls if c[:2] == ("elasticbeanstalk", "update-environment")]
        self.assertEqual(updates[0][3], "reloop-green")
        self.assertEqual(value["deployment"]["previous_version"], "old-release")
        self.assertEqual(self.aws.swaps(), [])
        self.assertIn("--if-none-match", self.aws.calls[1])

    def test_successful_promotion_and_recorded_rollback(self):
        record = rollout.promote(self.aws, config(), staged_release(), self.record)
        self.assertEqual(record["state"], "promoted")
        self.assertEqual(rollout.pair(self.aws, config())[0]["EnvironmentName"], "reloop-green")
        rollout.rollback(self.aws, config(), record, self.record)
        self.assertEqual(json.loads(self.record.read_text())["state"], "rolled_back")
        self.assertEqual(rollout.pair(self.aws, config())[0]["EnvironmentName"], "reloop-blue")

    def test_stale_candidate_never_swaps(self):
        self.aws.environments[1]["VersionLabel"] = "another-release"
        with self.assertRaisesRegex(ValueError, "stale"):
            rollout.promote(self.aws, config(), staged_release(), self.record)
        self.assertEqual(self.aws.swaps(), [])

    def test_wrong_production_cname_never_mutates(self):
        cfg = config()
        cfg["production_cname"] = "other.elasticbeanstalk.com"
        with self.assertRaises(ValueError):
            rollout.stage(self.aws, cfg, release(), Path("application.zip"), "bucket", self.record)
        self.assertEqual(len(self.aws.calls), 1)

    def test_failed_public_smoke_reverses_confirmed_swap(self):
        def probe(origin, commit=None):
            if origin == config()["production_url"] and commit == "new-release":
                raise ValueError("new release failed")
            return commit
        self.probe.side_effect = probe
        with self.assertRaisesRegex(ValueError, "rolled_back"):
            rollout.promote(self.aws, config(), staged_release(), self.record)
        self.assertEqual(len(self.aws.swaps()), 2)
        self.assertEqual(json.loads(self.record.read_text())["state"], "rolled_back")

    def test_repeated_or_stale_rollback_is_refused(self):
        with self.assertRaises(ValueError):
            rollout.rollback(self.aws, config(), {"state": "rolled_back"}, self.record)
        record = rollout.promote(self.aws, config(), staged_release(), self.record)
        self.aws.environments[0]["VersionLabel"] = "overwritten-old-release"
        with self.assertRaisesRegex(ValueError, "stale"):
            rollout.rollback(self.aws, config(), record, self.record)
        self.assertEqual(len(self.aws.swaps()), 1)

    def test_smoke_checks_ready_health_identity_and_product_api(self):
        # Call the real function captured before the mock instead of contacting a server.
        with patch.object(rollout, "request_json", side_effect=[{"status": "ready"}, {"status": "ok", "service": "gateway", "release": "a" * 40}, []]) as request:
            self.assertEqual(REAL_PROBE("https://api.example.com", "a" * 40), "a" * 40)
            self.assertEqual(request.call_args.args[0], "https://api.example.com/api/products/feed")
        with patch.object(rollout, "request_json", side_effect=[{"status": "ready"}, {"status": "ok", "service": "gateway", "release": "wrong"}]) as request:
            with self.assertRaisesRegex(ValueError, "different release"):
                REAL_PROBE("https://api.example.com", "a" * 40)
            self.assertEqual(request.call_count, 2)


REAL_PROBE = rollout.probe

if __name__ == "__main__":
    unittest.main()
