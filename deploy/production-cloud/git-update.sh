#!/usr/bin/env bash
# Sourced by the locked deploy entry point. No reset, stash, checkout or clean.
k8s_update_checkout() {
  local root=$1 top
  top=$(git -C "$root" rev-parse --show-toplevel) || return
  [[ $(cd -- "$top" && pwd) == "$root" ]] || {
    echo 'ERROR: Deploy must use the Git repository root.' >&2; return 1;
  }
  [[ $(git -C "$root" branch --show-current) == main ]] || {
    echo 'ERROR: Checkout must be on main.' >&2; return 1;
  }
  [[ -z $(git -C "$root" status --porcelain --untracked-files=all) ]] || {
    echo 'ERROR: Checkout has local changes/untracked files. Preserve and reconcile them before deploy.' >&2; return 1;
  }
  git -C "$root" ls-files --error-unmatch deploy/production-cloud/deploy-k8s.sh \
    deploy/production-cloud/git-update.sh deploy/production-cloud/k8s-production.py \
    deploy/production-cloud/k8s-fresh.py >/dev/null || {
    echo 'ERROR: Commit the deploy entry point and helpers before use.' >&2; return 1;
  }
  echo 'Updating main from origin/main (fast-forward only)...'
  GIT_TERMINAL_PROMPT=0 git -C "$root" fetch origin refs/heads/main:refs/remotes/origin/main || return
  git -C "$root" merge-base --is-ancestor HEAD refs/remotes/origin/main || {
    echo 'ERROR: main has local commits or diverges from origin/main. Reconcile it before deploy.' >&2; return 1;
  }
  [[ -z $(git -C "$root" ls-files -- .env) ]] &&
    git -C "$root" diff --quiet HEAD refs/remotes/origin/main -- .env || {
    echo 'ERROR: Git tracks or changes the machine-local .env. Reconcile it before deploy.' >&2; return 1;
  }
  git -C "$root" merge --no-overwrite-ignore --ff-only refs/remotes/origin/main
}
