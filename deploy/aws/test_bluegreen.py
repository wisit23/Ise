import copy
import json
import unittest
from unittest.mock import patch

from bundle import APPS
import eks
import eks_bluegreen as bg
from bluegreen_rollout import Rollout, env_of, summary
from test_eks import release, config


def capable(version="blue-release"):
    value = release()
    value["capabilities"] = [bg.CAPABILITY]
    value["version_label"] = version
    return value


class Cluster:
    """A resource/API consumer fixture, not evidence of live AWS reconciliation."""
    def __init__(self):
        self.objects = {}
        self.events = []
        self.routes = {"blue": 100}
        self.unhealthy = set()
        self.lingering_workers = False
        self.apply(bg.manifests(capable(), config(), "blue", workers=True))
        original = next(i for i in eks.manifests(capable(), config()) if i["kind"] == "Ingress")
        self.objects["ingress", "gateway"] = {"metadata": {"name": "gateway"}, "spec": original["spec"], "status": {
            "loadBalancer": {"ingress": [{"hostname": "internal.test"}]}}}

    def get(self, kind, name):
        return copy.deepcopy(self.objects.get((kind, name)))

    def apply(self, items):
        for item in items:
            self.objects[item["kind"].lower(), item["metadata"]["name"]] = copy.deepcopy(item)
        self.events.append(("apply",))

    def create_state(self, obj):
        if ("configmap", bg.STATE_NAME) in self.objects:
            raise RuntimeError("Already exists")
        obj = copy.deepcopy(obj)
        obj["metadata"]["resourceVersion"] = "1"
        self.objects["configmap", bg.STATE_NAME] = obj
        return copy.deepcopy(obj)

    def replace_state(self, obj):
        old = self.objects["configmap", bg.STATE_NAME]
        if old["metadata"]["resourceVersion"] != obj["metadata"]["resourceVersion"]:
            raise RuntimeError("Conflict")
        obj = copy.deepcopy(obj)
        obj["metadata"]["resourceVersion"] = str(int(old["metadata"]["resourceVersion"]) + 1)
        self.objects["configmap", bg.STATE_NAME] = obj
        return copy.deepcopy(obj)

    def kubectl(self, *args):
        if args[:2] != ("set", "env"):
            raise AssertionError(args)
        name = args[2].split("/", 1)[1]
        value = args[3].split("=", 1)[1]
        container = self.objects["deployment", name]["spec"]["template"]["spec"]["containers"][0]
        next(e for e in container["env"] if e["name"] == "BACKGROUND_WORKERS_ENABLED")["value"] = value
        self.events.append(("workers", name, value))
        return "updated"

    def rollout(self, name):
        if ("deployment", name) not in self.objects:
            raise RuntimeError("Missing deployment")

    def readiness(self, app, slot):
        container = self.objects["deployment", bg.slot_name(app, slot)]["spec"]["template"]["spec"]["containers"][0]
        env = env_of(container)
        return {"status": "ready", "release": env["RELEASE_ID"], "deploymentSlot": env["DEPLOYMENT_SLOT"],
                "backgroundWorkersEnabled": env["BACKGROUND_WORKERS_ENABLED"] == "true"}

    def service_json(self, name, path):
        slot = "green" if name.endswith("-green") else "blue"
        if path == "/api/products/feed":
            return {"items": []}
        return {**self.readiness("gateway", slot), "status": "ok", "service": "gateway"}

    def public_json(self, origin, path):
        slot = next(slot for slot, weight in self.routes.items() if weight == 100)
        if path == "/ready":
            return self.readiness("gateway", slot)
        return self.service_json(bg.slot_name("gateway", slot), path)

    def patch(self, kind, name, value):
        action = json.loads(value["metadata"]["annotations"][bg.ACTION_KEY])
        self.routes = {"green" if t["serviceName"].endswith("-green") else "blue": t["weight"]
                       for t in action["forwardConfig"]["targetGroups"]}
        self.events.append(("route", copy.deepcopy(self.routes)))

    def items(self, kind, selector=None):
        if kind == "targetgroupbindings.eks.amazonaws.com":
            return [{"spec": {"serviceRef": {"name": bg.slot_name("gateway", slot)}, "targetGroupARN": "tg-" + slot}}
                    for slot in self.routes]
        if kind != "pods":
            raise AssertionError(kind)
        app_name = selector.split("=", 1)[1]
        obj = self.get("deployment", app_name)
        if not obj:
            return []
        slot = "green" if app_name.endswith("-green") else "blue"
        pods = [{"metadata": {"name": app_name + str(i)}, "spec": copy.deepcopy(obj["spec"]["template"]["spec"]),
                 "status": {"podIP": f"10.0.{1 if slot == 'blue' else 2}.{i}"}} for i in (1, 2)]
        if self.lingering_workers and app_name == "auth-service":
            old = copy.deepcopy(pods[0])
            old["metadata"]["deletionTimestamp"] = "now"
            next(e for e in old["spec"]["containers"][0]["env"] if e["name"] == "BACKGROUND_WORKERS_ENABLED")["value"] = "true"
            pods.append(old)
        return pods

    def aws(self, service, operation, *args):
        if operation == "describe-load-balancers":
            return {"LoadBalancers": [{"DNSName": "internal.test", "Scheme": "internal", "State": {"Code": "active"},
                                       "LoadBalancerArn": "existing-alb"}]}
        if operation == "describe-listeners":
            return {"Listeners": [{"Port": 80, "ListenerArn": "listener"}]}
        if operation == "describe-rules":
            return {"Rules": [{"Conditions": [{"Field": "path-pattern", "PathPatternConfig": {"Values": ["/*"]}}],
                "Actions": [{"Type": "forward", "ForwardConfig": {"TargetGroupStickinessConfig": {
                    "Enabled": True, "DurationSeconds": 1}, "TargetGroups": [
                {"TargetGroupArn": "tg-" + slot, "Weight": weight} for slot, weight in self.routes.items()]}}]}]}
        if operation == "describe-target-health":
            slot = args[1].removeprefix("tg-")
            return {"TargetHealthDescriptions": [{"Target": {"Id": p["status"]["podIP"]}, "TargetHealth": {
                "State": "unhealthy" if slot in self.unhealthy else "healthy"}}
                for p in self.items("pods", "app.kubernetes.io/name=" + bg.slot_name("gateway", slot))]}
        raise AssertionError(operation)

    def wait(self, check, label, timeout=240):
        if not check():
            raise RuntimeError("Timed out: " + label)


