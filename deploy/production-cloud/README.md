# Production Kubernetes on the existing Cloud VM

Entry point: **`bash deploy/production-cloud/deploy-k8s.sh`**, from the repository root.
The `.sh` entry point calls the Python helpers beside it; transfer the entire
`deploy/production-cloud/` directory with the application checkout, not just the shell file.
This is separate from the Compose-only `deploy.sh`. It installs a single-node K3s
server if missing, builds the current checkout's production images with Docker
Compose, imports them into K3s containerd, and deploys using `k3s kubectl` with the
explicit **local** `/etc/rancher/k3s/k3s.yaml`. It never uses your current kubectl
context and does not install Docker/Python automatically. Normal and fresh deploys
first update a clean `main` from `origin/main` using fetch and fast-forward only.
`--resume-fresh` keeps the original checkout unchanged.

This implementation is for **the existing re-loop VM**, not managed Kubernetes,
a second server, multi-node Kubernetes or HA. The default preserves/imports existing
data; the explicit fresh TEST mode below also supports an empty installation. A single
VM and its local disks remain single points of failure. Copy backups off the VM
before a real cutover; local backup files do not protect against VM/disk loss.

## Root `.env` is the deployment configuration

Both production entry points default to **the repository-root `.env`**.
`.env.example` is a template, not a production configuration; do not deploy its
example credentials or overwrite an existing server `.env`. The cloud script
already passes `--env-file <root>/.env` explicitly to Compose, from any working
directory. It does not require `deploy/secrets.example.env` or a second secrets file.
Using the same configuration format does **not** share or synchronize local/cloud data.
Use each machine's own `.env` and keep it out of Git/chat.

Before build/cutover, the resolved configuration is now checked for:
- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
  `INTERNAL_SERVICE_TOKEN`: at least 32 characters, not example/dev values;
  access/refresh/internal tokens must be distinct, and application/database
  PostgreSQL password settings must agree.
- `APP_BASE_URL`, `NEXT_PUBLIC_API_URL`, `MAIL_FROM` and `MAIL_TRANSPORT` must be set.
  Non-loopback URLs require HTTPS and SMTP rather than logging account links.
  SMTP requires `SMTP_HOST`; authentication settings must be supplied as a pair
  (`SMTP_USER`/`SMTP_PASS`) if used. `SMTP_PORT` defaults to 587.
- Frontend `NEXT_PUBLIC_API_URL` build argument must match runtime configuration.
  Public settings are embedded during build: changing `.env` requires rebuilding.

The current code has secret length/distinctness checks commented out by prior request;
the secret-policy bullets above describe those checks when enabled. URL, mail,
database consistency and frontend build configuration checks remain active.
Validation errors name the setting, not its secret value. No credentials are
created/rotated automatically. For an existing database with a weak password,
rotate the database role password and update the matching URLs/configuration in a
reviewed maintenance operation **before** using this deployment; merely changing
`.env` does not change a password stored in PostgreSQL. Token rotation also affects
existing login sessions. Offline tests do not validate actual SMTP/TLS access.

## Before running on re-loop

1. Commit/push the deploy entry point and helpers to `origin/main`, then transfer
   that revision to the server once. The running script must already contain the
   auto-update feature; older copies do not gain it until updated. Subsequent runs
   fetch and fast-forward `main` automatically. Review the remote revision before
   invoking a deployment. Git authentication must work for the root account used
   by `sudo`; noninteractive HTTPS prompts are disabled. `.env` stays machine-local.
   Tracked edits, staged changes and non-ignored untracked files block deployment.
   Local commits ahead of or diverging from `origin/main`, detached HEAD and other
   branches also block; the script never stashes, resets or removes local work.
   Fetch/merge failure stops before build or workload changes. Both deployment locks
   cover updating and building. After pulling a new commit, the wrapper re-executes
   its updated version with those same locks and without fetching a second time.
   Existing incomplete journals block automatic source updates so recovery inputs
   remain available. `--resume-fresh` never pulls and checks its saved input fingerprint.
2. Review pending Prisma/schema changes before choosing `--migrate`. Arrange a
   maintenance window and stop any external writers/administration jobs too.
