#!/usr/bin/env bash
# Update an existing Linux server installation; never reset Git or database volumes.
set -Eeuo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$ROOT"
MIGRATE=0
case "${1:-}" in
  '') ;;
  --migrate) MIGRATE=1 ;;
  --help|-h)
    printf 'Usage: bash deploy.sh [--migrate]\nRun on the existing Linux server, on main, with .env configured.\n--migrate: back up databases and run reviewed migrations during downtime.\n'
    exit 0 ;;
  *) echo 'Unknown option. Use --help.' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo 'Too many arguments.' >&2; exit 2; }
die() { echo "ERROR: $*" >&2; exit 1; }
for tool in git docker flock; do command -v "$tool" >/dev/null || die "Missing command: $tool"; done
[[ -f .env ]] || die 'Missing .env. This script is for an existing configured server.'
[[ $(git branch --show-current) == main ]] || die 'Checkout must be on main.'
[[ -z $(git status --porcelain --untracked-files=no) ]] || die 'Tracked files have local changes. Preserve/reconcile them first; nothing was overwritten.'
git ls-files --error-unmatch deploy.sh >/dev/null 2>&1 || die 'deploy.sh must be committed before use.'
STATE=${DEPLOY_STATE_DIR:-$ROOT/.deploy-state}
mkdir -p "$STATE"
# A re-exec after updating this script inherits the lock and keeps the same PID.
if [[ ${DEPLOY_LOCK_PID:-} != "$$" ]]; then
  exec 9>"$STATE/lock"
  flock -n 9 || die 'Another deploy is running.'
  export DEPLOY_LOCK_PID=$$
fi
stage=preflight
run_dir=''
on_error() {
  local rc=$?
  trap - ERR
  echo "Deploy FAILED during $stage (exit $rc). No database reset or automatic schema rollback was performed." >&2
  [[ -z $run_dir ]] || echo "Logs, previous commit/images, and any backups: $run_dir" >&2
  if [[ $stage == migration* ]]; then
    echo 'Application services may be stopped. Inspect migration logs before restarting; partial schema changes need manual recovery.' >&2
  fi
  exit "$rc"
}
trap on_error ERR
compose=(docker compose --env-file "$ROOT/.env" -f "$ROOT/docker-compose.yml")
[[ ! -f docker-compose.override.yml ]] || compose+=(-f "$ROOT/docker-compose.override.yml")
# Production comes last, so development bind mounts cannot override the built frontend.
compose+=(-f "$ROOT/docker-compose.prod.yml")
dc() { "${compose[@]}" "$@"; }
apps=(auth-service product-service order-service support-service chat-service gateway frontend)
docker info >/dev/null
dc config --quiet
before=$(git rev-parse HEAD)
# Persist the initial baseline even when a pull stops on database changes.
# This prevents a second ordinary invocation from bypassing the migration gate.
[[ -f $STATE/last-success-commit ]] || printf '%s\n' "$before" >"$STATE/last-success-commit"
stage=update
git fetch origin main
git merge --ff-only origin/main
after=$(git rev-parse HEAD)
if ! git diff --quiet "$before" "$after" -- deploy.sh; then
  echo 'Deploy script updated; continuing with the new version.'
  exec bash "$ROOT/deploy.sh" "$@"
fi
dc config --quiet
schema_changes=$(git diff --name-only "$before" "$after" -- 'backend/services/*/prisma/**' 'infra/postgres/**' 'infra/mongo/**')
if [[ -n $schema_changes && $MIGRATE == 0 ]]; then
  printf 'Database-related files changed:\n%s\n' "$schema_changes" >&2
  die 'Source updated, services not replaced. Review migrations, then rerun bash deploy.sh --migrate.'
fi
# Also protect a rerun after the previous command pulled schema changes but stopped.
if [[ -f $STATE/last-success-commit && $MIGRATE == 0 ]]; then
  deployed=$(cat "$STATE/last-success-commit")
  git cat-file -e "$deployed^{commit}"
  if ! git diff --quiet "$deployed" "$after" -- 'backend/services/*/prisma/**' 'infra/postgres/**' 'infra/mongo/**'; then
    die 'Schema differs from the last successful deployment. Review and use --migrate.'
  fi
fi
run_dir=$(mktemp -d "$STATE/run-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
printf '%s\n' "$before" >"$run_dir/previous-commit"
printf '%s\n' "$after" >"$run_dir/target-commit"
cp .env "$run_dir/env"
[[ ! -f docker-compose.override.yml ]] || cp docker-compose.override.yml "$run_dir/override.yml"
for service in "${apps[@]}"; do
  cid=$(dc ps -q "$service")
  if [[ -n $cid ]]; then
    docker inspect --format '{{.Image}}' "$cid" >"$run_dir/$service.previous-image"
    docker image tag "$(cat "$run_dir/$service.previous-image")" "reloop-rollback/$service:$(basename "$run_dir" | tr '[:upper:]' '[:lower:]')"
  fi
done
stage=build
echo 'Building production images; current containers continue serving.'
dc build "${apps[@]}" 2>&1 | tee "$run_dir/build.log"
if [[ $MIGRATE == 1 ]]; then
  # A coordinated maintenance window keeps the PostgreSQL/Mongo backups consistent
  # with respect to application writes. No seeds or destructive db-push flags.
  stage=migration-stop
  dc stop "${apps[@]}"
  stage=migration-backup
  dc exec -T postgres sh -c 'pg_dumpall -U "$POSTGRES_USER"' >"$run_dir/postgres.sql"
  dc exec -T mongo mongodump --archive --gzip >"$run_dir/mongo.archive.gz"
  [[ -s $run_dir/postgres.sql && -s $run_dir/mongo.archive.gz ]] || die 'Database backup is empty; services remain stopped.'
  stage=migration-apply
  for service in auth-service product-service order-service support-service; do
    dc run --rm --no-deps "$service" node prisma/migrate.js 2>&1 | tee "$run_dir/$service.migration.log"
  done
  dc run --rm --no-deps chat-service npx prisma db push --skip-generate 2>&1 | tee "$run_dir/chat.migration.log"
fi
stage=start
# Explicit application targets do not start the optional pgAdmin interface.
dc up -d "${apps[@]}" 2>&1 | tee "$run_dir/start.log"
stage=health
deadline=$((SECONDS + 180))
while :; do
  ready=1
  for service in "${apps[@]}"; do
    cid=$(dc ps -q "$service")
    if [[ -z $cid ]]; then ready=0; continue; fi
    status=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid")
    case "$status" in 'running healthy'|'running ') ;; *) ready=0 ;; esac
  done
  if [[ $ready == 1 ]] && dc exec -T frontend node -e 'if(process.env.NODE_ENV!=="production")process.exit(1);fetch("http://127.0.0.1:3000",{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))' && dc exec -T gateway node -e 'fetch("http://127.0.0.1:8080/health",{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'; then
    break
  fi
  if (( SECONDS >= deadline )); then
    dc ps >&2
    dc logs --tail 30 "${apps[@]}" >"$run_dir/health-failure.log" 2>&1
    die "Health check timed out. Inspect $run_dir/health-failure.log; automatic rollback is not attempted."
  fi
  sleep 5
done
printf '%s\n' "$after" >"$STATE/last-success-commit"
dc ps
echo "Deploy OK: $after (production). Logs and rollback references: $run_dir"
