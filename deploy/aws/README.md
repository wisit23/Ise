# AWS backend staging (Node 22)

**Current choice: [direct EKS Auto Mode staging](EKS.md), with CloudFront HTTPS
and a private ALB.** Follow that guide for new setup. The Beanstalk instructions
below are retained for the earlier deployment path; `application.zip` is not an
EKS deployment package. The build workflow now only builds images and the legacy
Beanstalk promotion workflow is disabled unless explicitly opted in with
`AWS_LEGACY_BEANSTALK_ENABLED=true`.

This is an opt-in deployment path for **Elastic Beanstalk Standard, Docker Compose,
Application Load Balancer and private ECR**. Frontend hosting is separate on Amplify.
The existing [single-node VM deployment](../production-cloud/README.md) and its
GitHub workflows remain available. Adding these files does not deploy anything.

The current project account uses **Sydney (`ap-southeast-2`)**. New AWS Project
accounts restrict Region selection; do not upgrade or activate advanced features
just to copy the Singapore examples in an earlier planning document.

## What is included

- `bundle.py`: requires six immutable ECR image digests from one full Git commit;
  produces `application.zip` and `release.json` without reading a local `.env`.
- The generated Compose application runs gateway plus five services. It contains
  no database/Redis/frontend containers, media volumes, seeds or startup migrations.
  Only gateway publishes `80:8080`; all services have `/ready` health checks and a
  45-second stop grace period around the existing 30-second shutdown deadline.
- Backend files use the existing S3 driver and participant/owner access checks.
  Bucket access stays private. Upload/conversion scratch space is still needed.
- Gateway API mode returns JSON 404 for unmatched requests instead of forwarding
  them to an absent frontend. `/ready` probes all five internal service endpoints;
  `/health` identifies the unique deployment version label through `RELEASE_ID`,
  including repeated builds of the same commit.
- A shared CORS configuration supports exact frontend origins and credentialed
  Socket.IO polling. With no new variables, the legacy VM behavior is preserved.
- ECR login hooks run on application and configuration deployments using the
  instance role. The platform must provide AWS CLI and Docker.
- `rollout.py` deploys only the inactive environment, checks its release identity,
  records promotion state and refuses stale promotion/rollback requests.

## Prerequisites (owner 2)

1. Review credit balance and service quotas. Free-plan access is not unlimited free
   operation. ALB, instances, NAT, logs and data transfer consume credits.
2. Create private ECR repositories `reloop/gateway`, `reloop/auth-service`,
   `reloop/product-service`, `reloop/order-service`, `reloop/chat-service`,
   `reloop/support-service`. Use immutable tags; retain the previous release.
3. Create a private S3 **application-bundle bucket**, separate from media. Configure
   its retention without deleting versions still used by either environment.
4. Prepare a VPC with ALB subnets across two AZs. Permit traffic only ALB -> instance
   TCP 80; keep internal containers and databases off public inbound ports. Private
   instances need outbound paths to AWS APIs and data providers (NAT/endpoints).
5. Prepare the Beanstalk service role and EC2 instance profile. The instance role
   needs ECR pull, platform logging, and scoped access to media/secrets. Use IMDSv2;
   verify SDK credentials work inside containers (Docker networking may require a
   metadata response hop limit of 2). Do not embed access keys in images or Compose.
6. Prepare reachable PostgreSQL databases for auth/product/order/support, a MongoDB
   replica set compatible with the chat Prisma connector, and a shared Redis service
   compatible with existing ioredis/BullMQ clients. Keep TLS and certificate checks.
   An internal university VM IP is not directly reachable from AWS: establish a
   reviewed private connection or migrate data first. This package does neither.
7. Inventory, back up off-VM and rehearse restoring existing data/media before
   cutover. Never copy a live PostgreSQL/Mongo data directory to another engine
   version. Review existing migration runners separately; do not auto-seed cloud DBs.
8. Audit shared workers/schedulers for simultaneous Blue+Green execution. The
   `compatible` confirmation covers both schema compatibility and concurrent side
   effects. This code does not establish those guarantees or perform migrations.

