# Production deployment — 28 October 2026

Result: successful deployment of main commit `75e91915179192bc77c2c205463f2937b4359803` to re-loop through the existing Web SSH terminal.

- All seven application images use `run-20261027t233504z-1154494`, including Product.
- Deployment script completed with `EXIT_CODE=0` and `Deploy OK`.
- All ten Kubernetes deployments were Ready 1/1 after rollout.
- Auth migration `20261028100000_grant_seller_after_kyc_approval` and Support migration `20261028120000_ticket_return_to_cs` applied successfully; subsequent schema status checks passed.
- Public frontend and product feed returned HTTP 200. Chat polling returned an Engine.IO handshake with a session ID. This does not verify WebSocket upgrade or full application workflows.
- Final free disk: approximately 16 GB (67% used).

Docker held 12.85 GB of non-reclaimable build cache with no build processes running. Restarting Docker made it reclaimable; scoped builder pruning then released it. The tunnel restarted successfully. Earlier failed builds' Docker application images were removed; database volumes, backups and active Kubernetes images were retained.

Server evidence and backups: `/var/lib/reloop-deploy-k8s/run-20261027T233504Z-1154494/`.
Server deployment log: `/var/log/reloop-deploy-clean-20261028.log`.

No application source changes were made for this deployment.
