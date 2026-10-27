# Deployment recovery and script safety — 28 October 2026

## Scope and delivery

The user approved permanent deployment script fixes, regression tests and documentation locally, without pushing. These changes have not been committed, pushed or installed on the Cloud VM. Existing unrelated application edits were preserved. Product remains on the user's selected working image.

## Incident and recovery

1. The single K3s node `re-loop` reported `DiskPressure=True` and acquired the `node.kubernetes.io/disk-pressure:NoSchedule` taint. Events explicitly showed ephemeral-storage evictions. Replacement pods stayed Pending, including databases. A node can remain Ready while this condition blocks scheduling.
2. The public site returned a Cloudflare 504 while origin services were unavailable. Disk pressure and stopped application/database pods explain the observed outage; the screenshot alone does not identify every proxy fault.
3. Recovery removed selected obsolete deployment image tags and duplicate Docker copies after checking K3s copies. No database volumes, application data or backup archives were deleted. Missing runtime images were imported again.
4. The latest deployment attempt built/imported images, but the legacy maintenance wait included historical terminal pods and timed out. That script invocation did not complete successfully. Reviewed operator recovery continued the rollout.
5. The new Product image failed because the VM could not run its Sharp native dependency. Product was restored to the prior working image at the user's request. No dependency downgrade was made.
6. Mongo's internal Service was corrected to publish not-ready addresses so its single-member replica set could resolve its own Service during startup. Mongo recovered after restart.
7. After readiness and public HTTP checks, the deployment journal was reconciled to the actual mixed image set. It was marked ready at `2026-10-27T21:29:02Z`. All ten deployments were Ready 1/1 at that verification. Public frontend, product feed JSON and chat polling returned HTTP 200. These are recorded observations, not continuous monitoring.

Deployment operations used the Web SSH terminal at `https://init-d.cskmitl.com/status`. The permanent code changes and automated tests were performed in the local checkout.

## Recorded Cloud versions

- GitHub main inspected for that rollout: `085ec79defffc3ce5a01b295cf37019c270da246`.
- Auth, Chat, Frontend, Gateway, Order and Support: `run-20261027t205706z-1008032`.
- Product retained: `docker.io/reloop-production/product-service:run-20261027t111615z-529952`.
- PostgreSQL, Mongo and Redis: `run-20261026t065310z-3363042`.

The earlier public WebSocket upgrade returned HTTP 400 through the proxy while the direct gateway returned 101. This separate proxy issue was not changed by the deployment-script fix. Chat polling success does not establish WebSocket upgrade success.

## Permanent local changes

- Check free space on the state, Docker and K3s/containerd filesystems. Reserve at least 10 GiB, with additional migration/first-copy backup allowance where needed; require another 4 GiB before building and twice the image size before import.
- Monitor free space once per second while build/import runs, including commands that emit no output. Interrupt the guarded processes if the reserve is crossed. Stream image import instead of creating a second multi-GB tar file.
- Remove only obsolete application image tags matching this deployment's naming convention. Protect current and previous deployment images, Kubernetes pod references, Docker container references and aliases sharing protected image IDs. Exclude database images and foreign tags. No global image/volume prune.
- After verified K3s import, ordinary updates may remove that run's redundant Docker image copy. First cutover/fresh recovery keeps source copies.
- Run bounded image smoke checks before maintenance, including a real Sharp image conversion. Ordinary updates use isolated Kubernetes Jobs without credentials, application mounts or service account tokens; first cutover uses Docker sandboxes because the application namespace does not exist yet. These checks detect the observed native-runtime failure; they are not full application acceptance tests.
- Add `--keep-service product-service` for ordinary updates. Verify the existing Product is ready and matches the journal, skip rebuilding/importing Product, and record the retained image. Reject this option with migration/fresh/resume modes.
- During scale-down, wait only for nonterminal pods instead of including historical Failed/Succeeded pods in a label-wide deletion wait.
- Persist Mongo `publishNotReadyAddresses` and reject pressure conditions even when the node reports Ready.
- Update help and operational documentation without changing unrelated application behavior.

## Verification

- New safety suite: **22 tests passed on Windows and 22 on Linux** (`python:3.12-alpine`). This includes real subprocess interruption for quiet builds and both sides of streaming import; cluster operations are mocked.
- Existing CI/CD suite: **28 tests passed**.
- Full production-cloud suite: **99 tests executed**, with **3 failures and 1 error across 2 pre-existing secret-policy test methods**. The same failure pattern was recorded before these changes. `test_reused_tokens_blocked` and `test_unsafe_production_secrets_blocked_without_disclosure` expect a policy that existing source had disabled. This task did not restore that policy or alter those tests to hide failures.
- Bash syntax and `git diff --check` passed. CLI help and incompatible mode rejection were checked.
- The complete modified deployment script has **not** been run against production. Cloud recovery evidence above belongs to the earlier operator-assisted recovery, not a production trial of this local patch.

Evidence logs are local under `.deploy-state/`: `disk-guard-baseline-tests.log`, `disk-guard-final-tests.log`, `disk-guard-safety-windows.log`, `disk-guard-linux-tests.log`, and `disk-guard-cicd-tests.log`.

## Commands

Original deployment entry point:

```bash
sudo bash deploy/production-cloud/deploy-k8s.sh
```

After the fixed script is transferred to the server through the chosen release process, keep the current working Product while updating the other applications:

```bash
sudo -i
cd /root/Ise
tmux new -s reloop-deploy
bash deploy/production-cloud/deploy-k8s.sh --keep-service product-service
```

After a Web SSH disconnect:

```bash
sudo tmux attach -t reloop-deploy
```

Read-only health checks:

```bash
sudo k3s kubectl get nodes
sudo k3s kubectl describe node re-loop
sudo k3s kubectl -n reloop-production get pods -o wide
sudo k3s kubectl -n reloop-production get deployments
df -h
df -i
```

Local regression commands:

```powershell
python -B -m unittest discover -s deploy/production-cloud -p 'test_k8s_safety.py' -v
python -B -m unittest discover -s deploy/production-cloud -p 'test_*.py'
```

## Limits

The disk monitor is not a filesystem quota. Concurrent writers and Docker daemon work can consume space between checks. Cleanup intentionally refuses to remove data, backups, protected runtime images or unknown image tags. When protected content leaves insufficient capacity, the script stops before maintenance and requires additional capacity or reviewed cleanup. Functional correctness, schema compatibility and proxy configuration still need their respective checks. No claim of zero bugs is made.