For media, grant `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the chosen prefix
and scoped `s3:ListBucket` on the bucket; add KMS permissions if using your own key.
Existing files must be copied to the correct storage namespaces before changing
the driver. Keep private KYC/chat/dispute authorization checks in the API.

## Beanstalk properties (both environments)

Use a current Docker Compose platform. Enter these as plain non-secret properties:

```text
AWS_REGION=ap-southeast-2
ECR_REGISTRY=<account-id>.dkr.ecr.ap-southeast-2.amazonaws.com
S3_BUCKET=<private-media-bucket>
S3_KEY_PREFIX=reloop-staging
FRONTEND_ORIGINS=https://<frontend-domain>
APP_BASE_URL=https://<frontend-domain>
MAIL_TRANSPORT=smtp
MAIL_FROM=<verified-sender>
SMTP_HOST=<smtp-endpoint>
SMTP_PORT=587
SMTP_SECURE=false
```

`FRONTEND_ORIGINS` may be a comma-separated list of exact origins (no trailing
slashes or paths). Configure the production frontend and necessary staging origins;
CORS is a browser access rule, not a replacement for JWT/record authorization.

Use Beanstalk environment properties sourced from Secrets Manager/Parameter Store
for `DATABASE_URL_AUTH`, `DATABASE_URL_PRODUCT`, `DATABASE_URL_ORDER`,
`DATABASE_URL_SUPPORT`, `DATABASE_URL_CHAT`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_TOKEN`, and SMTP credentials when required.
Each secret must resolve to the actual scalar value, not an unparsed JSON object.
Configure the corresponding role permissions. Leave AWS access key variables unset.
Both environments must use compatible JWT/internal secrets while serving shared data.

Optional variables: `SMTP_USER`, `SMTP_PASS`, `EMAIL_VERIFICATION` (defaults required),
`TRUST_PROXY` and any existing per-feature knobs needed by the deployment. Add such
feature overrides to `compose()` deliberately, then test them; the generated bundle
does not pass every secret/property to every container. Secret rotation requires
platform refresh/redeployment; it is not a live per-request Secrets Manager lookup.

The bundle fixes `MEDIA_STORAGE_DRIVER=s3`, release identity, internal service URLs
and gateway AWS mode. It configures ALB `/ready`, affinity cookies (300 seconds),
45-second deregistration and seven-day platform log retention. It intentionally
does **not** create VPCs, instances, databases, HTTPS listeners or scaling policies.
Docker Compose enhanced health needs access logs in AWS's supported format; the
bundle provides platform log streaming, not an application access-log dashboard.

## GitHub setup (access-key authentication)

The current delivery path is `fullcloudstaging` -> backend staging. Test that API
with the Amplify staging frontend before promoting application code to
`fullcloudmain`. Production deployment is not wired yet: it will need separate
GitHub environment configuration, Beanstalk environments, secrets/data and a
reviewed production release path. The legacy Beanstalk workflow rejects
`fullcloudmain`. The EKS workflows (`aws-release.yml`, `aws-eks-staging.yml`)
deploy `fullcloudmain` through GitHub environment `aws-production`; see
BLUEGREEN.md.

Blue/Green here means two Beanstalk environments **inside staging**. The legacy
variable names `AWS_EB_PRODUCTION_CNAME` / `AWS_EB_PRODUCTION_URL` mean the stable
public endpoint of that staging pair, not the actual production API. Do not put
production resources or production data into `aws-staging`.

Create the GitHub environment `aws-staging` and restrict it to
`fullcloudstaging`. Both AWS workflows currently target staging only.
Enable required reviewers where the repository plan supports that feature. Both workflows are `workflow_dispatch` only and share
one deployment concurrency group. Neither replaces existing CI, GHCR or VM workflows.

GitHub requires a `workflow_dispatch` workflow to exist on the repository's default
branch before it can be dispatched. If the default branch is still `main` without
these files, first merge the reviewed workflow definitions there, keeping the
`fullcloudstaging` execution guards, then select `fullcloudstaging` when running them.
Do not change the default branch or merge the full application just to expose a button.

