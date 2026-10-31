"""Consume approved public deployment requests without an Actions runner or token."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

import deploy_release
import release as contract

REPOSITORY = "wisit23/Ise"
API = "https://api.github.com/repos/" + REPOSITORY
TAG = re.compile(r"production-request-([1-9][0-9]*)-([1-9][0-9]*)")


def read_url(url, limit=32768):
    parts = urlsplit(url)
    contract.require(parts.scheme == "https" and parts.hostname in ("api.github.com", "github.com"), "Unexpected request URL")
    with urlopen(Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "ise-production-pull"}), timeout=30) as response:
        final_host = urlsplit(response.url).hostname or ""
        contract.require(final_host in ("api.github.com", "github.com") or final_host.endswith(".githubusercontent.com"), "Unexpected download redirect")
        body = response.read(limit + 1)
    contract.require(len(body) <= limit, "Deployment request exceeds size limit")
    return body


def api(path):
    return json.loads(read_url(API + path, 512 * 1024))


def check_run(run, path, event):
    contract.require(run.get("path") == path and run.get("event") == event
                     and run.get("head_branch") == "main" and run.get("status") == "completed"
                     and run.get("conclusion") == "success"
                     and run.get("repository", {}).get("full_name") == REPOSITORY
                     and run.get("head_repository", {}).get("full_name") == REPOSITORY,
                     "Request requires a successful trusted main workflow")


def validate_request(item):
    tag = item.get("tag_name", "")
    match = TAG.fullmatch(tag)
    contract.require(match is not None and not item.get("draft") and not item.get("prerelease"), "Invalid deployment request release")
    run_id, attempt = map(int, match.groups())
    deployment = api(f"/actions/runs/{run_id}/attempts/{attempt}")
    check_run(deployment, ".github/workflows/deploy.yml", "workflow_dispatch")
    artifacts = api(f"/actions/runs/{run_id}/artifacts?per_page=100").get("artifacts", [])
    artifacts = [a for a in artifacts if a.get("name") == f"approved-production-request-{attempt}" and not a.get("expired")]
    contract.require(len(artifacts) == 1, "Approved immutable request artifact is missing or duplicated")
    artifact = artifacts[0]
    contract.require(artifact.get("workflow_run", {}).get("id") == run_id, "Artifact is from another workflow run")
    assets = item.get("assets", [])
    contract.require(len(assets) == 1 and assets[0].get("name") == "deployment-input.zip", "Request assets are incomplete or duplicated")
    expected = f"https://github.com/{REPOSITORY}/releases/download/{tag}/deployment-input.zip"
    contract.require(assets[0].get("browser_download_url") == expected and assets[0].get("size", 0) <= 131072, "Unexpected deployment asset")
    archive = read_url(expected, 131072)
    # Release assets are mutable. Trust only the digest of the immutable Actions
    # artifact from this exact approved run/attempt, obtained directly from GitHub.
    contract.require(artifact.get("digest") == "sha256:" + hashlib.sha256(archive).hexdigest(), "Immutable Actions artifact checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        entries = zipped.infolist()
        contract.require(len(entries) == 2 and {e.filename for e in entries} == {"request.json", "release.json"}
                         and all(e.file_size <= 32768 for e in entries), "Invalid request archive contents")
        content = {e.filename: zipped.read(e) for e in entries}
    request = json.loads(content["request.json"])
    manifest = contract.validate(json.loads(content["release.json"]))
    contract.require(request.get("version") == 1 and request.get("environment") == "production"
                     and request.get("deploy_run_id") == run_id and request.get("run_attempt") == attempt
                     and request.get("mode") in ("promote", "rollback")
                     and type(request.get("migrate")) is bool, "Invalid deployment request")
    contract.require(not (request["mode"] == "rollback" and request["migrate"]), "Rollback cannot migrate")
    contract.require(hashlib.sha256(content["release.json"]).hexdigest() == request.get("manifest_sha256"), "Release asset checksum mismatch")
    selected = request.get("release_run_id")
    contract.require(type(selected) is int and selected > 0, "Invalid selected release run")
    release_run = api(f"/actions/runs/{selected}")
    check_run(release_run, ".github/workflows/release.yml", "workflow_run")
    contract.require(manifest["run_url"] == f"https://github.com/{REPOSITORY}/actions/runs/{selected}", "Manifest provenance does not match selected release")
    # workflow_run's head_sha can describe the workflow revision rather than the
    # upstream CI revision. Check the manifest commit's push CI explicitly.
    ci_runs = api(f"/actions/workflows/ci.yml/runs?head_sha={manifest['commit']}&event=push&status=success&per_page=10")
    contract.require(any(r.get("head_sha") == manifest["commit"] and r.get("head_branch") == "main"
                         and r.get("conclusion") == "success" and r.get("event") == "push"
                         and r.get("head_repository", {}).get("full_name") == REPOSITORY
                         for r in ci_runs.get("workflow_runs", [])), "Release commit has no successful main push CI")
    return request, content["release.json"]


def consume(settings, state_path):
    prior = json.loads(state_path.read_text()) if state_path.exists() else {}
    items = api("/releases?per_page=30")
    candidates = []
    for item in items:
        match = TAG.fullmatch(item.get("tag_name", ""))
        if match and not item.get("draft") and not item.get("prerelease"):
            key = tuple(map(int, match.groups()))
            if key > tuple(prior.get("key", [0, 0])):
                candidates.append((key, item))
    if not candidates:
        print("No new approved production request")
        return
    key, item = max(candidates, key=lambda pair: pair[0])
    request, manifest = validate_request(item)
    record = {"key": list(key), "tag": item["tag_name"], "status": "started"}
    deploy_release.cloud.write_json(state_path, record)
    # Record before starting: interruptions and failed deployments require a new
    # reviewed request, never a timer-driven retry of a partially applied release.
    try:
        subprocess.run(["/usr/local/sbin/ise-deploy", "production", request["mode"],
                        "migrate" if request["migrate"] else "no-migrate"], input=manifest, check=True, timeout=3600)
    except BaseException:
        record["status"] = "failed"
        deploy_release.cloud.write_json(state_path, record)
        raise
    record["status"] = "success"
    deploy_release.cloud.write_json(state_path, record)
    print("Production deployment completed:", item["tag_name"])


def main():
    import fcntl
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate the latest request without deploying or recording it")
    args = parser.parse_args()
    settings = deploy_release.configuration(Path("/etc/ise-cicd.json"), "production")
    directory = Path(settings["state"])
    with (directory / "pull-request.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.check:
            items = [item for item in api("/releases?per_page=30") if TAG.fullmatch(item.get("tag_name", ""))]
            contract.require(bool(items), "No approved request is published")
            validate_request(max(items, key=lambda item: tuple(map(int, TAG.fullmatch(item["tag_name"]).groups()))))
            print("Approved request validated; no deployment performed")
        else:
            consume(settings, directory / "pull-request.json")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Production request failed:", type(error).__name__, file=sys.stderr)
        sys.exit(1)
