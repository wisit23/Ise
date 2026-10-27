# Single-machine production deployment readiness

## Agreement

Approved in the conversation with "เริ่มได้": update both production-local and
production-cloud for actual use, default to repository-root `.env`, validate unsafe
example settings, update documentation and run checks. Preserve existing data;
initially no new ports or live deployment were authorized.

Follow-up approved with "เริ่มได้": configure local and cloud application ports.
Local access may be enabled on the existing cluster without replacing it or
migrating data, bound to 127.0.0.1 only. Cloud changes are code/tests/docs only;
no remote deployment, firewall, TLS or database changes are authorized.

## Delivered in code

- Local default `.env` resolves from repository root, not shell working directory;
  `-EnvFile` and the existing `-SecretsFile` override are supported.
- Local dotenv parsing handles quotes/comments without executing the file; rejects
  ambiguous interpolation, escapes, multiline input and duplicate keys.
- Local runtime Secret uses parsed values; public frontend settings reach build.
  Internal ports, DNS, production mode and private-storage paths remain controlled
  by the deployment instead of accidentally inheriting Compose host settings.
- Both paths block short/example credentials, reused JWT/internal tokens, public
  HTTP URLs and public log-mail configurations before build/cutover. Cloud also
  checks frontend API URL build/runtime consistency and PG password consistency.
- New local Redis uses a PVC and AOF. Updates refuse an existing Redis without the
  expected AOF-backed /data mount rather than discarding queues/sessions. An old
  ephemeral or RDB-only installation still needs reviewed manual data migration.
- Both paths disable automatic service-account token mounts. Cloud generates a
  namespace-scoped data-service ingress NetworkPolicy; actual enforcement depends
  on the running K3s network-policy controller.
- Existing dev manifests are unchanged. Earlier user-requested `.env` corrections
  aligned DB URL passwords and added local mail/base URL values; no secret values
  are stored in this document. No database password rotation/migration was run.
- Local deploy now configures automatic loopback access. `expose.ps1` upgrades an
  existing cluster's frontend/gateway Services to NodePort and runs an owned Docker
  TCP proxy with restart policy unless-stopped, preserving the cluster and data.
- Cloud host ports follow resolved Compose `.env` values, while generated app
  listeners remain fixed at their internal ports. Existing journal port-change
  safety guards and source host-binding restrictions are preserved.

## Verification

Offline checks executed on this Windows workstation:

- `node --test deploy/production-local/deploy.test.cjs deploy/production-local/port-proxy.test.cjs`: 15 passed.
  Includes real kustomize rendering, Windows PowerShell execution with mocked
  infrastructure, dotenv validation, frontend build arguments, migration Jobs,
  initialization/defaults, Redis fail-closed behavior, NodePort manifests,
  local-access setup/ownership/port-conflict/HTTP checks with infrastructure mocks,
  and real loopback TCP forwarding tests covering binary/HTTP-upgrade bytes.
- `python -B -m unittest discover -s deploy/production-cloud -p test_k8s_production.py -v`:
  46 passed. Cloud checks are offline; they include custom host ports versus
  fixed internal listeners and actual host URLs passed to the HTTP checker.
- `bash -n deploy/production-cloud/deploy-k8s.sh`: passed.
- `bash deploy/production-cloud/deploy-k8s.sh --help`: passed without server actions.
- Targeted ESLint for `deploy.test.cjs`, `port-proxy.cjs` and `port-proxy.test.cjs`: passed.
- `git diff --check`: passed.

The offline checks are not evidence of database restore, SMTP delivery, public
TLS or enforced network isolation.

### Local runtime check for the port-access follow-up

Ran `expose.ps1` successfully against the user's existing kind cluster, then ran
it again successfully to verify setup reuse. No app rebuild, schema migration,
cluster recreation or PVC deletion was performed. Verified from this Windows host:

- `http://localhost:3000/`: HTTP 200.
- `http://localhost:8080/health`: HTTP 200.
- `http://localhost:8080/api/products/feed?limit=1`: HTTP 200.
- Docker reports the owned access container running with only 127.0.0.1:3000 and
  127.0.0.1:8080 published, and restart policy `unless-stopped`.

No Cloud VM was changed/tested live. Whole-machine reboot, public TLS, real
WebSocket chat/login flows and backup restoration were not exercised here.

## Remaining before accepting real users/data

**Not production-certified. Cloud was not deployed by this task.** Local access
is verified above; complete the remaining production checks on the intended
machines before opening public traffic. `.env` validation is not infrastructure setup.

1. Configure the machine's own `.env` with genuine independent credentials and
   correct URLs. Existing DB password changes need actual role rotation; updating
   an env file alone does not rotate a database credential.
2. Local: choose the actual access route (loopback/LAN/public). Current routing is
   loopback-only via the owned Docker proxy on the two `.env` application ports.
   For external access configure and
   verify HTTPS/reverse proxy and network isolation first. kind's default network
   does not supply verified NetworkPolicy enforcement. Mongo still has no auth.
3. Local: if Redis already exists, stop writers, back up its data, test restoring
   the dataset, and produce a verified AOF-backed PVC deployment before rerunning.
   **Do not copy only dump.rdb then restart with appendonly=yes**: enabling AOF
   requires the reviewed Redis conversion procedure and verification of the full
   dataset/AOF, not just a changed startup flag. This migration is not automated.
4. Local: back up Redis and every application PVC off-machine and test restoring
   them with the databases. The built-in migration backup covers PostgreSQL/Mongo
   only. Deleting kind/resetting Docker Desktop may remove every local PVC.
5. Cloud: rehearse cutover on a disposable matching VM, verify database/file/Redis
   restore, keep an encrypted off-VM backup and review existing source writers.
   This remains an existing-Compose single-VM cutover, not a clean-VM installer.
6. Cloud: verify network-policy enforcement from another namespace, existing
   reverse proxy/TLS and external firewall behavior. Old Compose DB/admin port
   definitions must not accidentally become reachable if old containers restart.
7. Both: test real image builds and application flows: registration/login, email,
   products/orders, private upload/download authorization and WebSocket chat.
   Review dependency vulnerabilities, backup retention, disk capacity and recovery.

Both are single-machine installations with planned update downtime, no HA and no
VM autoscaling. See each deployment README for operator prerequisites/recovery.
