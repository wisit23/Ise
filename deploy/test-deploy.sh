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
    if [[ $* == *pg_dumpall* ]]; then
      [[ $CASE != backup-fail ]] || exit 9
      echo 'database backup'
    elif [[ $* == *mongodump* ]]; then echo 'mongo backup'; fi ;;
  run) [[ $CASE != migration-fail ]] || exit 10 ;;
esac
MOCK
chmod +x "$temp/bin/git" "$temp/bin/docker"
printf '#!/usr/bin/env bash\nexit 0\n' >"$temp/bin/flock"
chmod +x "$temp/bin/flock"
export PATH="$temp/bin:$PATH"
export CALLS="$temp/calls"
export DEPLOY_STATE_DIR="$temp/state"
for CASE in happy dirty build-fail schema backup-fail migration-fail; do
  export CASE
  rm -rf "$DEPLOY_STATE_DIR"
  : >"$CALLS"
  args=()
  case "$CASE" in backup-fail|migration-fail) args=(--migrate) ;; esac
  if bash "$temp/repo/deploy.sh" "${args[@]}" >"$temp/output" 2>&1; then rc=0; else rc=$?; fi
  if [[ $CASE == happy ]]; then
    [[ $rc == 0 ]]
    grep -q 'Deploy OK:' "$temp/output"
    grep -q 'up -d auth-service' "$CALLS"
    ! grep -q 'pg_dumpall' "$CALLS"
    ! grep -q 'run --rm' "$CALLS"
    ! grep -q 'up -d pgadmin' "$CALLS"
  else
    [[ $rc != 0 ]]
    ! grep -q 'up -d' "$CALLS"
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
    esac
  fi
  echo "PASS $CASE"
done
