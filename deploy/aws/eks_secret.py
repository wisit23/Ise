"""Convert a Secrets Manager JSON value on stdin into a Kubernetes Secret.

Pipe directly to kubectl apply --server-side -f -. Never redirect to a tracked file.
Run as the staging administrator, not from the deployment workflow.
"""
import base64
import json
import sys

from eks import NAMESPACE, RUNTIME_RESOURCE_NAME, SECRET_KEYS


def secret(value):
    required = SECRET_KEYS - {"SMTP_USER", "SMTP_PASS"}
    if not isinstance(value, dict) or set(value) - SECRET_KEYS or required - set(value):
        raise ValueError("Expected the documented runtime secret keys only")
    if any(not isinstance(v, str) or not v for v in value.values()):
        raise ValueError("Runtime secret values must be non-empty strings; omit unused SMTP keys")
    return {"apiVersion": "v1", "kind": "Secret", "metadata": {"name": RUNTIME_RESOURCE_NAME, "namespace": NAMESPACE},
            "type": "Opaque", "data": {key: base64.b64encode(val.encode()).decode() for key, val in value.items()}}


if __name__ == "__main__":
    json.dump(secret(json.load(sys.stdin)), sys.stdout)
