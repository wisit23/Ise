#!/usr/bin/env bash
# Failure-path tests using fake Git/Docker; no real server or databases touched.
set -euo pipefail
source_root=$(cd "$(dirname "$0")/.." && pwd)
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/bin" "$temp/repo"
cp "$source_root/deploy.sh" "$temp/repo/deploy.sh"
touch "$temp/repo/.env"
cat >"$temp/bin/git" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
  branch) echo main ;;
  status) [[ $CASE != dirty ]] || echo ' M application.js' ;;
  ls-files|cat-file|fetch|merge) ;;
  rev-parse) echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  diff)
    if [[ $* == *--name-only* && $CASE == schema ]]; then
      echo backend/services/order-service/prisma/schema.prisma
    elif [[ $* == *--quiet* && $* != *deploy.sh* && $CASE == schema ]]; then
      exit 1
    fi ;;
esac
exit 0
MOCK
cat >"$temp/bin/docker" <<'MOCK'
#!/usr/bin/env bash
echo "$*" >>"$CALLS"
[[ $1 != info ]] || exit 0
if [[ $1 == inspect ]]; then
  if [[ $* == *State.Status* ]]; then echo 'running healthy'; else echo sha256:previous; fi
  exit 0
fi
[[ $1 != image ]] || exit 0
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file|-f) shift 2 ;;
    compose) shift ;;
    *) break ;;
  esac
done
case "${1:-}" in
  build) [[ $CASE != build-fail ]] || exit 8 ;;
  ps) [[ $* != *-q* ]] || echo fixture-container ;;
  exec)
    if [[ $* == *'/api/products/feed'* && $CASE == smoke-fail ]]; then exit 11; fi
    if [[ $* == *pg_dumpall* ]]; then
      [[ $CASE != backup-fail ]] || exit 9
      echo 'database backup'
    elif [[ $* == *mongodump* ]]; then echo 'mongo backup'; fi ;;
  run)
    if [[ $* == *'migrate status'* ]]; then
      case "$CASE" in pending|db-offline) echo 'Database status blocked'; exit 12 ;; esac
    else
      [[ $CASE != migration-fail ]] || exit 10
    fi ;;
esac
MOCK
chmod +x "$temp/bin/git" "$temp/bin/docker"
printf '#!/usr/bin/env bash\nexit 0\n' >"$temp/bin/flock"
chmod +x "$temp/bin/flock"
export PATH="$temp/bin:$PATH"
export CALLS="$temp/calls"
export DEPLOY_STATE_DIR="$temp/state"
for CASE in happy dirty build-fail schema backup-fail migration-fail pending db-offline smoke-fail migrate-success; do
  export CASE
  rm -rf "$DEPLOY_STATE_DIR"
  : >"$CALLS"
  args=()
  case "$CASE" in backup-fail|migration-fail|migrate-success) args=(--migrate) ;; esac
  if bash "$temp/repo/deploy.sh" "${args[@]}" >"$temp/output" 2>&1; then rc=0; else rc=$?; fi
  if [[ $CASE == happy || $CASE == migrate-success ]]; then
    [[ $rc == 0 ]]
    grep -q 'Deploy OK:' "$temp/output"
    grep -q 'up -d auth-service' "$CALLS"
    grep -q 'migrate status' "$CALLS"
    grep -q '/api/products/feed' "$CALLS"
    [[ -f $DEPLOY_STATE_DIR/last-success-commit ]]
    if [[ $CASE == happy ]]; then ! grep -q 'pg_dumpall' "$CALLS"; else grep -q 'pg_dumpall' "$CALLS"; fi
    ! grep -q 'up -d pgadmin' "$CALLS"
  else
    [[ $rc != 0 ]]
    if [[ $CASE != smoke-fail ]]; then ! grep -q 'up -d' "$CALLS"; fi
    ! grep -q 'Deploy OK:' "$temp/output"
    ! grep -q 'last-success' "$temp/output"
    case "$CASE" in
      dirty) ! grep -q 'build ' "$CALLS" ;;
      schema)
        ! grep -q 'build ' "$CALLS"
        [[ -f $DEPLOY_STATE_DIR/last-success-commit ]]
        # A rerun after pulling must still be blocked by the deployment baseline.
        if bash "$temp/repo/deploy.sh" >"$temp/rerun" 2>&1; then exit 1; fi ;;
      backup-fail) ! grep -q 'run --rm' "$CALLS" ;;
      migration-fail) grep -q 'pg_dumpall' "$CALLS"; grep -q 'mongodump' "$CALLS" ;;
      pending|db-offline)
        grep -q 'migrate status' "$CALLS"
        ! grep -q 'stop auth-service' "$CALLS"
        # Same Git commit and no prior deployment: database status must gate
        # both the initial run and repeated attempts after a manual pull.
        if bash "$temp/repo/deploy.sh" >"$temp/rerun" 2>&1; then exit 1; fi ;;
      smoke-fail) grep -q 'up -d' "$CALLS"; grep -q '/api/products/feed' "$CALLS" ;;
    esac
  fi
  echo "PASS $CASE"
done