3. Take an independently verified off-VM backup of databases and uploaded files.
4. Verify capacity: at least 2 CPUs, 8 GB RAM, 2 GB available RAM before K3s;
   4+ CPUs recommended for production builds. Initial free disk must be at least
   20 GiB, or three times mounted data size plus 10 GiB, whichever is greater.
   Real capacity depends on the dataset/build. Backups and images accumulate;
   monitor disk usage and manage retention manually after verification.
5. Requirements: Linux with systemd, root, Python **3.9+**, Docker with a Compose
   version supporting `!reset` and `config --format json`, `curl`, `flock`, `tar`,
   `du`, `ip` and `ss`. All seven application containers and the three data
   services must initially be running and healthy under this checkout's Compose
   project. The script reads the resolved existing `.env` and optional Compose
   override, then production override last. It never evaluates `.env` as shell.
   `.dockerignore` must exclude `.deploy-state` without re-inclusion rules when
   that directory exists, so old Compose backups are not sent to image builds.
6. Review Cloud security groups, host firewall and network routes. K3s uses
   `10.42.0.0/16` for pods and `10.43.0.0/16` for services by default. First
   installation rejects overlapping host routes. Ensure forwarding/pod traffic
   works on the host. The script does not change firewall/security-group rules.
   **Do not expose** API port 6443, kubelet 10250, VXLAN UDP 8472 or databases to
   the public internet. Single-node operation does not need public API access.
   Outbound HTTPS/DNS is required for installation and builds.

Google/Cloud credentials are not needed by this script. It downloads the official
K3s installer from `https://get.k3s.io` over HTTPS and executes it as root (the
installer verifies the downloaded release). Set the installer's documented
`INSTALL_K3S_VERSION` environment variable if an audited/pinned version is needed;
otherwise its default stable release is used. Existing K3s is not upgraded.
Traefik and ServiceLB are disabled **on a new install** to avoid grabbing the
existing application's ports 80/443. Installing Kubernetes changes host networking;
it must still be rehearsed on a disposable VM matching production.

```bash
sudo -i
cd /root/Ise
bash deploy/production-cloud/deploy-k8s.sh --help
# After review, capacity/network checks, off-VM backup and maintenance approval:
bash deploy/production-cloud/deploy-k8s.sh --migrate
```

No changes to a live server are made merely by adding these files to Git.

## Command choices and fresh TEST installation

```bash
# Normal update: preserve the existing Kubernetes data.
sudo bash deploy/production-cloud/deploy-k8s.sh
# Reviewed schema changes, with the existing backup/migration procedure.
sudo bash deploy/production-cloud/deploy-k8s.sh --migrate
# FIRST TEST install only: permanently remove recorded Compose test data, without backup.
sudo bash deploy/production-cloud/deploy-k8s.sh --fresh --confirm-delete-test-data
# Continue this script's incomplete fresh run after inspecting/fixing its failure.
sudo bash deploy/production-cloud/deploy-k8s.sh --resume-fresh
```

Fresh mode (`k8s-fresh.py`) is separate from the default data-preserving workflow.
Both fresh flags are required. It refuses any existing Kubernetes deployment journal,
application namespace or target data directory. It cannot reset an already deployed
Kubernetes database. On the already deployed re-loop VM, use the normal command.

Fresh mode validates the current checkout and root `.env`, checks local single-node
K3s, records a private reset plan, then stops application writers before databases.
It deletes only recorded Compose project containers and their unshared named volumes,
including the project's optional pgAdmin/mongo-init containers when present.
Bind-mounted application data layouts, unexpected containers and shared volumes block
the reset. A complete Compose stack or no project containers is supported; partial
stacks require review. `reloop-tunnel`, unrelated containers, code and `.env` are
preserved. No global image/volume/builder prune or runtime-directory wipe is performed.
Only unused, recorded application images' project/service tags can be removed.
Leftover volumes not mounted by recorded containers are not deleted.

Existing Compose database images are retained and tagged before reset. An empty
install pulls database images from the resolved Compose configuration. At least
20 GiB must remain after scoped cleanup and 2 GiB after import; insufficient capacity
stops the script instead of broadening cleanup. Fresh mode requires Git for an input
fingerprint, plus the existing Linux/root/systemd, Docker, Python and networking
prerequisites. Engine-cache builds require Docker Compose/BuildKit support for named
`additional_contexts`.