Use a dedicated IAM user such as `reloop-github-deploy`. Store its credentials in
GitHub Settings > Secrets and variables > Actions as repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Never commit credentials or use a root access key. These workflows use the secrets
directly; they do not require an OIDC provider or `AWS_DEPLOY_ROLE_ARN`. Protect
workflow changes and restrict repository write access: a modified workflow can
access repository secrets. Rotate/revoke the key when required. Prefer temporary
credentials through OIDC when that becomes available for the account.

For the first bootstrap run, grant only ECR push/pull permissions on the six
`reloop/` repositories plus `ecr:GetAuthorizationToken` on resource `*`.
Leave `deploy_inactive=false` and `compatible=false`. Only `AWS_REGION`,
`AWS_ACCOUNT_ID` and the two secrets are required for this build-only run. It
pushes images and saves the bundle in GitHub artifacts; it does not upload to S3
or change Beanstalk. The ECR-only policy cannot deploy or promote.

Before enabling deployment, add narrowly scoped bundle `PutObject` permission on
the artifact prefix and Beanstalk describe/create-application-version/
update-environment/swap-environment-cnames for the intended application and
pair of environments. Some describe operations require resource `*`; scope other
actions by ARN. Do not grant AdministratorAccess as an image-push workaround.

Set `AWS_REGION` and `AWS_ACCOUNT_ID` as **repository variables**; the workflow-wide
settings are read before jobs run. Put the remaining Beanstalk/bucket variables in
the **aws-staging environment** and point them only at staging resources:

| Variable                  | Value                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `AWS_REGION`              | `ap-southeast-2`                                                 |
| `AWS_ACCOUNT_ID`          | 12-digit project account ID                                      |
| `AWS_BUNDLE_BUCKET`       | private application-bundle bucket                                |
| `AWS_EB_APPLICATION`      | Beanstalk application name, e.g. `reloop`                        |
| `AWS_EB_BLUE`             | first environment name                                           |
| `AWS_EB_GREEN`            | second environment name                                          |
| `AWS_EB_PRODUCTION_CNAME` | stable Beanstalk CNAME initially assigned to Blue; hostname only |
| `AWS_EB_PRODUCTION_URL`   | public API HTTPS origin                                          |
| `AWS_EB_BLUE_URL`         | HTTPS test origin permanently pinned to Blue's ALB               |
| `AWS_EB_GREEN_URL`        | HTTPS test origin permanently pinned to Green's ALB              |

**DNS matters:** production's custom hostname must follow the stable Beanstalk CNAME
that the swap moves. A production alias pinned to Blue's ALB bypasses CNAME swaps.
Test hostnames must instead stay pinned to each actual ALB; do not point them at
swapped Beanstalk CNAMEs. Each ALB needs a valid ACM certificate/listener for its test
hostname **and** the production hostname. Never disable certificate validation to
pass smoke tests. Provision listeners/redirects and confirm DNS before staging.

## First deployment / bootstrap

1. Land reviewed code on `fullcloudstaging` and run **AWS stage backend** with
   `deploy_inactive=false`. It runs checks, builds six Node 22 images in ECR and
   uploads `aws-release/application.zip` plus `release.json` as a GitHub artifact.
   No Beanstalk mutation occurs in this mode, but ECR storage/build usage is real.
2. Download `application.zip`. Create a Beanstalk application and a **Standard
   Docker Compose, Load balanced, Application Load Balancer** environment for Blue.
   Supply its roles, network and all properties above before deploying this bundle.
   Do not choose ECS-on-Docker/Dockerrun or a single-instance environment by mistake.
3. Set HTTPS/DNS; verify `/ready`, `/health` (deployment identity), product feed, real
   login/upload/private-media/chat and SMTP on dedicated staging data. The health
   release identity is the Beanstalk version label, not just its commit SHA.
4. Clone/create Green using the same reviewed properties and compatible data
   services. Verify both are Ready/Green and finish their test-hostname DNS/certs.
   Review worker effects before running two versions against one dataset.
