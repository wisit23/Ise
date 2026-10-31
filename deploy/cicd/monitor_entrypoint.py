"""Use only installed imports, never the caller's working directory."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import smoke

if __name__ == "__main__":
    config = json.loads(Path("/etc/ise-cicd.json").read_text())
    if config.get("enabled"):
        smoke.check(config["public_url"], require_websocket=config.get("require_websocket", True))
