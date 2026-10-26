#!/usr/bin/env bash
# Single-node K3s deployment. Fresh TEST reset requires two explicit flags.
set -Eeuo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
case "${1:-}" in
  --help|-h)
    printf '%s\n' 'Usage: bash deploy/production-cloud/deploy-k8s.sh [--migrate | --fresh --confirm-delete-test-data | --resume-fresh]' \
      'First run: installs K3s and cold-copies the existing Compose installation.' \
      '--migrate: run reviewed database migrations during downtime.' \
      '--fresh --confirm-delete-test-data: FIRST TEST install; deletes scoped Compose test data WITHOUT backup.' \
      '--resume-fresh: continue the recorded fresh run; never reset an existing Kubernetes installation.' \
      'Normal/fresh deploys update clean main from origin/main (fast-forward only) before building.' \
      'Resume keeps the original source. Git authentication must work for the root account.' \
      'Requires Linux/root, Git, Docker Compose, Python 3, curl, flock and systemd.' \
      'Read deploy/production-cloud/README.md before using on a live server.'
    exit 0 ;;
esac
# Reject incomplete/ambiguous destructive flags before creating state or taking locks.
case "$*" in
  ''|'--migrate'|'--fresh --confirm-delete-test-data'|'--resume-fresh') ;;
  *) echo 'Invalid arguments. Use --help. Fresh reset requires --fresh --confirm-delete-test-data.' >&2; exit 1 ;;
esac
[[ $(uname -s) == Linux ]] || { echo 'Run on the Linux server, not a workstation.' >&2; exit 1; }
[[ $EUID == 0 ]] || { echo 'Run as root (sudo -i), from the existing checkout.' >&2; exit 1; }
for tool in python3 git docker curl flock systemctl tar du ip ss; do
  command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }
done
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || {
  echo 'Python 3.9 or newer is required.' >&2; exit 1;
}
# Keep secrets, database archives and image archives outside the Docker build context.
umask 077
STATE=/var/lib/reloop-deploy-k8s
mkdir -p "$STATE"
chmod 700 "$STATE"
# Coordinate the first cutover with the existing Compose deploy.sh as well.
COMPOSE_STATE=${DEPLOY_STATE_DIR:-$ROOT/.deploy-state}
mkdir -p "$COMPOSE_STATE"
# Re-exec after pulling inherits both locks and retains the PID.
if [[ ${RELOOP_K8S_LOCK_PID:-} != "$$" ]]; then
  exec 9>"$STATE/lock"
  flock -n 9 || { echo 'Another Kubernetes deployment is running.' >&2; exit 1; }
  exec 8>"$COMPOSE_STATE/lock"
  flock -n 8 || { echo 'The Compose deployment script is running; do not cut over concurrently.' >&2; exit 1; }
  export RELOOP_K8S_LOCK_PID=$$
fi
if [[ ${1:-} != --resume-fresh ]]; then
  # An incomplete run must keep its source available for deliberate recovery.
  python3 -c 'import json,pathlib,sys; p=pathlib.Path(sys.argv[1]); j=json.loads(p.read_text()) if p.exists() else {}; sys.exit("An incomplete deployment exists. Inspect its journal/logs before updating source.") if j.get("status") not in (None,"ready") else None' "$STATE/journal.json"
  if [[ ${RELOOP_K8S_UPDATED_PID:-} != "$$" ]]; then
    source "$ROOT/deploy/production-cloud/git-update.sh"
    before=$(git -C "$ROOT" rev-parse HEAD)
    k8s_update_checkout "$ROOT"
    after=$(git -C "$ROOT" rev-parse HEAD)
    export RELOOP_K8S_UPDATED_PID=$$
    if [[ $before != "$after" ]]; then
      echo 'Source updated; continuing with the updated deploy entry point.'
      exec bash "$ROOT/deploy/production-cloud/deploy-k8s.sh" "$@"
    fi
  fi
fi
exec python3 "$ROOT/deploy/production-cloud/k8s-production.py" "$ROOT" "$STATE" "$@"
