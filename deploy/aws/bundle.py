"""Build an immutable Beanstalk Compose bundle; never read a local .env."""
import argparse
import json
from pathlib import Path
import re
import zipfile

APPS = ("gateway", "auth-service", "product-service", "order-service", "chat-service", "support-service")
PORTS = dict(zip(APPS, (8080, 3001, 3002, 3003, 3004, 3006)))
ROOT = Path(__file__).resolve().parent


def required(name):
    return "${" + name + ":?Set " + name + " in Beanstalk}"


def validate_release(value):
    if value.get("format") != 1 or value.get("node") != "22":
        raise ValueError("Expected an AWS Node 22 release")
    if not re.fullmatch(r"[a-f0-9]{40}", value.get("commit", "")):
        raise ValueError("A full Git commit SHA is required")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", value.get("version_label", "")):
        raise ValueError("Invalid Beanstalk version label")
    region = value.get("region", "")
    if not re.fullmatch(r"[a-z]{2}-[a-z]+-\d", region):
        raise ValueError("Invalid AWS Region")
    registry = value.get("registry", "")
    if not re.fullmatch(r"\d{12}\.dkr\.ecr\." + re.escape(region) + r"\.amazonaws\.com", registry):
        raise ValueError("ECR registry must belong to the selected Region")
    images = value.get("images", {})
    if set(images) != set(APPS):
        raise ValueError("Exactly six backend images are required")
    for app in APPS:
        if not re.fullmatch(re.escape(registry + "/reloop/" + app) + r"@sha256:[a-f0-9]{64}", images[app]):
            raise ValueError(f"Invalid immutable ECR image for {app}")
    return value


def compose(release):
    validate_release(release)
    links = {name.upper().replace("-", "_") + "_URL": f"http://{name}:{PORTS[name]}" for name in APPS if name != "gateway"}
    common = {
        **links, "NODE_ENV": "production", "RELEASE_ID": release["version_label"],
        "JWT_ACCESS_SECRET": required("JWT_ACCESS_SECRET"),
        "INTERNAL_SERVICE_TOKEN": required("INTERNAL_SERVICE_TOKEN"),
        "SHUTDOWN_TIMEOUT_MS": "30000",
    }
    services = {}
    for app in APPS:
        env = dict(common)
        if app == "gateway":
            env.update(GATEWAY_PORT="8080", GATEWAY_FRONTEND_PROXY="false", GATEWAY_CHECK_UPSTREAMS="true", FRONTEND_ORIGINS=required("FRONTEND_ORIGINS"))
        else:
            name = app.removesuffix("-service").upper()
            env.update({
                "DATABASE_URL": required("DATABASE_URL_" + name),
                "REDIS_URL": required("REDIS_URL"),
                "MEDIA_STORAGE_DRIVER": "s3", "AWS_REGION": release["region"],
                "S3_BUCKET": required("S3_BUCKET"), "S3_KEY_PREFIX": "${S3_KEY_PREFIX:-reloop-staging}",
            })
        if app == "auth-service":
            env.update({
                "JWT_REFRESH_SECRET": required("JWT_REFRESH_SECRET"),
                "APP_BASE_URL": required("APP_BASE_URL"), "MAIL_TRANSPORT": "smtp",
                "MAIL_FROM": required("MAIL_FROM"), "SMTP_HOST": required("SMTP_HOST"),
                "SMTP_PORT": "${SMTP_PORT:-587}", "SMTP_SECURE": "${SMTP_SECURE:-false}",
                "SMTP_USER": "${SMTP_USER:-}", "SMTP_PASS": "${SMTP_PASS:-}",
                "EMAIL_VERIFICATION": "${EMAIL_VERIFICATION:-required}",
                "TRUST_PROXY": "${TRUST_PROXY:-loopback, linklocal, uniquelocal}",
            })
        if app == "chat-service":
            env["FRONTEND_ORIGINS"] = required("FRONTEND_ORIGINS")
        probe = f"fetch('http://127.0.0.1:{PORTS[app]}/ready',{{signal:AbortSignal.timeout(2500)}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
        services[app] = {
            "image": release["images"][app], "init": True, "restart": "unless-stopped",
            "stop_grace_period": "45s", "environment": env,
            "healthcheck": {"test": ["CMD", "node", "-e", probe], "interval": "15s", "timeout": "5s", "retries": 3, "start_period": "60s"},
            "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}},
        }
        if app == "gateway":
            services[app]["ports"] = ["80:8080"]
    return {"services": services}


def build(release, output):
    validate_release(release)
    output.mkdir(parents=True, exist_ok=True)
    files = {"docker-compose.yml": json.dumps(compose(release), indent=2).encode(), "release.json": json.dumps(release, indent=2).encode()}
    for path in (ROOT / "bundle").rglob("*"):
        if path.is_file():
            files[path.relative_to(ROOT / "bundle").as_posix()] = path.read_bytes().replace(b"\r\n", b"\n")
    with zipfile.ZipFile(output / "application.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            archive.writestr(info, data)
    (output / "release.json").write_text(json.dumps(release, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--version-label", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--registry", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    images = {}
    for app in APPS:
        record = json.loads((args.images / f"{app}.json").read_text(encoding="utf-8"))
        if record.get("component") != app or record.get("commit") != args.commit:
            raise ValueError(f"Image provenance mismatch: {app}")
        images[app] = record["image"]
    build({"format": 1, "node": "22", "capabilities": ["background-workers-toggle-v1"], "commit": args.commit, "version_label": args.version_label, "region": args.region, "registry": args.registry, "images": images}, args.output)


if __name__ == "__main__":
    main()
