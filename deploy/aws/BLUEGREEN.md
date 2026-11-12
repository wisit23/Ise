# Staging backend Blue/Green

This manages all six backend services in account `997229934811`, Sydney,
namespace `reloop-staging`. It preserves the existing internal ALB and CloudFront
VPC origin. The existing resource names are Blue; Green uses `-green` names.
Each slot has its own internal service URLs, HPA (2–3 pods, CPU 70%) and PDBs.
Both slots share the staging databases, Redis, runtime Secret and media bucket.

Prepare leaves the candidate at ALB weight 0, with business workers disabled.
Promote and rollback stop both slots' business workers, wait for old worker pods
to terminate, verify the target, switch ALB weights, verify public HTTPS, and
enable only the target slot's workers. HTTP replicas remain available during
worker restarts. There is a period without business workers. Jobs are not
guaranteed exactly once; the existing within-slot replicas still require their
normal job locking/idempotency. There are no migrations, seeds or database restores.

Per-target sticky sessions remain enabled for Socket.IO polling. The forwarding
action enables target-group stickiness for **1 second**, as required by ALB when
multiple target groups contain sticky targets. Existing group cookies can retain
old routing briefly; established WebSocket connections may remain on the old
slot until disconnect/reconnect. No instantaneous switch or zero downtime claim.
Public checks reuse an HTTPS cookie jar across the switch and wait for the
expected slot/release. Test login, chat reconnect and writes separately before
calling a release accepted.

Keeping two slots increases compute and database connections. The existing
NodePool cap (8 CPU / 32 GiB) is unchanged. A capacity failure stops rollout;
this workflow does not increase limits or install another controller.

## First use

1. Publish this code to `fullcloudstaging` and run **AWS stage backend (build
   images)** from that branch. Keep its successful run ID. The release artifact
   must contain capability `background-workers-toggle-v1`. Older images cannot
   safely serve as standby.
2. Run **AWS EKS staging** with `operation=rolling`, that new `source_run_id`,
   `deploy=true`, `compatible=true`. This one-time rollout equips the existing
   Blue stack with worker control and slot/release identity. Confirm the public
   `/health` includes `deploymentSlot: blue` and the new release.
3. In the administrator CloudShell, use the updated checkout and apply only the
   updated namespace Role. Do not run these administrator commands with the
   GitHub deployment user's credentials:

   ```bash
   cd "$HOME/reloop-eks-setup"
   git pull --ff-only origin fullcloudstaging
   aws eks update-kubeconfig --region ap-southeast-2 --name reloop-staging
   set -o pipefail
   python3 -c 'import sys,json; sys.path.insert(0,"deploy/aws"); import eks; print(json.dumps(next(r for r in eks.platform() if r["kind"] == "Role")))' \
     | kubectl apply --server-side --field-manager=reloop-eks-admin -f -
   aws iam put-user-policy \
     --user-name reloop-github-deploy \
     --policy-name reloop-staging-bluegreen-read \
     --policy-document file://deploy/aws/bluegreen-read-policy.json \
     --no-cli-pager
   ```

   If the checkout is absent, clone branch `fullcloudstaging` first. This policy
   grants four ALB **read** APIs; those describe APIs require `Resource: "*"`.
   Routing changes go through the EKS Ingress controller, not IAM ALB write APIs.
   The Role adds pod reads, service proxy reads and Auto Mode TargetGroupBinding
   reads. It does not grant reading runtime Secret values.

4. Confirm GitHub environment `aws-staging` variable `AWS_EKS_API_ORIGIN` equals
   `https://dgg3sdpmiduke.cloudfront.net`. Keep frontend origin and public config
   consistent with the current release. Review schema compatibility and backups.
5. Run **AWS EKS staging**, `operation=bootstrap`, the **same** new source build
   ID as step 2, `deploy=true`, `compatible=true`. Bootstrap adopts Blue without
   replacing its immutable Deployment selectors. It validates current images,
   running readiness/worker identity, existing Ingress, ALB and healthy targets.
6. Run `operation=status`. Other inputs are unused. Copy the exact release
   strings in the output, never guess from a source commit or image tag.

