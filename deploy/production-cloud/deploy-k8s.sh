#!/usr/bin/env bash
# Single-node production K3s deployment. Never source .env or erase Compose data.
set -Eeuo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
case "${1:-}" in
  --help|-h)
    printf '%s\n' 'Usage: bash deploy/production-cloud/deploy-k8s.sh [--migrate]' \
      'First run: installs K3s and cold-copies the existing Compose installation.' \
      '--migrate: run reviewed database migrations during downtime.' \
      'Requires Linux/root, Docker Compose, Python 3, curl, flock and systemd.' \
      'Read deploy/production-cloud/README.md before using on a live server.'
    exit 0 ;;
esac
[[ $(uname -s) == Linux ]] || { echo 'Run on the Linux server, not a workstation.' >&2; exit 1; }
[[ $EUID == 0 ]] || { echo 'Run as root (sudo -i), from the existing checkout.' >&2; exit 1; }
for tool in python3 docker curl flock systemctl tar du ip ss; do
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
exec 9>"$STATE/lock"
flock -n 9 || { echo 'Another Kubernetes deployment is running.' >&2; exit 1; }
# Coordinate the first cutover with the existing Compose deploy.sh as well.
COMPOSE_STATE=${DEPLOY_STATE_DIR:-$ROOT/.deploy-state}
mkdir -p "$COMPOSE_STATE"
exec 8>"$COMPOSE_STATE/lock"
flock -n 8 || { echo 'The Compose deployment script is running; do not cut over concurrently.' >&2; exit 1; }
exec python3 "$ROOT/deploy/production-cloud/k8s-production.py" "$ROOT" "$STATE" "$@"