class BluegreenTests(unittest.TestCase):
    def test_slots_isolate_service_dns_selectors_and_keep_hpa_security(self):
        old = release()
        with self.assertRaisesRegex(ValueError, "Build new images"):
            bg.manifests(old, config(), "green")
        for slot in ("blue", "green"):
            items = bg.manifests(capable(), config(), slot)
            self.assertFalse(any(i["kind"] in {"Ingress", "Secret", "NodePool", "Role"} for i in items))
            deployments = [i for i in items if i["kind"] == "Deployment"]
            self.assertEqual(len(deployments), 6)
            for dep in deployments:
                app = next(a for a in APPS if bg.slot_name(a, slot) == dep["metadata"]["name"])
                container = dep["spec"]["template"]["spec"]["containers"][0]
                env = env_of(container)
                self.assertEqual(env["BACKGROUND_WORKERS_ENABLED"], "false")
                self.assertEqual(env["DEPLOYMENT_SLOT"], slot)
                self.assertTrue(container["securityContext"]["readOnlyRootFilesystem"])
                self.assertNotIn("replicas", dep["spec"])
                for target in APPS[1:]:
                    key = target.upper().replace("-", "_") + "_URL"
                    self.assertIn("http://" + bg.slot_name(target, slot) + ":", env[key])
                service = next(i for i in items if i["kind"] == "Service" and i["metadata"]["name"] == bg.slot_name(app, slot))
                self.assertEqual(service["spec"]["selector"], dep["spec"]["selector"]["matchLabels"])
                if slot == "blue":
                    original = next(i for i in eks.manifests(capable(), config()) if i["kind"] == "Deployment" and i["metadata"]["name"] == app)
                    self.assertEqual(dep["spec"]["selector"], original["spec"]["selector"])

    def bootstrap(self, cluster):
        op = Rollout(cluster, "https://api.example.com")
        op.bootstrap(capable(), config())
        op.finish()

    def prepare(self, cluster):
        op = Rollout(cluster, "https://api.example.com")
        op.load_lock("blue-release")
        op.prepare("green", capable("green-release"), config())
        op.finish()

    def test_prepare_promote_and_rollback_through_resource_and_http_consumers(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        self.prepare(cluster)
        self.assertEqual(cluster.routes, {"blue": 100, "green": 0})
        self.assertFalse(cluster.readiness("order-service", "green")["backgroundWorkersEnabled"])
        begin = len(cluster.events)
        op = Rollout(cluster, "https://api.example.com")
        op.load_lock("blue-release")
        op.switch("green", "green-release")
        op.finish()
        events = cluster.events[begin:]
        enabling = next(i for i, event in enumerate(events) if event[0] == "workers" and event[2] == "true")
        for app in bg.WORKER_APPS:
            self.assertIn(("workers", app, "false"), events[:enabling])
            self.assertFalse(cluster.readiness(app, "blue")["backgroundWorkersEnabled"])
            self.assertTrue(cluster.readiness(app, "green")["backgroundWorkersEnabled"])
        self.assertEqual(cluster.routes, {"blue": 0, "green": 100})
        self.assertEqual(summary(cluster.get("configmap", bg.STATE_NAME))["active"], "green")
        rollback = Rollout(cluster, "https://api.example.com")
        rollback.load_lock("green-release")
        rollback.switch("blue", "blue-release")
        rollback.finish()
        self.assertEqual(cluster.public_json("https://api.example.com", "/health")["release"], "blue-release")
        self.assertEqual(summary(cluster.get("configmap", bg.STATE_NAME))["active"], "blue")

    def test_stale_release_and_concurrent_lock_prevent_mutation(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        with self.assertRaisesRegex(ValueError, "Expected active"):
            Rollout(cluster, "https://api.example.com").load_lock("stale")
        first = Rollout(cluster, "https://api.example.com")
        first.load_lock("blue-release")
        with self.assertRaisesRegex(ValueError, "holds the lock"):
            Rollout(cluster, "https://api.example.com").load_lock("blue-release")
        first.finish()

    def test_prepare_cannot_replace_active_slot_or_accept_old_image_contract(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        op = Rollout(cluster, "https://api.example.com")
        op.load_lock("blue-release")
        before = copy.deepcopy(cluster.objects)
        with self.assertRaisesRegex(ValueError, "active slot"):
            op.prepare("blue", capable("replacement"), config())
        self.assertEqual(before, cluster.objects)
        with self.assertRaisesRegex(ValueError, "Build new images"):
            op.prepare("green", release(), config())
        op.finish()

    def test_unhealthy_candidate_never_receives_traffic_and_can_recover_blue(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        cluster.unhealthy.add("green")
        op = Rollout(cluster, "https://api.example.com")
        op.load_lock("blue-release")
        error = None
        try:
            op.prepare("green", capable("green-release"), config())
        except RuntimeError as caught:
            error = caught
        op.finish(error)
        self.assertIsNotNone(error)
        self.assertEqual(cluster.routes["green"], 0)
        self.assertEqual(summary(cluster.get("configmap", bg.STATE_NAME))["phase"], "failed")
        recovery = Rollout(cluster, "https://api.example.com")
        recovery.load_lock("blue-release")
        recovery.switch("blue", "blue-release")
        recovery.finish()
        self.assertEqual(cluster.routes, {"blue": 100})

    def test_old_terminating_workers_block_new_release_workers_and_switch(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        self.prepare(cluster)
        cluster.lingering_workers = True
        op = Rollout(cluster, "https://api.example.com")
        op.load_lock("blue-release")
        with self.assertRaisesRegex(RuntimeError, "worker pods terminated") as raised:
            op.switch("green", "green-release")
        op.finish(raised.exception)
        self.assertEqual(cluster.routes, {"blue": 100, "green": 0})
        self.assertFalse(cluster.readiness("auth-service", "green")["backgroundWorkersEnabled"])

    def test_source_account_and_region_must_match_staging(self):
        value = capable()
        value["registry"] = value["registry"].replace(bg.ACCOUNT, "111111111111")
        value["images"] = {app: image.replace(bg.ACCOUNT, "111111111111") for app, image in value["images"].items()}
        with self.assertRaisesRegex(ValueError, "staging account"):
            bg.validate_source(value)

    def test_conflicting_lock_acquisition_cannot_unlock_another_operation(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        candidate = Rollout(cluster, "https://api.example.com")

        def racing_writer(obj):
            current = cluster.objects["configmap", bg.STATE_NAME]
            current["metadata"]["resourceVersion"] = "999"
            current["data"]["lock"] = "another-owner"
            raise RuntimeError("Conflict")

        with patch.object(cluster, "replace_state", side_effect=racing_writer):
            with self.assertRaisesRegex(RuntimeError, "Conflict") as raised:
                candidate.load_lock("blue-release")
            candidate.finish(raised.exception)
        self.assertEqual(cluster.get("configmap", bg.STATE_NAME)["data"]["lock"], "another-owner")

    def test_bootstrap_refuses_unexpected_ingress_before_creating_state(self):
        cluster = Cluster()
        cluster.objects["ingress", "gateway"]["spec"]["rules"][0]["host"] = "other.example.com"
        with self.assertRaisesRegex(ValueError, "single gateway root"):
            Rollout(cluster, "https://api.example.com").bootstrap(capable(), config())
        self.assertIsNone(cluster.get("configmap", bg.STATE_NAME))

    def test_matching_weights_on_an_unrelated_listener_rule_are_not_accepted(self):
        cluster = Cluster()
        self.bootstrap(cluster)
        op = Rollout(cluster, "https://api.example.com")
        op.load_lock("blue-release")
        original = cluster.aws

        def unrelated(service, operation, *args):
            result = original(service, operation, *args)
            if operation == "describe-rules":
                result["Rules"][0]["Conditions"].append({"Field": "host-header"})
            return result

        with patch.object(cluster, "aws", side_effect=unrelated):
            self.assertFalse(op.route_observed("blue", {"blue"}))
        op.finish()


if __name__ == "__main__":
    unittest.main()