Application builds run sequentially. Prisma engine cache is copied from the built
Auth image to private state and supplied as a named context for subsequent backend
builds. Temporary Dockerfiles stay outside the checkout; repository Dockerfiles and
schema binary targets are unchanged. Images stream directly from Docker into K3s,
without an additional multi-GB `images.tar`. Normal deployments use the same build
and import helpers. Network access is still needed for uncached dependencies and
engine versions. The first Auth build can still take several minutes.

Fresh mode creates empty storage, initializes SQL databases and MongoDB `rs0` at
`mongo:27017`, runs guarded SQL migrations and Mongo schema push without
`--accept-data-loss`, then starts and checks apps. It does not seed users/products
or configure DNS, TLS, mail or reverse proxies. Check public HTTPS, WebSockets and
application flows separately after internal checks pass.

The versioned journal records the next unfinished stage, original target identities,
image tags, namespace UID, source/config fingerprint and completed jobs.
`--resume-fresh` accepts only this script's incomplete versioned fresh journal with
unchanged source/config and the same namespace. Completed destructive stages are
skipped. Partial reset/build/import and database initialization can continue without
erasing initialized Kubernetes storage. Failed migration Jobs are retained and block
automatic retries; inspect logs and reconcile migration history before deliberate
manual recovery. Interruption between namespace creation and recording its UID also
requires manual review. Historical one-off scripts and ordinary interrupted imports
or updates are not resumable by this flag. Never delete the journal/namespace to
bypass a recovery guard.

Run the selected command inside `tmux` to survive Web SSH disconnects:

```bash
sudo -i
cd /root/Ise
tmux new -s reloop-deploy
bash deploy/production-cloud/deploy-k8s.sh
# After reconnecting Web SSH: sudo tmux attach -t reloop-deploy
```

Offline checks (no Docker or cluster mutations):

```bash
python -B -m unittest discover -s deploy/production-cloud -p 'test_k8s*.py'
bash -n deploy/production-cloud/deploy-k8s.sh
```

## First run: cold-copy import, not a database version upgrade

1. Validate configuration, source containers, capacity and supported storage.
2. Install/check local K3s, build all application production images, tag and import
   unique image versions. A build failure does not stop the Compose installation.
3. Record a private incomplete journal. Disable automatic Docker restart policies
   on the imported source containers (previous policies and container IDs are
   recorded), then stop the application writers. This prevents old writers from
   resurrecting after a VM reboot beside the new installation.
4. Create supplemental PostgreSQL SQL and MongoDB archive backups, save Redis,
   then stop PostgreSQL, MongoDB and Redis for a consistent cold-copy window.
5. Archive and restore into **new** directories under
   `/var/lib/reloop-deploy-k8s/data/`. Verify database marker files and restored
   regular-file SHA-256 hashes; an empty/misplaced database archive is rejected.
   Unsafe archive paths, links, special files and setuid/setgid modes are rejected instead of extracted
   as root. Source Docker volumes and containers are never removed or overwritten.
6. Start Kubernetes databases using the **exact source database images**, including
   MongoDB 4.4 if that is what Compose was using. No implicit 4.4-to-7 Mongo upgrade.
   The existing single-member `rs0` with `mongo:27017` retains its hostname through
   the Kubernetes `mongo` Service; no new replica set is initialized over old data.
7. Check migrations and, only with `--migrate`, run the repository's guarded
   `node prisma/migrate.js` for Auth/Product/Order/Support, then Mongo Prisma
   `db push --skip-generate` **without `--accept-data-loss`**. All four SQL migration
   status checks must succeed. Application pods never run `db push` at startup.
8. Start the seven applications, wait for readiness, check production frontend mode,
   exercise the product feed through the gateway, and check frontend/gateway HTTP
   through their host ports (without environment HTTP proxies). Only then record success.

The copied paths include PostgreSQL data, MongoDB data, Redis `/data` (queues,
sessions/cache), Auth private KYC documents/report evidence, product uploads/review uploads,
order private evidence and chat private attachments. Do not flush Redis when
migrating; the application uses it for more than a disposable cache.

Production manifests are generated by `k8s-production.py` from the resolved Compose
configuration. Existing `deploy/k8s/` development manifests are left unchanged.
Production frontend uses `frontend/Dockerfile.prod` and the image's `npm run start`,
not development mode. Service environments become Kubernetes Secrets; no values
are printed. Runtime credentials and public build settings must still be correct
in `.env`/Compose before building. This script does not set up mail, DNS or TLS.

