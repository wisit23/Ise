"""Ignore caller PYTHONPATH/current-directory imports when running under sudo."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deploy_release

if __name__ == "__main__":
    try:
        deploy_release.main()
    except (deploy_release.cloud.Blocked, OSError, ValueError, KeyError, KeyboardInterrupt):
        print("Deploy failed. Inspect private VM diagnostics; no automatic rollback or data reset was attempted.", file=sys.stderr)
        sys.exit(1)
