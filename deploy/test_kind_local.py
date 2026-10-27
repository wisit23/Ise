import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("kind_local", Path(__file__).with_name("kind-local.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MigrationResources(unittest.TestCase):
    def test_service_can_be_created_in_another_cluster(self):
        service = {"kind": "Service", "metadata": {"name": "gateway", "uid": "old", "resourceVersion": "1", "annotations": {"old": "value"}},
                   "spec": {"clusterIP": "10.96.1.1", "clusterIPs": ["10.96.1.1"], "selector": {"app": "gateway"}, "ports": [{"port": 8080}]}, "status": {}}
        result = module.clean(service)
        self.assertEqual(result["spec"]["ports"][0]["nodePort"], 30081)
        self.assertEqual(result["spec"]["type"], "NodePort")
        self.assertNotIn("clusterIP", result["spec"])
        self.assertNotIn("uid", result["metadata"])
        self.assertIn("uid", service["metadata"])

    def test_claim_is_not_bound_to_source_volume(self):
        claim = {"kind": "PersistentVolumeClaim", "metadata": {"name": "data"}, "spec": {"volumeName": "source-volume", "storageClassName": "standard"}}
        self.assertNotIn("volumeName", module.clean(claim)["spec"])

    def test_headless_database_service_is_preserved(self):
        service = {"kind": "Service", "metadata": {"name": "mongo"}, "spec": {"clusterIP": "None", "clusterIPs": ["None"]}}
        self.assertEqual(module.clean(service)["spec"]["clusterIP"], "None")

    def test_migration_refuses_to_overwrite_existing_target(self):
        with patch.object(module, "run", return_value=module.SOURCE + "\n" + module.TARGET) as command:
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                module.migrate()
            command.assert_called_once_with("kind", "get", "clusters")

    def test_start_refuses_unowned_container_before_mutation(self):
        with patch.object(module, "run", return_value='{"Config":{"Labels":{}}}') as command:
            # docker inspect returns an array.
            command.return_value = '[' + command.return_value + ']'
            with self.assertRaisesRegex(RuntimeError, "not owned"):
                module.start()
            command.assert_called_once_with("docker", "inspect", module.NODE)

    def test_resume_refuses_to_restore_over_existing_workloads(self):
        node = [{"Config": {"Labels": {"io.x-k8s.kind.cluster": module.TARGET}}}]
        with patch.object(module, "run", return_value=json.dumps(node)), patch.object(module, "get", return_value={"items": [{"kind": "Deployment"}]}), patch.object(module, "restore") as restore:
            with self.assertRaisesRegex(RuntimeError, "already exist"):
                module.resume(module.STATE / "test-backup")
            restore.assert_not_called()


if __name__ == "__main__":
    unittest.main()