## Traffic and storage

Namespace: **`reloop-production`**. Kubernetes app/database Services are ClusterIP.
Only frontend and gateway use host ports, matching their existing Compose published
ports (`FRONTEND_PORT` and `GATEWAY_PORT` in the root `.env`). No port-forward
terminal is needed. For example, host ports 13000/18080 route to Pod ports
3000/8080; generated app environments keep internal listeners at 3000/8080,
regardless of the host-side values. Invalid/non-numeric/overlapping ports fail
before cutover. Existing journaled deployments still reject port changes until a
reviewed cutover; do not edit the journal just to bypass that guard.

`http://localhost:<FRONTEND_PORT>` and `http://localhost:<GATEWAY_PORT>/health`
refer to **the Cloud VM itself**, not your laptop. External clients use the
reviewed public HTTPS domain/proxy, with `APP_BASE_URL` and `NEXT_PUBLIC_API_URL`
set to addresses those clients can actually reach. The script checks both host
HTTP endpoints before success but does not open Cloud firewall/security groups.
Unlike kind on Docker Desktop, this K3s installation runs directly on Linux, so
no extra Docker access proxy is needed. Backend and database ports stay internal.

An existing host reverse proxy can continue to use the same upstream ports;
the script does not edit that proxy, certificates, DNS or Cloud firewall rules.
TLS must remain terminated by the reviewed existing proxy. Test the real public
HTTPS domain, WebSockets, login, upload/download permissions and mail after cutover;
internal health checks alone do not prove those paths.

Only one default `0.0.0.0` TCP published binding per frontend/gateway is supported.
Private host bindings are rejected rather than silently exposed. Do not run the
old Compose app containers after cutover: they use stale copies of the data.
Optional pgAdmin is not started, stopped or migrated by this script.

Generated workloads and migration Jobs do not mount service-account tokens.
A `data-services-ingress` NetworkPolicy restricts PostgreSQL/MongoDB/Redis ingress
to pods in `reloop-production`. **Keep the K3s network-policy controller enabled**;
check actual denied access from another namespace before opening public traffic.
This policy does not add Mongo/Redis authentication, isolate apps from each other,
or protect against a compromised host/node. Do not expose database ports publicly.
Existing Compose containers retain their old published-port definitions: after
cutover keep them stopped, and verify from outside the VM that old DB/admin ports
are not reachable. The script does not edit host firewall rules.

Data uses explicit hostPath directories on the selected **single local node**,
with `Directory` (not `DirectoryOrCreate`) so a missing path fails instead of
creating an empty replacement. Directories and backups must stay on persistent VM
disk. This is intentionally not a portable PVC/multi-node or managed-database
setup. Pods are pinned to that node, app strategies are Recreate, and downtime is
expected during deployment. Do not change the node hostname without a reviewed
storage migration. No horizontal scaling of the writers is performed.

## Subsequent updates

```bash
cd /root/Ise
# Review what is on origin/main; this command fetches and fast-forwards automatically:
bash deploy/production-cloud/deploy-k8s.sh
# Only for reviewed database/schema changes:
bash deploy/production-cloud/deploy-k8s.sh --migrate
```

Ordinary updates gate on database-file fingerprints and the real SQL migration
history **before downtime**; a same-commit pending/failed migration still blocks.
After a successful build, ordinary updates replace applications without stopping
the databases or changing schemas. `--migrate` stops writers, runs PostgreSQL
CHECKPOINT, Mongo fsync and Redis SAVE, then stops database pods and takes a cold
snapshot of all current data before the guarded migrations. Neither mode re-imports
stale Compose volumes. Mongo schema history cannot
be inferred by SQL migration checks; review Mongo changes explicitly.

Image tags are unique per run; imagePullPolicy is Never because this is one local
K3s containerd node. No registry or public push is required. No unattended database
or application rollback occurs. The default/update modes do not use `git reset`, `docker compose
down`, `down -v`, volume deletion, database seeds or destructive Prisma flags.

## Diagnostics and recovery — read before the maintenance window

