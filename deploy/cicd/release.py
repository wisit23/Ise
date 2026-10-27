"""Release contract shared by Actions and the VM. No third-party dependencies."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

APPS = ("auth-service", "product-service", "order-service", "support-service",
        "chat-service", "gateway", "frontend")
REPOSITORY = "wisit23/Ise"
SCHEMA_PATHS = tuple(f"backend/services/{name}/prisma" for name in APPS[:5]) + (
    "infra/postgres", "infra/mongo")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def schema_fingerprint(root, commit):
    """Match the legacy Linux deployment journal, without checking out that commit."""
    checksum = hashlib.sha256()
    for directory in SCHEMA_PATHS:
        records = git(root, "ls-tree", "-rz", "--full-tree", commit, "--", directory).split(b"\0")
        for record in sorted(filter(None, records), key=lambda item: item.split(b"\t", 1)[1]):
            metadata, path = record.split(b"\t", 1)
            mode, kind, blob = metadata.split()
            require(kind == b"blob" and mode in (b"100644", b"100755"), "Schema inputs must be regular files")
            checksum.update(path)
            checksum.update(git(root, "cat-file", "blob", blob.decode()))
    return checksum.hexdigest()


def validate(value):
    require(isinstance(value, dict) and value.get("version") == 1, "Unsupported release version")
    require(value.get("repository") == REPOSITORY, "Unexpected release repository")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", value.get("commit", ""))), "Invalid commit")
    require(bool(re.fullmatch(r"[0-9a-f]{64}", value.get("schema", ""))), "Invalid schema fingerprint")
    require(value.get("platform") in ("linux/amd64", "linux/arm64"), "Unsupported platform")
    require(value.get("frontend_api") == "same-origin", "Unsupported frontend routing")
    require(bool(re.fullmatch(r"https://github\.com/wisit23/Ise/actions/runs/[0-9]+", value.get("run_url", ""))),
            "Invalid workflow run URL")
    images = value.get("images")
    require(isinstance(images, dict) and set(images) == set(APPS), "Release must include exactly seven images")
    for name, image in images.items():
        require(isinstance(image, str) and bool(re.fullmatch(
            rf"ghcr\.io/wisit23/ise-{name}@sha256:[0-9a-f]{{64}}", image)), f"Invalid image for {name}")
    return value


def load(path):
    require(Path(path).stat().st_size <= 32768, "Release manifest is too large")
    return validate(json.loads(Path(path).read_text(encoding="utf-8")))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--root", type=Path, default=Path.cwd())
    create.add_argument("--records", type=Path, required=True)
    create.add_argument("--commit", required=True)
    create.add_argument("--run-url", required=True)
    create.add_argument("--platform", choices=("linux/amd64", "linux/arm64"), default="linux/amd64")
    create.add_argument("--output", type=Path, required=True)
    check = sub.add_parser("validate")
    check.add_argument("manifest", type=Path)
    args = parser.parse_args()
    if args.command == "validate":
        value = load(args.manifest)
    else:
        records = [json.loads(path.read_text()) for path in args.records.glob("*.json")]
        require(len(records) == len(APPS), "Missing or duplicate image records")
        require(all(record["commit"] == args.commit for record in records), "Mixed source commits")
        require(set(record["component"] for record in records) == set(APPS), "Missing image components")
        value = validate({"version": 1, "repository": REPOSITORY, "commit": args.commit,
            "run_url": args.run_url, "platform": args.platform, "frontend_api": "same-origin",
            "schema": schema_fingerprint(args.root, args.commit),
            "images": {record["component"]: record["image"] for record in records}})
        args.output.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    print(f"Release validated: {value['commit']} ({len(value['images'])} images)")


if __name__ == "__main__":
    main()
