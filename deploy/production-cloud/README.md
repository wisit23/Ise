# Production Kubernetes on the existing Cloud VM

Entry point: **`bash deploy/production-cloud/deploy-k8s.sh [--migrate]`**, from the repository root.
This is separate from the Compose-only `deploy.sh`. It installs a single-node K3s
server if missing, builds the current checkout's production images with Docker
Compose, imports them into K3s containerd, and deploys using `k3s kubectl` with the
explicit **local** `/etc/rancher/k3s/k3s.yaml`. It never uses your current kubectl
context and never pulls Git or installs Docker/Python automatically.

This implementation is for **the existing re-loop VM**, not managed Kubernetes,
a second server, multi-node Kubernetes, HA or a new empty installation. A single
VM and its local disks remain single points of failure. Copy backups off the VM
before a real cutover; local backup files do not protect against VM/disk loss.

## Before running on re-loop

1. Commit/review the scripts and transfer that reviewed revision to the server.
   Reconcile existing local code changes; do not reset them. This script deploys
   the current checkout and does **not** fetch/update it.
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
ports. An existing host reverse proxy can continue to use the same upstream ports;
the script does not edit that proxy, certificates, DNS or Cloud firewall rules.
TLS must remain terminated by the reviewed existing proxy. Test the real public
HTTPS domain, WebSockets, login, upload/download permissions and mail after cutover;
internal health checks alone do not prove those paths.

Only one default `0.0.0.0` TCP published binding per frontend/gateway is supported.
Private host bindings are rejected rather than silently exposed. Do not run the
old Compose app containers after cutover: they use stale copies of the data.
Optional pgAdmin is not started, stopped or migrated by this script.

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
# Update/review source separately, then:
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
or application rollback occurs. The script does not use `git reset`, `docker compose
down`, `down -v`, volume deletion, database seeds or destructive Prisma flags.

## Diagnostics and recovery — read before the maintenance window

Private state: **`/var/lib/reloop-deploy-k8s/`**, outside the checkout/build context.
The wrapper locks both this deployment and the existing Compose deployment state
(`DEPLOY_STATE_DIR`, or the checkout's `.deploy-state`) to prevent concurrent runs.
`journal.json` records ready/incomplete state, current image references, schema
fingerprint and current/previous successful run directories. Each run retains:

- `run.log`, resolved `compose.json`, `.env` backup and generated manifests;
- source container IDs/images/restart policies on first import;
- uniquely tagged application/database images in `images.tar` as applicable;
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

Offline tests cover production generation, configuration/archive safety, migration
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
