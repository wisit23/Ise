"""Use only the protected installed modules, ignoring caller import paths."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pull_requests

if __name__ == "__main__":
    pull_requests.main()
