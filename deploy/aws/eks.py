"""Render EKS Auto Mode staging resources from an immutable backend release.

This command is offline. It neither reads secrets nor creates AWS resources.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from bundle import PORTS, compose, validate_release

NAMESPACE = "reloop-staging"
SERVICE_ACCOUNT = "reloop-backend"
RUNTIME_RESOURCE_NAME = "reloop-runtime"
SECRET_KEYS = {
    "DATABASE_URL_AUTH", "DATABASE_URL_PRODUCT", "DATABASE_URL_ORDER",
    "DATABASE_URL_CHAT", "DATABASE_URL_SUPPORT", "REDIS_URL",
    "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "INTERNAL_SERVICE_TOKEN",
    "SMTP_USER", "SMTP_PASS",
}


def origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.path or parsed.query or parsed.fragment or
            parsed.port not in (None, 443) or any(c.isspace() for c in value)):
        raise ValueError("Use an HTTPS origin without credentials, whitespace or a path")
    return value


def configuration(value):
    required = {"frontend_origin", "media_bucket", "mail_from", "smtp_host"}
    if set(value) != required or any(not isinstance(v, str) or not v.strip() for v in value.values()):
        raise ValueError("Set frontend_origin, media_bucket, mail_from and smtp_host")
    origin(value["frontend_origin"])
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", value["media_bucket"]):
        raise ValueError("Invalid S3 media bucket name")
    if any("\n" in v or "\r" in v for v in value.values()):
        raise ValueError("Configuration values must be single-line strings")
    return value


def resource(api, kind, name, *, namespaced=True, **fields):
    metadata = {"name": name}
    if namespaced:
        metadata["namespace"] = NAMESPACE
    return {"apiVersion": api, "kind": kind, "metadata": metadata, **fields}


def platform():
    """Administrator-applied prerequisites, separate from namespace CI permissions."""
    return [
        resource("v1", "Namespace", NAMESPACE, namespaced=False),
        resource("v1", "ServiceAccount", SERVICE_ACCOUNT, automountServiceAccountToken=False),
        resource("eks.amazonaws.com/v1", "IngressClassParams", NAMESPACE, namespaced=False,
                 spec={"scheme": "internal", "targetType": "ip",
                       "namespaceSelector": {"matchLabels": {"kubernetes.io/metadata.name": NAMESPACE}}}),
        resource("networking.k8s.io/v1", "IngressClass", NAMESPACE, namespaced=False,
                 spec={"controller": "eks.amazonaws.com/alb", "parameters": {
                     "apiGroup": "eks.amazonaws.com", "kind": "IngressClassParams", "name": NAMESPACE}}),
        resource("karpenter.sh/v1", "NodePool", NAMESPACE, namespaced=False, spec={
            "template": {"spec": {"nodeClassRef": {"group": "eks.amazonaws.com", "kind": "NodeClass", "name": "default"},
                "requirements": [
                    {"key": "kubernetes.io/arch", "operator": "In", "values": ["amd64"]},
                    {"key": "karpenter.sh/capacity-type", "operator": "In", "values": ["on-demand"]},
                    {"key": "eks.amazonaws.com/instance-category", "operator": "In", "values": ["m"]},
                    {"key": "eks.amazonaws.com/instance-generation", "operator": "Gt", "values": ["6"]},
                    {"key": "eks.amazonaws.com/instance-cpu", "operator": "In", "values": ["2"]},
                ]}},
            "limits": {"cpu": "8", "memory": "32Gi"},
            "disruption": {"consolidationPolicy": "WhenEmpty", "consolidateAfter": "60s"},
        }),
        resource("rbac.authorization.k8s.io/v1", "Role", "reloop-deployer", rules=[
            {"apiGroups": [""], "resources": ["configmaps", "services"], "verbs": ["get", "list", "watch", "create", "update", "patch"]},
            {"apiGroups": [""], "resources": ["pods", "services/proxy"], "verbs": ["get", "list"]},
            {"apiGroups": ["eks.amazonaws.com"], "resources": ["targetgroupbindings"], "verbs": ["get", "list"]},
            {"apiGroups": ["apps"], "resources": ["deployments"], "verbs": ["get", "list", "watch", "create", "update", "patch"]},
            {"apiGroups": ["autoscaling"], "resources": ["horizontalpodautoscalers"], "verbs": ["get", "list", "watch", "create", "update", "patch"]},
            {"apiGroups": ["policy"], "resources": ["poddisruptionbudgets"], "verbs": ["get", "list", "watch", "create", "update", "patch"]},
            {"apiGroups": ["networking.k8s.io"], "resources": ["ingresses"], "verbs": ["get", "list", "watch", "create", "update", "patch"]},
        ]),
        resource("rbac.authorization.k8s.io/v1", "RoleBinding", "reloop-deployer",
                 roleRef={"apiGroup": "rbac.authorization.k8s.io", "kind": "Role", "name": "reloop-deployer"},
                 subjects=[{"kind": "Group", "name": "reloop-staging-deployers", "apiGroup": "rbac.authorization.k8s.io"}]),
    ]


def manifests(release, config):
    validate_release(release)
    configuration(config)
    public = {
        "S3_BUCKET": config["media_bucket"], "FRONTEND_ORIGINS": config["frontend_origin"],
        "APP_BASE_URL": config["frontend_origin"], "MAIL_FROM": config["mail_from"], "SMTP_HOST": config["smtp_host"],
    }
    fingerprint = hashlib.sha256(json.dumps([release, public], sort_keys=True).encode()).hexdigest()[:16]
    config_name = "reloop-config-" + fingerprint
    items = [resource("v1", "ConfigMap", config_name, immutable=True, data=public)]
    for app, service in compose(release)["services"].items():
        labels = {"app.kubernetes.io/name": app, "app.kubernetes.io/part-of": "reloop"}
        env = []
        for key, value in service["environment"].items():
            match = re.fullmatch(r"\$\{([A-Z][A-Z0-9_]*)(?::\?[^}]+|:-([^}]*))\}", value)
            if not match:
                env.append({"name": key, "value": value})
                continue
            source, default = match.groups()
            if source in SECRET_KEYS:
                ref = {"name": RUNTIME_RESOURCE_NAME, "key": source}
                if source in {"SMTP_USER", "SMTP_PASS"}:
                    ref["optional"] = True
                env.append({"name": key, "valueFrom": {"secretKeyRef": ref}})
            elif default is not None:
                env.append({"name": key, "value": default})
            else:
                if source not in public:
                    raise ValueError("No Kubernetes configuration for " + source)
                env.append({"name": key, "valueFrom": {"configMapKeyRef": {"name": config_name, "key": source}}})
        port = PORTS[app]
        if "background-workers-toggle-v1" in release.get("capabilities", []):
            env.extend([{"name": "BACKGROUND_WORKERS_ENABLED", "value": "true"},
                        {"name": "DEPLOYMENT_SLOT", "value": "blue"}])
        container = {
            "name": app, "image": service["image"], "imagePullPolicy": "IfNotPresent",
            "ports": [{"name": "http", "containerPort": port}], "env": env,
            "securityContext": {"allowPrivilegeEscalation": False, "readOnlyRootFilesystem": True, "capabilities": {"drop": ["ALL"]}},
            "volumeMounts": [{"name": "scratch", "mountPath": "/tmp"}],
            "resources": {"requests": {"cpu": "100m", "memory": "192Mi"}, "limits": {"cpu": "1", "memory": "768Mi" if app == "product-service" else "512Mi"}},
            "startupProbe": {"httpGet": {"path": "/health", "port": "http"}, "periodSeconds": 5, "failureThreshold": 30},
            "readinessProbe": {"httpGet": {"path": "/ready", "port": "http"}, "periodSeconds": 5, "timeoutSeconds": 3},
            "livenessProbe": {"httpGet": {"path": "/health", "port": "http"}, "periodSeconds": 15, "timeoutSeconds": 3},
            "lifecycle": {"preStop": {"exec": {"command": ["node", "-e", "setTimeout(() => {}, 10000)"]}}},
        }
        items.append(resource("apps/v1", "Deployment", app, spec={
            # HPA owns replicas. Re-applying must not reset a scaled workload.
            "selector": {"matchLabels": labels}, "revisionHistoryLimit": 3, "progressDeadlineSeconds": 600,
            "strategy": {"type": "RollingUpdate", "rollingUpdate": {"maxUnavailable": 0, "maxSurge": 1}},
            "template": {"metadata": {"labels": labels, "annotations": {"reloop/release": release["version_label"]}}, "spec": {
                "serviceAccountName": SERVICE_ACCOUNT, "automountServiceAccountToken": False,
                "securityContext": {"runAsNonRoot": True, "runAsUser": 1000, "runAsGroup": 1000, "fsGroup": 1000},
                "nodeSelector": {"kubernetes.io/arch": "amd64", "karpenter.sh/nodepool": NAMESPACE},
                "terminationGracePeriodSeconds": 75, "containers": [container],
                "volumes": [{"name": "scratch", "emptyDir": {"sizeLimit": "512Mi"}}],
                "topologySpreadConstraints": [{"maxSkew": 1, "minDomains": 2, "topologyKey": "topology.kubernetes.io/zone",
                    "whenUnsatisfiable": "DoNotSchedule", "labelSelector": {"matchLabels": labels}}],
            }},
        }))
        if "background-workers-toggle-v1" in release.get("capabilities", []):
            items[-1]["spec"]["template"]["metadata"]["annotations"]["reloop/worker-control"] = "v1"
        service_spec = {"type": "ClusterIP", "selector": labels, "ports": [{"name": "http", "port": port, "targetPort": "http"}]}
        if app == "chat-service":
            # ALB pins the browser to a gateway; the gateway must then stay on one chat pod for polling.
            service_spec.update(sessionAffinity="ClientIP", sessionAffinityConfig={"clientIP": {"timeoutSeconds": 10800}})
        items.append(resource("v1", "Service", app, spec=service_spec))
        items.append(resource("policy/v1", "PodDisruptionBudget", app, spec={"minAvailable": 1, "selector": {"matchLabels": labels}}))
        items.append(resource("autoscaling/v2", "HorizontalPodAutoscaler", app, spec={
            "scaleTargetRef": {"apiVersion": "apps/v1", "kind": "Deployment", "name": app}, "minReplicas": 2, "maxReplicas": 3,
            "metrics": [{"type": "Resource", "resource": {"name": "cpu", "target": {"type": "Utilization", "averageUtilization": 70}}}],
            "behavior": {"scaleDown": {"stabilizationWindowSeconds": 300}},
        }))
    ingress = resource("networking.k8s.io/v1", "Ingress", "gateway", spec={
        "ingressClassName": NAMESPACE,
        "rules": [{"http": {"paths": [{"path": "/", "pathType": "Prefix",
            "backend": {"service": {"name": "gateway", "port": {"number": PORTS["gateway"]}}}}]}}],
    })
    ingress["metadata"]["annotations"] = {
        "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP":80}]',
        "alb.ingress.kubernetes.io/healthcheck-path": "/ready",
        "alb.ingress.kubernetes.io/success-codes": "200",
        "alb.ingress.kubernetes.io/load-balancer-attributes": "idle_timeout.timeout_seconds=120",
        "alb.ingress.kubernetes.io/target-group-attributes": "stickiness.enabled=true,stickiness.lb_cookie.duration_seconds=300,deregistration_delay.timeout_seconds=45",
    }
    items.append(ingress)
    return items


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    release = json.loads(args.release.read_text(encoding="utf-8-sig"))
    config = json.loads(args.config.read_text(encoding="utf-8-sig"))
    workloads = manifests(release, config)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, items in (("platform", platform()), ("workloads", workloads)):
        (args.output / (name + ".json")).write_text(json.dumps({"apiVersion": "v1", "kind": "List", "items": items}, indent=2) + "\n", encoding="utf-8")
    (args.output / "release.json").write_text(json.dumps(release, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
