#!/usr/bin/env python3
"""Opt-in Docker integration check for the exact-image cold-copy path.
Uses only uniquely named disposable containers/volumes/network, publishes no ports,
and never loads the project's .env. Requires already present postgres:16-alpine,
mongo:4.4 and redis:7-alpine images. It does not install or test K3s.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("production", Path(__file__).with_name("k8s-production.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
PREFIX = "reloop-copy-test-" + uuid.uuid4().hex[:10]
CONTAINERS = []
VOLUMES = []
NETWORK = PREFIX + "-net"


def docker(*args, stdin=None, stdout=subprocess.PIPE, check=True):
    result = subprocess.run(["docker", *args], stdin=stdin, stdout=stdout, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace"))
    return result.stdout.decode().strip() if stdout == subprocess.PIPE else ""


def wait_for(command):
    for _ in range(90):
        try:
            return command()
        except RuntimeError:
            time.sleep(1)
    raise RuntimeError("Fixture service did not become ready.")


def container(name, image, volume, target, *args, env=()):
    full = PREFIX + "-" + name
    CONTAINERS.append(full)
    options = []
    for variable in env:
        options += ["-e", variable]
    if name.endswith("mongo"):
        options += ["--network-alias", "mongo"]
    docker("run", "-d", "--pull=never", "--name", full, "--network", NETWORK,
           "-v", f"{volume}:{target}", *options, image, *args)
    return full


def main():
    images = {"postgres": "postgres:16-alpine", "mongo": "mongo:4.4", "redis": "redis:7-alpine"}
    paths = {"postgres": "/var/lib/postgresql/data", "mongo": "/data/db", "redis": "/data"}
    for image in images.values():
        docker("image", "inspect", image)
    docker("network", "create", "--internal", NETWORK)
    with tempfile.TemporaryDirectory(prefix=PREFIX) as directory:
        root = Path(__file__).resolve().parents[2]
        fixture_env = Path(directory) / "fixture.env"
        values = {"POSTGRES_USER": "reloop", "POSTGRES_PASSWORD": "fixture-only",
                  "GATEWAY_PORT": "8080", "FRONTEND_PORT": "3000", "REDIS_URL": "redis://redis:6379",
                  "INTERNAL_SERVICE_TOKEN": "fixture-only"}
        for name in ("AUTH", "PRODUCT", "ORDER", "SUPPORT"):
            values["DATABASE_URL_" + name] = "postgresql://reloop:fixture-only@postgres:5432/reloop_" + name.lower()
        values["DATABASE_URL_CHAT"] = "mongodb://mongo:27017/reloop_chat?replicaSet=rs0"
        fixture_env.write_text("\n".join(key + "=" + value for key, value in values.items()))
        rendered = json.loads(docker("compose", "--env-file", str(fixture_env),
            "-f", str(root / "docker-compose.yml"), "-f", str(root / "docker-compose.prod.yml"),
            "config", "--no-env-resolution", "--format", "json"))
        m.validate_config(rendered)
        print("PASS: real production Compose configuration accepted (synthetic env; no .env loaded)", flush=True)
        for database in images:
            for side in ("source", "target"):
                volume = PREFIX + "-" + side + "-" + database
                VOLUMES.append(volume)
                docker("volume", "create", volume)
        source = {}
        source["postgres"] = container("source-postgres", images["postgres"], VOLUMES[0], paths["postgres"],
                                       env=("POSTGRES_PASSWORD=fixture-only",))
        source["mongo"] = container("source-mongo", images["mongo"], VOLUMES[2], paths["mongo"],
                                    "--replSet", "rs0", "--bind_ip_all")
        source["redis"] = container("source-redis", images["redis"], VOLUMES[4], paths["redis"])
        wait_for(lambda: docker("exec", source["postgres"], "pg_isready", "-U", "postgres"))
        docker("exec", source["postgres"], "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
               "CREATE TABLE preserved(id int PRIMARY KEY, note text); INSERT INTO preserved VALUES(7,'original');")
        wait_for(lambda: docker("exec", source["mongo"], "mongo", "--quiet", "--eval", "quit(db.runCommand({ping:1}).ok ? 0 : 1)"))
        docker("exec", source["mongo"], "mongo", "--quiet", "--eval",
               'rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]})')
        wait_for(lambda: docker("exec", source["mongo"], "mongo", "--quiet", "--eval", "quit(db.isMaster().ismaster ? 0 : 1)"))
        docker("exec", source["mongo"], "mongo", "--quiet", "fixture", "--eval",
               'db.preserved.insertOne({_id:7,note:"original"})')
        wait_for(lambda: docker("exec", source["redis"], "redis-cli", "ping"))
        docker("exec", source["redis"], "redis-cli", "SET", "preserved", "original")
        docker("exec", source["redis"], "sh", "-c", "mkdir -p /data/private-kyc; printf preserved-file > /data/private-kyc/document")
        assert docker("exec", source["redis"], "redis-cli", "SAVE") == "OK"
        docker("stop", "-t", "120", *source.values())
        for index, (database, image) in enumerate(images.items()):
            archive_path = Path(directory) / (database + ".tar")
            with archive_path.open("wb") as archive:
                docker("cp", source[database] + ":" + paths[database] + "/.", "-", stdout=archive)
            m.validate_data_archive(archive_path, database, rendered)
            with tarfile.open(archive_path) as archive:
                names = [entry.name.removeprefix("./") for entry in archive]
                expected = {"postgres": "PG_VERSION", "mongo": "WiredTiger", "redis": "dump.rdb"}[database]
                assert expected in names, f"Unexpected docker cp layout: {database}: {names[:5]}"
            volume = VOLUMES[index * 2 + 1]
            with archive_path.open("rb") as archive:
                docker("run", "--rm", "--pull=never", "-i", "--network", "none", "-v", volume + ":/restore",
                       images["redis"], "sh", "-c", "tar -xpf - -C /restore", stdin=archive)
            options = ("--replSet", "rs0", "--bind_ip_all") if database == "mongo" else ()
            env = ("POSTGRES_PASSWORD=fixture-only",) if database == "postgres" else ()
            target = container("target-" + database, image, volume, paths[database], *options, env=env)
            if database == "postgres":
                wait_for(lambda: docker("exec", target, "pg_isready", "-U", "postgres"))
                assert docker("exec", target, "psql", "-U", "postgres", "-Atc", "SELECT id || ':' || note FROM preserved") == "7:original"
            elif database == "mongo":
                wait_for(lambda: docker("exec", target, "mongo", "--quiet", "--eval", "quit(db.isMaster().ismaster ? 0 : 1)"))
                assert docker("exec", target, "mongo", "--quiet", "fixture", "--eval", 'print(db.preserved.findOne({_id:7}).note)') == "original"
            else:
                wait_for(lambda: docker("exec", target, "redis-cli", "ping"))
                assert docker("exec", target, "redis-cli", "GET", "preserved") == "original"
                assert docker("exec", target, "cat", "/data/private-kyc/document") == "preserved-file"
            original = json.loads(docker("inspect", source[database]))[0]
            assert not original["State"]["Running"], "Source must stay stopped"
            print(f"PASS: {database} cold-copy, exact image, original data preserved", flush=True)
    print("PASS: upload fixture preserved; no ports published; original source volumes retained until fixture cleanup", flush=True)


if __name__ == "__main__":
    try:
        main()
    finally:
        for name in reversed(CONTAINERS):
            docker("rm", "-f", "-v", name, check=False)
        for volume in VOLUMES:
            docker("volume", "rm", volume, check=False)
        docker("network", "rm", NETWORK, check=False)
