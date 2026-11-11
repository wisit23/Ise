"""Explicit staging, promotion and rollback for two existing Beanstalk environments."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import urllib.parse

from bundle import validate_release


class Aws:
    def __init__(self, region):
        self.region = region

    def call(self, *args):
        result = subprocess.run(["aws", *args, "--region", self.region, "--output", "json", "--no-cli-pager"], check=True, capture_output=True, text=True)
        return json.loads(result.stdout) if result.stdout.strip() else {}


def settings():
    names = ("AWS_EB_APPLICATION", "AWS_EB_BLUE", "AWS_EB_GREEN", "AWS_EB_PRODUCTION_CNAME", "AWS_EB_PRODUCTION_URL", "AWS_EB_BLUE_URL", "AWS_EB_GREEN_URL")
    result = {name.removeprefix("AWS_EB_").lower(): os.environ.get(name, "") for name in names}
    if not all(result.values()):
        raise ValueError("Set all AWS_EB_* settings listed in deploy/aws/README.md")
    if result["blue"] == result["green"]:
        raise ValueError("Blue and Green must be different environments")
    for key in ("production_url", "blue_url", "green_url"):
        parsed = urllib.parse.urlsplit(result[key])
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
            raise ValueError(f"{key} must be an HTTPS origin")
        result[key] = result[key].rstrip("/")
    if len({result["production_url"], result["blue_url"], result["green_url"]}) != 3:
        raise ValueError("Production, Blue test and Green test origins must be distinct")
    return result


def pair(aws, config):
    values = aws.call("elasticbeanstalk", "describe-environments", "--environment-names", config["blue"], config["green"])["Environments"]
    found = {value["EnvironmentName"]: value for value in values}
    if set(found) != {config["blue"], config["green"]}:
        raise ValueError("Both existing Beanstalk environments are required")
    if any(value["ApplicationName"] != config["application"] for value in values):
        raise ValueError("An environment belongs to another application")
    active = [value for value in values if value.get("CNAME") == config["production_cname"]]
    if len(active) != 1:
        raise ValueError("Production CNAME does not identify exactly one environment")
    active = active[0]
    return active, next(value for value in values if value is not active)


def ready(value):
    if value.get("Status") != "Ready" or value.get("Health") != "Green":
        raise ValueError(f'{value["EnvironmentName"]} must be Ready and Green')


def test_url(config, environment):
    return config["blue_url"] if environment == config["blue"] else config["green_url"]


def request_json(url):
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "reloop-aws-smoke/1"})
    with urllib.request.urlopen(request, timeout=10) as response:
        # Do not follow redirects to an unrelated app or mistake an HTML login for API health.
        if response.status != 200 or response.url != url:
            raise ValueError("Smoke endpoint did not return a direct HTTP 200")
        return json.loads(response.read(2 * 1024 * 1024))


def probe(origin, expected_release=None):
    if request_json(origin + "/ready").get("status") != "ready":
        raise ValueError("Gateway or one of its upstreams is not ready")
    health = request_json(origin + "/health")
    if health.get("service") != "gateway" or health.get("status") != "ok":
        raise ValueError("Wrong health endpoint")
    if expected_release is not None and health.get("release") != expected_release:
        raise ValueError("The endpoint serves a different release")
    request_json(origin + "/api/products/feed")
    return health.get("release")


def eventually(operation, seconds=180):
    deadline = time.monotonic() + seconds
    while True:
        try:
            return operation()
        except (ValueError, OSError, urllib.error.URLError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(5)


def write_record(path, record):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


def stage(aws, config, release, bundle, bucket, record_path):
    validate_release(release)
    active, candidate = pair(aws, config)
    ready(active)
    ready(candidate)
    if active.get("VersionLabel") == release["version_label"]:
        raise ValueError("This version is already active")
    probe(config["production_url"], active["VersionLabel"])
    key = f'aws-releases/{release["version_label"]}/application.zip'
    aws.call("s3api", "put-object", "--bucket", bucket, "--key", key, "--body", str(bundle), "--if-none-match", "*")
    aws.call("elasticbeanstalk", "create-application-version", "--application-name", config["application"], "--version-label", release["version_label"], "--source-bundle", json.dumps({"S3Bucket": bucket, "S3Key": key}))
    # Re-check ownership of production immediately before mutating the candidate.
    current, target = pair(aws, config)
    if current["EnvironmentName"] != active["EnvironmentName"] or current["VersionLabel"] != active["VersionLabel"] or target["EnvironmentName"] != candidate["EnvironmentName"]:
        raise ValueError("Environment state changed during release preparation")
    aws.call("elasticbeanstalk", "update-environment", "--environment-name", candidate["EnvironmentName"], "--version-label", release["version_label"])
    aws.call("elasticbeanstalk", "wait", "environment-updated", "--environment-names", candidate["EnvironmentName"])
    current, target = pair(aws, config)
    ready(target)
    if current["EnvironmentName"] != active["EnvironmentName"] or current["VersionLabel"] != active["VersionLabel"] or target["VersionLabel"] != release["version_label"]:
        raise ValueError("Unexpected staged version or production environment")
    eventually(lambda: probe(test_url(config, target["EnvironmentName"]), release["version_label"]))
    release = dict(release)
    release["deployment"] = {
        "application": config["application"], "production_cname": config["production_cname"],
        "active": active["EnvironmentName"], "candidate": candidate["EnvironmentName"],
        "previous_version": active["VersionLabel"],
    }
    write_record(record_path, release)
    return release


def wait_active(aws, config, name, version):
    active, _ = pair(aws, config)
    ready(active)
    if active["EnvironmentName"] != name or active["VersionLabel"] != version:
        raise ValueError("CNAME swap has not converged to the expected release")
    return active


def validate_deployment(aws, config, release):
    validate_release(release)
    deployment = release.get("deployment", {})
    if deployment.get("application") != config["application"] or deployment.get("production_cname") != config["production_cname"]:
        raise ValueError("Release was staged for another application or production CNAME")
    active, candidate = pair(aws, config)
    ready(active)
    ready(candidate)
    expected = (deployment.get("active"), deployment.get("candidate"), deployment.get("previous_version"), release["version_label"])
    actual = (active["EnvironmentName"], candidate["EnvironmentName"], active["VersionLabel"], candidate["VersionLabel"])
    if expected != actual:
        raise ValueError("Staged release is stale; refusing to swap")
    return active, candidate


def swap(aws, source, target):
    aws.call("elasticbeanstalk", "swap-environment-cnames", "--source-environment-name", source, "--destination-environment-name", target)


def promote(aws, config, release, record_path):
    active, candidate = validate_deployment(aws, config, release)
    probe(test_url(config, candidate["EnvironmentName"]), release["version_label"])
    record = {"state": "intent", "release": release}
    write_record(record_path, record)
    swap(aws, active["EnvironmentName"], candidate["EnvironmentName"])
    record["state"] = "swap_requested"
    write_record(record_path, record)
    try:
        eventually(lambda: wait_active(aws, config, candidate["EnvironmentName"], release["version_label"]))
        eventually(lambda: probe(config["production_url"], release["version_label"]))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Never guess after an ambiguous swap. Reverse only a confirmed new production.
        now, previous = pair(aws, config)
        if now["EnvironmentName"] == candidate["EnvironmentName"] and previous["VersionLabel"] == active["VersionLabel"]:
            swap(aws, candidate["EnvironmentName"], active["EnvironmentName"])
            eventually(lambda: wait_active(aws, config, active["EnvironmentName"], active["VersionLabel"]))
            eventually(lambda: probe(config["production_url"], release["deployment"]["previous_version"]))
            record["state"] = "rolled_back"
        else:
            record["state"] = "needs_inspection"
        write_record(record_path, record)
        raise ValueError(f'Promotion failed; state={record["state"]}') from error
    record["state"] = "promoted"
    write_record(record_path, record)
    return record


def rollback(aws, config, record, record_path):
    if record.get("state") != "promoted":
        raise ValueError("Only a successfully recorded promotion can be rolled back")
    release = validate_release(record["release"])
    deployment = release["deployment"]
    if deployment.get("application") != config["application"] or deployment.get("production_cname") != config["production_cname"]:
        raise ValueError("Promotion record belongs to another environment")
    active, previous = pair(aws, config)
    ready(active)
    ready(previous)
    expected = (deployment["candidate"], release["version_label"], deployment["active"], deployment["previous_version"])
    actual = (active["EnvironmentName"], active["VersionLabel"], previous["EnvironmentName"], previous["VersionLabel"])
    if expected != actual:
        raise ValueError("Environment versions changed; refusing stale rollback")
    probe(test_url(config, previous["EnvironmentName"]), deployment["previous_version"])
    write_record(record_path, {"state": "rollback_intent", "release": release})
    swap(aws, active["EnvironmentName"], previous["EnvironmentName"])
    eventually(lambda: wait_active(aws, config, previous["EnvironmentName"], deployment["previous_version"]))
    eventually(lambda: probe(config["production_url"], deployment["previous_version"]))
    write_record(record_path, {"state": "rolled_back", "release": release})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("stage", "promote", "rollback"))
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--bucket")
    parser.add_argument("--compatible", action="store_true", help="Confirm schema and concurrent workers were reviewed for both releases")
    args = parser.parse_args()
    value = json.loads(args.input.read_text(encoding="utf-8"))
    region = os.environ.get("AWS_REGION", "ap-southeast-2")
    config = settings()
    release = value["release"] if args.action == "rollback" else value
    validate_release(release)
    if release["region"] != region:
        raise ValueError("Release Region does not match AWS_REGION")
    if not args.compatible:
        raise ValueError("Review schema and concurrent worker compatibility; pass --compatible explicitly")
    aws = Aws(region)
    if args.action == "stage":
        if not args.bundle or not args.bucket:
            parser.error("stage requires --bundle and --bucket")
        stage(aws, config, value, args.bundle, args.bucket, args.output)
    elif args.action == "promote":
        promote(aws, config, value, args.output)
    else:
        rollback(aws, config, value, args.output)
    print(f"AWS {args.action} checks completed; see {args.output}")


if __name__ == "__main__":
    main()