5. Set all GitHub environment variables above. Start with capacity sufficient for
   tests; enable at least two instances across AZs only after measuring memory and
   database connection limits. Set a credit-aware maximum and scaling policies.

## Subsequent staging Blue/Green releases and rollback

1. Run **AWS stage backend** on `fullcloudstaging` with `deploy_inactive=true` and `compatible=true`
   only after reviewing migrations, workers and backups. The script identifies the
   inactive environment from the actual production CNAME, deploys a unique version,
   checks Beanstalk health and verifies `/ready`, `/health` identity and product feed
   through that environment's HTTPS test hostname. It does not switch production.
2. Run **AWS promote or rollback staging backend**, `mode=promote`, using the successful
   staging **run ID**. Confirm compatibility. Provenance and the exact active/candidate
   versions are checked again. The script records state before requesting a swap.
3. Public smoke checks retry for DNS convergence. A confirmed swapped release that
   fails checks is reversed to the previous environment when state is unambiguous;
   the workflow still fails and records `rolled_back`. An ambiguous state requires
   inspection instead of another blind swap. Inspect both DNS and actual traffic.
4. For a later explicit rollback, select `mode=rollback` and the successful promotion
   **run ID**, not the staging run ID. The `aws-promotion/promotion.json` artifact record must
   still match both environment versions. Stale/overwritten rollback targets fail.
5. Keep both environments/images and data schema compatible until DNS, sockets and
   traffic drain. Never terminate the old environment immediately after a swap.
   Application rollback does not undo database writes or migrations. DNS switching
   does not preserve existing WebSocket connections; test reconnect and history.

If a workflow fails during an API call or artifact upload, inspect its run, saved
record, actual Beanstalk versions/CNAMEs and public release before taking action.
Do not assume failure means nothing changed. No helper creates/deletes environments,
restores databases, runs seeds, edits DNS, or removes old releases automatically.

## Frontend handoff (owner 1)

Amplify must build from the monorepo root using Node 22 and root lockfile, with app
root `frontend` and output `frontend/.next` relative to root build path. Set:

```text
NEXT_PUBLIC_API_URL=https://<api-domain>
NEXT_PUBLIC_SOCKET_CREDENTIALS=true
```

Rebuild after changes: these values are embedded in the browser bundle. The second
setting permits ALB cross-origin affinity cookies for Socket.IO polling, and needs
the exact credentialed CORS configuration above. Test browsers' cookie policies;
prefer app/API subdomains on the same site and validate polling as well as WebSocket.
Defaults keep legacy/local behavior; do not enable the flag against wildcard CORS.

## Verification

```bash
node --test backend/gateway/src/awsDeployment.test.js backend/shared/src/corsOptions.test.js
python3 -B -m unittest discover -s deploy/aws -p 'test_*.py' -v
```

Local tests use HTTP stand-ins and a simulated AWS API. They prove bundle contents,
readiness/routing and rollout guards, not actual AWS permissions, DNS, HA or zero
downtime. Before claiming readiness, run two-instance polling/WebSocket, private
media, queue/scheduler, database connection/backup, scale and rollback acceptance
tests on AWS and collect public request failures/latency across the rollout.

Local verification on 2026-11-11 used Node 22.23.4: gateway/CORS tests, S3/runtime
tests, the production-local build contract, existing VM deployment helper tests,
and the new AWS helper tests passed. All six amd64 backend images built and loaded
their shared/S3 modules on Node 22; the Next.js production build passed. Compose,
hook syntax, actionlint and changed-file lint/format checks were also validated.
The existing release audit passed under its documented Sharp CPU-compatibility
exception; this change neither adds exceptions nor resolves those findings.

## References

- [Beanstalk Compose environment configuration](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_docker.container.console.html)
- [Platform hooks](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/platforms-linux-extend.hooks.html)
- [Secret-backed environment properties](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/AWSHowTo.secrets.env-vars.html)
- [Blue/Green DNS caveats](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.CNAMESwap.html)
- [AWS credentials action](https://github.com/aws-actions/configure-aws-credentials)
- [AWS Project service availability](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