## Release and rollback

Every operation uses branch `fullcloudstaging` and environment `aws-staging`.
Build a new trusted source release before preparing the inactive slot. For an
initial routing rehearsal, the same worker-capable build can fill both slots;
slot identity distinguishes them, but this does not test code compatibility
between two different versions.

| Operation | Inputs in addition to operation |
| --- | --- |
| `status` | None; reads state without acquiring a lock |
| `prepare` | `slot` = inactive slot, successful new `source_run_id`, `expected_active_release` copied from status, `deploy=true`, `compatible=true` |
| `promote` | `slot` = prepared candidate, `expected_active_release`, `expected_target_release` copied from status, `deploy=true`, `compatible=true` |
| `rollback` | `slot` = previous ready slot, **current recorded** `expected_active_release`, that slot's `expected_target_release`, `deploy=true`, `compatible=true` |

Prepare is complete only after every service is ready, the gateway feed responds,
the candidate ALB targets are healthy, active weight is 100, candidate weight is
0, and the public endpoint still returns the active release. Promote verifies
both actual ALB forwarding and the public release before committing active state.
For later releases, alternate the inactive slot. Once bootstrapped, the rolling
operation refuses to overwrite the managed deployment.

Observe from CloudShell:

```bash
kubectl get deployment,pods,hpa -n reloop-staging -L reloop/slot
kubectl get configmap reloop-bluegreen -n reloop-staging -o jsonpath='{.data.state}'
curl --fail --silent --show-error https://dgg3sdpmiduke.cloudfront.net/health
```

In EC2 → Load Balancers → the existing ALB → Listeners and rules, the root path
rule should contain two target groups with weights 100/0 (or 0/100). Target group
health must match the current gateway pod IPs. Check CloudWatch request/error
rates and perform an actual frontend login/chat/write smoke test after promotion
and again after rollback. Local automated tests do not establish these live results.

## Failure recovery

The workflow and build share concurrency group `aws-backend-staging` and never
cancel an in-progress operation automatically. A resourceVersion-protected
ConfigMap lock also rejects concurrent local operators and stale expected releases.

Failed operations record `phase=failed` and stop. They do **not** silently undo
an uncertain partial rollout. `active` means the last fully committed slot;
`target` records an interrupted switch and traffic may already point there.
Inspect workflow logs, state, ALB weights and the public health response. Run
explicit `rollback` to the last recorded ready slot, with the exact expected
releases. Recovery disables both versions' workers before enabling the target.
A partially prepared, unready candidate is excluded from the recovery route.
If old worker pods cannot terminate, recovery stops rather than running two
versions' business workers. Resolve that cause before retrying.

If CI was killed and left a lock, cancel/finish the owning operation first.
Only then, from the administrator checkout:

```bash
python3 deploy/aws/bluegreen_rollout.py status
python3 deploy/aws/bluegreen_rollout.py unlock --expected-lock '<exact token from status>'
```

Unlock marks the operation failed; it does not promote or repair resources.
If bootstrap failed, roll back to its recorded Blue release. Bootstrap is not
rerun over existing state. Do not delete the state to bypass recovery or use
direct ALB console edits that the controller will reconcile away.

## Local checks and references

```bash
python3 -B -m unittest discover -s deploy/aws -p 'test_*.py' -v
node --test backend/shared/src/backgroundWorkers.test.js backend/shared/src/backgroundWorkerEntrypoints.test.js backend/shared/src/serviceRuntime.test.js backend/shared/src/serviceRuntime.signals.test.js backend/gateway/src/awsDeployment.test.js
```

The Python consumer fixture exercises resource generation, service identities,
worker handoff, prepare/promote/rollback, unhealthy targets and stale state. It
does not replace server dry-run or live EKS Auto Mode reconciliation. Each live
apply/Ingress patch first performs server dry-run.

- [EKS Auto Mode ALB configuration](https://docs.aws.amazon.com/eks/latest/userguide/auto-configure-alb.html)
- [ALB weighted forwarding and sticky-session requirements](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/rule-action-types.html)
- [Controller action annotations](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/ingress/annotations/)
