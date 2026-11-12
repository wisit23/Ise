"""Offline blue/green resources; blue adopts the existing staging resource names."""
import copy
import json
from urllib.parse import urlsplit

from bundle import APPS, PORTS, validate_release
import eks

CAPABILITY = "background-workers-toggle-v1"
STATE_NAME = "reloop-bluegreen"
ACTION = "reloop-active"
ACTION_KEY = "alb.ingress.kubernetes.io/actions." + ACTION
REGION = "ap-southeast-2"
ACCOUNT = "997229934811"
WORKER_APPS = tuple(app for app in APPS if app != "gateway")


def slot_name(app, slot):
    if app not in APPS or slot not in {"blue", "green"}:
        raise ValueError("Expected a staging application and blue or green")
    return app if slot == "blue" else app + "-green"


def validate_source(release):
    validate_release(release)
    if release["region"] != REGION or release["registry"] != f"{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com":
        raise ValueError("Blue/green only supports this staging account and Region")
    if CAPABILITY not in release.get("capabilities", []):
        raise ValueError("Build new images with background worker control before blue/green")


def manifests(release, config, slot, workers=False):
    validate_source(release)
    slot_name("gateway", slot)
    result = copy.deepcopy(eks.manifests(release, config))
    result = [item for item in result if item["kind"] != "Ingress"]

    def relabel(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "app.kubernetes.io/name" and child in APPS:
                    value[key] = slot_name(child, slot)
                else:
                    relabel(child)
        elif isinstance(value, list):
            for child in value:
                relabel(child)

    for item in result:
        app = item["metadata"]["name"]
        if app not in APPS:
            continue  # Immutable public ConfigMap can be shared by equal releases.
        # eks reuses label dictionaries. Detach metadata before adding slot labels
        # so adoption cannot change the existing Deployment's immutable selector.
        item["metadata"]["labels"] = dict(item["metadata"].get("labels", {}))
        item["metadata"]["name"] = slot_name(app, slot)
        item["metadata"].setdefault("labels", {})["reloop/slot"] = slot
        relabel(item)
        if item["kind"] == "Deployment":
            template = item["spec"]["template"]
            template["metadata"]["labels"] = dict(template["metadata"]["labels"])
            template["metadata"]["labels"]["reloop/slot"] = slot
            container = template["spec"]["containers"][0]
            for env in container["env"]:
                if env["name"] == "BACKGROUND_WORKERS_ENABLED":
                    env["value"] = str(workers).lower()
                elif env["name"] == "DEPLOYMENT_SLOT":
                    env["value"] = slot
                elif "value" in env and env["value"].startswith("http://"):
                    url = urlsplit(env["value"])
                    if url.hostname in APPS:
                        env["value"] = url._replace(netloc=f"{slot_name(url.hostname, slot)}:{url.port}").geturl()
        elif item["kind"] == "HorizontalPodAutoscaler":
            item["spec"]["scaleTargetRef"]["name"] = slot_name(app, slot)
    return result


def route_patch(active, slots):
    if active not in slots or not set(slots) <= {"blue", "green"}:
        raise ValueError("Active slot must have prepared resources")
    action = {"type": "forward", "forwardConfig": {
        "targetGroups": [{"serviceName": slot_name("gateway", slot), "servicePort": PORTS["gateway"],
                          "weight": 100 if slot == active else 0} for slot in sorted(slots)],
        # Required while per-target stickiness is enabled for Socket.IO polling.
        # Keep group affinity short so an existing browser can leave the old slot.
        "targetGroupStickinessConfig": {"enabled": True, "durationSeconds": 1},
    }}
    return {"metadata": {"annotations": {ACTION_KEY: json.dumps(action, separators=(",", ":"))}},
            "spec": {"rules": [{"http": {"paths": [{"path": "/", "pathType": "Prefix", "backend": {
                "service": {"name": ACTION, "port": {"name": "use-annotation"}},
            }}]}}]}}


def validate_state(state):
    if (state.get("format") != 1 or state.get("active") not in {"blue", "green"}
            or state["active"] not in state.get("slots", {})
            or not set(state["slots"]) <= {"blue", "green"}):
        raise ValueError("Invalid blue/green state; do not guess the active release")
    for slot, record in state["slots"].items():
        slot_name("gateway", slot)
        validate_source(record["release"])
        eks.configuration(record["config"])
    return state
