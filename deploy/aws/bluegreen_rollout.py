"""Staging blue/green operations. Never fetch or print Kubernetes Secret values.

Run under the same CI concurrency group as rolling deployment. A ConfigMap CAS
lock also protects against concurrent administrator invocations. Failed operations
leave their phase recorded and require an explicit retry or rollback.
"""
import argparse
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error
import uuid

from bundle import APPS, PORTS
import eks
import eks_bluegreen as bg


class Client:
    def __init__(self):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def command(self, args, value=None, timeout=660):
        result = subprocess.run(args, input=None if value is None else json.dumps(value),
                                text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Command failed: " + " ".join(args[:3]))
        return result.stdout

    def kubectl(self, *args, value=None):
        return self.command(["kubectl", "--namespace", eks.NAMESPACE, *args], value)

    def get(self, kind, name):
        raw = self.kubectl("get", kind, name, "--ignore-not-found", "-o", "json")
        return json.loads(raw) if raw.strip() else None

    def items(self, kind, selector=None):
        args = ["get", kind, "-o", "json"]
        if selector:
            args += ["-l", selector]
        return json.loads(self.kubectl(*args))["items"]

    def apply(self, items):
        value = {"apiVersion": "v1", "kind": "List", "items": items}
        args = ["apply", "--server-side", "--field-manager=reloop-eks-ci", "-f", "-"]
        self.kubectl(*args, "--dry-run=server", value=value)
        print(self.kubectl(*args, value=value).strip(), flush=True)

    def patch(self, kind, name, value):
        args = ("patch", kind, name, "--type=merge", "--field-manager=reloop-eks-ci", "-p", json.dumps(value))
        self.kubectl(*args, "--dry-run=server")
        self.kubectl(*args)

    def replace_state(self, obj):
        return json.loads(self.kubectl("replace", "-f", "-", "-o", "json", value=obj))

    def create_state(self, obj):
        return json.loads(self.kubectl("create", "-f", "-", "-o", "json", value=obj))

    def rollout(self, name):
        print(self.kubectl("rollout", "status", "deployment/" + name, "--timeout=600s").strip(), flush=True)

    def aws(self, service, operation, *args):
        return json.loads(self.command(["aws", service, operation, *args, "--region", bg.REGION,
                                        "--output", "json", "--no-cli-pager"]))

    def preflight(self):
        if self.aws("sts", "get-caller-identity")["Account"] != bg.ACCOUNT:
            raise ValueError("Wrong AWS account")
        cluster = self.aws("eks", "describe-cluster", "--name", eks.NAMESPACE)["cluster"]
        if (cluster["arn"] != f"arn:aws:eks:{bg.REGION}:{bg.ACCOUNT}:cluster/{eks.NAMESPACE}"
                or cluster["status"] != "ACTIVE" or not cluster.get("computeConfig", {}).get("enabled")):
            raise ValueError("Expected the ACTIVE staging Auto Mode cluster")
        context = json.loads(self.command(["kubectl", "config", "view", "--minify", "-o", "json"]))
        if context["clusters"][0]["cluster"]["server"] != cluster["endpoint"]:
            raise ValueError("kubectl is connected to another cluster")

    def wait(self, check, label, timeout=240):
        deadline = time.monotonic() + timeout
        last = "not ready"
        while True:
            try:
                if check():
                    return
            except (RuntimeError, ValueError, KeyError, urllib.error.URLError) as error:
                last = str(error)
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Timed out: {label}: {last}")
            time.sleep(5)

    def authorize(self):
        for resource, verbs in {
            "configmaps": ["get", "create", "update"],
            "pods": ["list"], "services/proxy": ["get"],
            "targetgroupbindings.eks.amazonaws.com": ["list"],
            "deployments.apps": ["get", "patch", "watch"],
            "ingresses.networking.k8s.io": ["get", "patch"],
        }.items():
            for verb in verbs:
                if self.kubectl("auth", "can-i", verb, resource).strip() != "yes":
                    raise ValueError(f"Administrator must grant {verb} {resource} before blue/green")

    def service_json(self, name, path):
        return json.loads(self.kubectl("get", "--raw",
            f"/api/v1/namespaces/{eks.NAMESPACE}/services/http:{name}:{PORTS['gateway']}/proxy{path}"))

    def readiness(self, app, slot):
        name = bg.slot_name(app, slot)
        return json.loads(self.kubectl("get", "--raw",
            f"/api/v1/namespaces/{eks.NAMESPACE}/services/http:{name}:{PORTS[app]}/proxy/ready"))

    def public_json(self, origin, path):
        request = urllib.request.Request(origin + path, headers={"Cache-Control": "no-cache"})
        with self.http.open(request, timeout=15) as response:
            return json.load(response)


def env_of(container):
    return {item["name"]: item.get("value") for item in container.get("env", [])}


class Rollout:
    def __init__(self, client, api_origin):
        self.client = client
        self.api_origin = eks.origin(api_origin) if api_origin else None
        self.obj = None
        self.state = None
        self.owner = uuid.uuid4().hex
        self.locked = False

    def save(self):
        if self.obj["data"].get("lock") != self.owner:
            raise RuntimeError("Lost blue/green lock")
        self.obj["data"]["state"] = json.dumps(self.state, sort_keys=True)
        self.obj = self.client.replace_state(self.obj)

    def load_lock(self, expected_active):
        self.obj = self.client.get("configmap", bg.STATE_NAME)
        if not self.obj:
            raise ValueError("Bootstrap blue/green first")
        self.state = bg.validate_state(json.loads(self.obj["data"]["state"]))
        if self.obj["data"].get("lock"):
            raise ValueError("Another operation holds the lock; inspect status before recovery")
        active = self.state["slots"][self.state["active"]]["release"]["version_label"]
        if expected_active != active:
            raise ValueError("Expected active release does not match; refresh status")
        if self.api_origin != self.state["api_origin"]:
            raise ValueError("Public API origin does not match bootstrap state")
        self.obj["data"]["lock"] = self.owner
        self.save()  # resourceVersion compare-and-swap; a racing writer fails here.
        self.locked = True

    def deployments_ready(self, slot, record, workers=None):
        for app in APPS:
            name = bg.slot_name(app, slot)
            deployment = self.client.get("deployment", name)
            if not deployment:
                raise ValueError("Missing deployment " + name)
            template = deployment["spec"]["template"]
            container = template["spec"]["containers"][0]
            env = env_of(container)
            if (container["image"] != record["release"]["images"][app]
                    or env.get("DEPLOYMENT_SLOT") != slot
                    or template["metadata"].get("annotations", {}).get("reloop/worker-control") != "v1"):
                raise ValueError("Deployment is not the recorded worker-capable release: " + name)
            if workers is not None and app in bg.WORKER_APPS:
                if env.get("BACKGROUND_WORKERS_ENABLED") != str(workers).lower():
                    raise ValueError("Unexpected worker mode: " + name)
            self.client.rollout(name)
            status = self.client.readiness(app, slot)
            if (status.get("status") != "ready" or status.get("deploymentSlot") != slot
                    or status.get("release") != record["release"]["version_label"]):
                raise ValueError("Service proxy did not reach the recorded ready release: " + name)
            if workers is not None and app in bg.WORKER_APPS:
                if status.get("backgroundWorkersEnabled") is not workers:
                    raise ValueError("Running process has another worker mode: " + name)
        health = self.client.service_json(bg.slot_name("gateway", slot), "/health")
        self.check_health(health, slot, record)
        self.client.service_json(bg.slot_name("gateway", slot), "/api/products/feed")

    @staticmethod
    def check_health(health, slot, record):
        if (health.get("status") != "ok" or health.get("service") != "gateway"
                or health.get("deploymentSlot") != slot
                or health.get("release") != record["release"]["version_label"]):
            raise ValueError("Gateway release/slot identity mismatch")

    def set_workers(self, slot, enabled):
        for app in bg.WORKER_APPS:
            name = bg.slot_name(app, slot)
            deployment = self.client.get("deployment", name)
            if not deployment:
                if enabled:
                    raise ValueError("Cannot enable missing workers: " + name)
                continue  # A failed prepare may only have created part of the standby.
            value = str(enabled).lower()
            container = deployment["spec"]["template"]["spec"]["containers"][0]
            if env_of(container).get("BACKGROUND_WORKERS_ENABLED") != value:
                self.client.kubectl("set", "env", "deployment/" + name,
                                    "BACKGROUND_WORKERS_ENABLED=" + value, "--field-manager=reloop-eks-ci")
            self.client.rollout(name)
            if not enabled:
                def old_workers_gone(app_name=name):
                    pods = self.client.items("pods", "app.kubernetes.io/name=" + app_name)
                    return all(env_of(pod["spec"]["containers"][0]).get("BACKGROUND_WORKERS_ENABLED") == "false"
                               for pod in pods)
                self.client.wait(old_workers_gone, "old worker pods terminated: " + name)

    def alb(self):
        ingress = self.client.get("ingress", "gateway")
        dns = ingress["status"]["loadBalancer"]["ingress"][0]["hostname"]
        matches = [lb for lb in self.client.aws("elbv2", "describe-load-balancers")["LoadBalancers"]
                   if lb["DNSName"] == dns]
        if len(matches) != 1 or matches[0]["Scheme"] != "internal" or matches[0]["State"]["Code"] != "active":
            raise ValueError("Expected the existing active internal ALB")
        arn = matches[0]["LoadBalancerArn"]
        if self.state.get("alb_arn") not in {None, arn}:
            raise ValueError("ALB changed; preserve the CloudFront VPC origin")
        return arn

    def target_groups(self, slots):
        bindings = self.client.items("targetgroupbindings.eks.amazonaws.com")
        groups = {}
        for slot in slots:
            matches = [b for b in bindings if b["spec"]["serviceRef"]["name"] == bg.slot_name("gateway", slot)]
            if len(matches) != 1:
                raise ValueError("Waiting for one gateway target group binding for " + slot)
            groups[slot] = matches[0]["spec"]["targetGroupARN"]
        return groups

    def targets_healthy(self, groups):
        for slot, arn in groups.items():
            pods = self.client.items("pods", "app.kubernetes.io/name=" + bg.slot_name("gateway", slot))
            expected = {p.get("status", {}).get("podIP") for p in pods if not p["metadata"].get("deletionTimestamp")}
            if None in expected or len(expected) < 2:
                return False
            targets = self.client.aws("elbv2", "describe-target-health", "--target-group-arn", arn)["TargetHealthDescriptions"]
            healthy = {t["Target"]["Id"] for t in targets if t["TargetHealth"]["State"] == "healthy"}
            if expected != healthy:
                return False
        return True

    def route_observed(self, active, slots):
        groups = self.target_groups(slots)
        if not self.targets_healthy(groups):
            return False
        wanted = {arn: 100 if slot == active else 0 for slot, arn in groups.items()}
        listeners = self.client.aws("elbv2", "describe-listeners", "--load-balancer-arn", self.alb())["Listeners"]
        for listener in listeners:
            if listener["Port"] != 80:
                continue
            rules = self.client.aws("elbv2", "describe-rules", "--listener-arn", listener["ListenerArn"])["Rules"]
            for rule in rules:
                conditions = rule.get("Conditions", [])
                if not (len(conditions) == 1 and conditions[0].get("Field") == "path-pattern"
                        and conditions[0].get("PathPatternConfig", {}).get("Values") == ["/*"]):
                    continue
                for action in rule["Actions"]:
                    actual = {t["TargetGroupArn"]: t.get("Weight", 1)
                              for t in action.get("ForwardConfig", {}).get("TargetGroups", [])}
                    sticky = action.get("ForwardConfig", {}).get("TargetGroupStickinessConfig", {})
                    if (action["Type"] == "forward" and actual == wanted
                            and sticky.get("Enabled") is True and sticky.get("DurationSeconds") == 1):
                        return True
        return False

    def route(self, active, include_pending=False):
        slots = {slot: record for slot, record in self.state["slots"].items() if record["ready"] or include_pending}
        self.client.patch("ingress", "gateway", bg.route_patch(active, slots))
        self.client.wait(lambda: self.route_observed(active, slots), "ALB forwarding weights and healthy targets")

    def public_ready(self, slot):
        record = self.state["slots"][slot]
        def check():
            self.check_health(self.client.public_json(self.api_origin, "/health"), slot, record)
            if self.client.public_json(self.api_origin, "/ready").get("status") != "ready":
                return False
            self.client.public_json(self.api_origin, "/api/products/feed")
            return True
        self.client.wait(check, "public HTTPS release, readiness and feed")

    def bootstrap(self, release, config):
        bg.validate_source(release)
        eks.configuration(config)
        if self.client.get("configmap", bg.STATE_NAME):
            raise ValueError("Already bootstrapped; use status/prepare, not rolling deployment")
        if not self.api_origin:
            raise ValueError("Set the public HTTPS API origin before bootstrap")
        record = {"release": release, "config": config, "ready": True}
        # No resource mutation until the old stack is proven worker-capable.
        self.deployments_ready("blue", record, workers=True)
        ingress = self.client.get("ingress", "gateway")
        expected_rule = {"http": {"paths": [{"path": "/", "pathType": "Prefix", "backend": {
            "service": {"name": "gateway", "port": {"number": PORTS["gateway"]}}}}]}}
        if (ingress.get("spec", {}).get("ingressClassName") != eks.NAMESPACE
                or ingress["spec"].get("rules") != [expected_rule]):
            raise ValueError("Bootstrap requires the existing single gateway root Ingress")
        self.state = {"format": 1, "active": "blue", "phase": "bootstrapping", "api_origin": self.api_origin,
                      "slots": {"blue": record}}
        self.state["alb_arn"] = self.alb()
        if not self.targets_healthy(self.target_groups({"blue"})):
            raise ValueError("Existing blue ALB targets are not healthy")
        # Read permissions must work before creating state or changing routing.
        for listener in self.client.aws("elbv2", "describe-listeners", "--load-balancer-arn", self.state["alb_arn"])["Listeners"]:
            self.client.aws("elbv2", "describe-rules", "--listener-arn", listener["ListenerArn"])
        self.obj = self.client.create_state({"apiVersion": "v1", "kind": "ConfigMap",
            "metadata": {"name": bg.STATE_NAME, "namespace": eks.NAMESPACE},
            "data": {"state": json.dumps(self.state), "lock": self.owner}})
        self.locked = True
        self.route("blue")
        self.public_ready("blue")
        self.state["phase"] = "ready"
        self.save()

    def prepare(self, slot, release, config):
        if self.state["phase"] != "ready":
            raise ValueError("Previous operation is incomplete; inspect status and explicitly recover first")
        if slot == self.state["active"]:
            raise ValueError("Cannot prepare over the active slot")
        bg.validate_source(release)
        eks.configuration(config)
        self.deployments_ready(self.state["active"], self.state["slots"][self.state["active"]], workers=True)
        self.state["phase"] = "preparing"
        self.state["slots"][slot] = {"release": release, "config": config, "ready": False}
        self.save()
        self.client.apply(bg.manifests(release, config, slot, workers=False))
        self.deployments_ready(slot, self.state["slots"][slot], workers=False)
        self.route(self.state["active"], include_pending=True)  # Candidate weight stays zero.
        self.public_ready(self.state["active"])
        self.state["slots"][slot]["ready"] = True
        self.state["phase"] = "ready"
        self.save()

    def switch(self, slot, expected_target):
        record = self.state["slots"].get(slot)
        if not record or not record["ready"] or expected_target != record["release"]["version_label"]:
            raise ValueError("Expected target release must match a fully prepared slot")
        self.deployments_ready(slot, record)
        if self.state["phase"] == "ready":
            self.public_ready(self.state["active"])  # Reuse its cookies during post-switch verification.
        self.state["phase"] = "switching"
        self.state["target"] = slot
        self.save()
        # Includes both slots on recovery: never enable the target while another
        # release's old worker pods are still terminating.
        for existing in sorted(self.state["slots"]):
            self.set_workers(existing, False)
        self.deployments_ready(slot, record, workers=False)
        self.route(slot)
        self.public_ready(slot)
        self.set_workers(slot, True)
        self.deployments_ready(slot, record, workers=True)
        self.public_ready(slot)
        self.state["previous"] = self.state["active"]
        self.state["active"] = slot
        self.state["phase"] = "ready"
        self.state.pop("target", None)
        self.state.pop("error", None)
        self.save()

    def finish(self, error=None):
        if not self.locked or not self.obj or self.obj["data"].get("lock") != self.owner:
            return
        if error and self.state["phase"] in {"bootstrapping", "preparing", "switching"}:
            self.state["phase"] = "failed"
            self.state["error"] = str(error)[:1000]
        self.save()
        self.obj["data"]["lock"] = ""
        self.obj = self.client.replace_state(self.obj)
        self.locked = False


def summary(obj):
    if not obj:
        return {"bootstrapped": False}
    state = bg.validate_state(json.loads(obj["data"]["state"]))
    return {"active": state["active"], "phase": state["phase"], "lock": obj["data"].get("lock", ""),
            "target": state.get("target"), "error": state.get("error"),
            "slots": {slot: {"release": record["release"]["version_label"], "ready": record["ready"]}
                      for slot, record in state["slots"].items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["status", "bootstrap", "prepare", "promote", "rollback", "unlock"])
    parser.add_argument("--slot", choices=["blue", "green"])
    parser.add_argument("--release", type=Path)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--api-origin")
    parser.add_argument("--expected-active")
    parser.add_argument("--expected-target")
    parser.add_argument("--expected-lock")
    args = parser.parse_args()
    client = Client()
    client.preflight()
    if args.operation == "status":
        print(json.dumps(summary(client.get("configmap", bg.STATE_NAME)), indent=2))
        return
    if args.operation == "unlock":
        obj = client.get("configmap", bg.STATE_NAME)
        if not obj or not args.expected_lock or obj["data"].get("lock") != args.expected_lock:
            raise ValueError("Expected lock must match; cancel/finish the owning operation first")
        state = bg.validate_state(json.loads(obj["data"]["state"]))
        state["phase"] = "failed"
        state["error"] = "Manually unlocked; explicitly recover the recorded active release"
        obj["data"] = {"lock": "", "state": json.dumps(state)}
        client.replace_state(obj)
        return
    rollout = Rollout(client, args.api_origin)
    client.authorize()
    failure = None
    try:
        if args.operation == "bootstrap":
            if not args.release or not args.config:
                raise ValueError("Bootstrap requires release and public config files")
            rollout.bootstrap(json.loads(args.release.read_text()), json.loads(args.config.read_text()))
        else:
            if not args.slot:
                raise ValueError("Select the explicit target slot")
            rollout.load_lock(args.expected_active)
            if args.operation == "prepare":
                if not args.release or not args.config:
                    raise ValueError("Prepare requires release and public config files")
                rollout.prepare(args.slot, json.loads(args.release.read_text()), json.loads(args.config.read_text()))
            else:
                if args.operation == "promote" and args.slot == rollout.state["active"] and rollout.state["phase"] == "ready":
                    raise ValueError("Target is already active")
                rollout.switch(args.slot, args.expected_target)
    except BaseException as error:
        failure = error
        raise
    finally:
        rollout.finish(failure)
    print(json.dumps(summary(rollout.obj), indent=2))


if __name__ == "__main__":
    main()