Private state: **`/var/lib/reloop-deploy-k8s/`**, outside the checkout/build context.
The wrapper locks both this deployment and the existing Compose deployment state
(`DEPLOY_STATE_DIR`, or the checkout's `.deploy-state`) to prevent concurrent runs.
`journal.json` records ready/incomplete state, current image references, schema
fingerprint and current/previous successful run directories. Default migration/import runs retain:

- `run.log`, resolved `compose.json`, `.env` backup and generated manifests;
- source container IDs/images/restart policies on first import;
- unique application/database image tags in Docker/K3s (images are streamed, not archived);
- first-import logical PostgreSQL/Mongo backups;
- cold `.tar` snapshots for every data/file directory and `SHA256SUMS`.

These files contain credentials and personal data. Keep the directory root-only,
copy encrypted backups to protected off-VM storage, and do not commit it. All
Kubernetes Secrets/kubeconfig also need protected access. Failed migration Jobs
and their per-job Secrets are retained for diagnosis; successful Jobs and per-job
Secrets are deleted after their logs are captured.

```bash
k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml -n reloop-production get pods,jobs
k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml -n reloop-production logs deployment/gateway
```

The script does **not** automatically retry an incomplete import/update. Another
invocation refuses to overwrite the target or reuse a partly migrated database.
Do not just delete `journal.json` or the namespace to bypass the guard.

- **Before maintenance/journal:** build/check failure leaves source writers alone.
  Correct the failure and rerun. A newly installed K3s may remain installed.
- **After maintenance begins:** some/all apps and databases may be stopped. Inspect
  the private run log, source-container inventory, snapshots and actual pod state.
  A migration can be partial. Keep maintenance in place while choosing recovery.
- **Return to Compose during the initial cutover:** only after confirming no writes
  were accepted by Kubernetes (or deliberately reconciling those writes), scale
  Kubernetes app/database Deployments to zero and verify all their pods terminated.
  Start the recorded original database container IDs first, verify readiness, then
  start the recorded original app container IDs. Use `docker start <recorded-id>`
  rather than `compose up --build`, which could replace them with new images.
  Restore their recorded restart policies deliberately. Do not start both sets of
  writers, and do not overwrite source volumes with partly migrated target data.
- **After successful cutover or on later updates:** old Compose copies are stale.
  Never switch to them as an automatic rollback. A reviewed recovery must restore
  a matched set of data snapshots, images and configuration, or fix forward. Any
  writes after a snapshot would otherwise be lost. Keep copies of failed target
  data before any deliberate restore. Restoring a whole cold snapshot requires all
  apps/databases stopped and the matching database image versions.
- After reviewed recovery, reconcile `journal.json` with the actual recovered state
  and last successful manifest/image/schema references. This is an operator action,
  not an automatic "resume" or "force" option.

Unsupported custom configurations fail closed: external databases/Redis, Mongo auth
or custom topology/startup, custom PostgreSQL tablespaces/WAL directories/startup,
Redis AOF/custom persistence/startup, extra app mounts, custom private-storage paths,
custom app startup commands, source runtime/configuration mismatches, non-default
host bindings, multiple nodes, or an occupied production namespace without a ready
journal. Review those differences instead of disabling safeguards.

## Local checks

```bash
bash -n deploy/production-cloud/deploy-k8s.sh
bash deploy/production-cloud/deploy-k8s.sh --help
python -B -m unittest discover -s deploy/production-cloud -p 'test_k8s_production.py' -v
# Optional: local Docker only; isolated fixtures, no public ports or real .env.
# Requires already present postgres:16-alpine, mongo:4.4, redis:7-alpine images.
python -B deploy/production-cloud/test-k8s-cold-copy.py
```

Offline tests cover production generation, root-environment safety gates,
frontend build/runtime URL consistency, generated data-service NetworkPolicy and
token-mount settings, configuration/archive safety, migration
and maintenance ordering, incomplete-run protection and injected failures. The
Docker test boots and cold-copies disposable PostgreSQL/MongoDB/Redis datasets and
an upload fixture, verifies restored data, and cleans up only its own resources.
Neither test proves K3s installation, hostPort/firewall routing, real migration
compatibility, actual backup capacity, or the public domain on re-loop. Rehearse
that full path on a disposable VM with representative restored data before production.

References used for implementation:
- https://docs.k3s.io/installation/configuration
- https://docs.k3s.io/installation/requirements
- https://docs.docker.com/reference/cli/docker/container/cp/
