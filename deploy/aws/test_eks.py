import copy
import unittest

import bundle
import eks
import eks_secret


def release():
    registry = "997229934811.dkr.ecr.ap-southeast-2.amazonaws.com"
    return {"format": 1, "node": "22", "commit": "a" * 40, "version_label": "a" * 40 + "-43126302503-1",
            "region": "ap-southeast-2", "registry": registry,
            "images": {app: registry + "/reloop/" + app + "@sha256:" + "b" * 64 for app in bundle.APPS}}


def config():
    return {"frontend_origin": "https://staging.example.com", "media_bucket": "reloop-staging-media",
            "mail_from": "RE-LOOP <sender@example.com>", "smtp_host": "smtp.example.com"}


class EksTests(unittest.TestCase):
    def test_only_backend_runs_with_digest_images_external_data_and_role_credentials(self):
        items = eks.manifests(release(), config())
        deployments = [item for item in items if item["kind"] == "Deployment"]
        self.assertEqual({item["metadata"]["name"] for item in deployments}, set(bundle.APPS))
        self.assertFalse(any(item["kind"] in {"Secret", "StatefulSet", "PersistentVolumeClaim"} for item in items))
        for deployment in deployments:
            app = deployment["metadata"]["name"]
            self.assertEqual(deployment["metadata"]["namespace"], eks.NAMESPACE)
            self.assertNotIn("replicas", deployment["spec"])
            pod = deployment["spec"]["template"]["spec"]
            self.assertEqual(pod["serviceAccountName"], eks.SERVICE_ACCOUNT)
            self.assertEqual(pod["securityContext"]["runAsUser"], 1000)
            container = pod["containers"][0]
            self.assertEqual(container["image"], release()["images"][app])
            self.assertNotIn("command", container)
            self.assertNotIn("args", container)
            self.assertEqual(container["readinessProbe"]["httpGet"]["path"], "/ready")
            self.assertEqual(container["livenessProbe"]["httpGet"]["path"], "/health")
            env = {e["name"]: e for e in container["env"]}
            self.assertFalse(any("${" in e.get("value", "") for e in container["env"]))
            self.assertNotIn("AWS_ACCESS_KEY_ID", env)
            self.assertNotIn("AWS_SECRET_ACCESS_KEY", env)
            self.assertIn("secretKeyRef", env["JWT_ACCESS_SECRET"]["valueFrom"])
            if app != "gateway":
                self.assertEqual(env["DATABASE_URL"]["valueFrom"]["secretKeyRef"]["key"], "DATABASE_URL_" + app.removesuffix("-service").upper())
                self.assertEqual(env["MEDIA_STORAGE_DRIVER"]["value"], "s3")
                self.assertEqual(env["S3_BUCKET"]["valueFrom"]["configMapKeyRef"]["key"], "S3_BUCKET")
                self.assertEqual(env["S3_KEY_PREFIX"]["value"], "reloop-staging")

    def test_private_ingress_readiness_and_polling_affinity_are_consistent(self):
        items = eks.manifests(release(), config())
        ingress = next(i for i in items if i["kind"] == "Ingress")
        self.assertEqual(ingress["spec"]["ingressClassName"], eks.NAMESPACE)
        self.assertEqual(ingress["metadata"]["annotations"]["alb.ingress.kubernetes.io/listen-ports"], '[{"HTTP":80}]')
        self.assertNotIn("host", ingress["spec"]["rules"][0])
        self.assertIn("stickiness.enabled=true", ingress["metadata"]["annotations"]["alb.ingress.kubernetes.io/target-group-attributes"])
        self.assertEqual(ingress["spec"]["rules"][0]["http"]["paths"][0]["backend"]["service"]["name"], "gateway")
        chat = next(i for i in items if i["kind"] == "Service" and i["metadata"]["name"] == "chat-service")
        self.assertEqual(chat["spec"]["sessionAffinity"], "ClientIP")
        self.assertTrue(all(i["spec"]["type"] == "ClusterIP" for i in items if i["kind"] == "Service"))

    def test_bad_configuration_is_rejected_before_rendering(self):
        for key, value in [("frontend_origin", "https://front.example.com/"),
                           ("frontend_origin", "http://front.example.com"), ("media_bucket", "invalid/bucket"),
                           ("smtp_host", "smtp.example.com\nINJECTED=yes")]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                eks.manifests(release(), {**config(), key: value})
        bad = copy.deepcopy(release())
        bad["images"]["gateway"] = bad["registry"] + "/reloop/gateway:latest"
        with self.assertRaises(ValueError):
            eks.manifests(bad, config())

    def test_config_changes_get_new_immutable_name_for_rollback(self):
        old = eks.manifests(release(), config())[0]
        new = eks.manifests(release(), {**config(), "frontend_origin": "https://next.example.com"})[0]
        self.assertTrue(old["immutable"])
        self.assertNotEqual(old["metadata"]["name"], new["metadata"]["name"])

    def test_admin_resources_are_separate_and_ci_cannot_read_secrets(self):
        items = eks.platform()
        role = next(i for i in items if i["kind"] == "Role")
        self.assertFalse(any("secrets" in rule["resources"] or "*" in rule["verbs"] for rule in role["rules"]))
        params = next(i for i in items if i["kind"] == "IngressClassParams")
        self.assertEqual(params["spec"]["scheme"], "internal")
        pool = next(i for i in items if i["kind"] == "NodePool")
        self.assertEqual(pool["spec"]["limits"], {"cpu": "8", "memory": "32Gi"})
        workloads = eks.manifests(release(), config())
        self.assertFalse(any(i["kind"] in {"NodePool", "Role", "Namespace", "IngressClass"} for i in workloads))

    def test_runtime_secret_import_rejects_missing_values_and_static_aws_keys(self):
        values = {key: "test-value" for key in eks.SECRET_KEYS - {"SMTP_USER", "SMTP_PASS"}}
        result = eks_secret.secret(values)
        self.assertEqual(result["metadata"]["namespace"], eks.NAMESPACE)
        self.assertEqual(set(result["data"]), set(values))
        for bad in ({}, {**values, "AWS_SECRET_ACCESS_KEY": "forbidden"}, {**values, "REDIS_URL": ""}):
            with self.assertRaises(ValueError):
                eks_secret.secret(bad)


if __name__ == "__main__":
    unittest.main()
