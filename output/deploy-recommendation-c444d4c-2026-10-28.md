# Recommendation deployment — 28 October 2026

Deployed commit `c444d4c49e15d5479d3af96f22c1747a6d557629` from `origin/main` to https://re-loop.cskmitl.com.

## Delivered

- Default recommendation weights: search 3, product views 5, video views 5.
- All nine criterion weights configurable through the product-service environment.
- Timestamped, per-account product/video view history in `recommendation_views`.
- Removed recommendation captions below cards on the homepage and product catalog.
- The proposed table for already-calculated user/product scores remains deferred; no such table was added.

## Deployment and recovery

Pushed main and verified GitHub, workstation and server HEAD all matched the commit above.
Used the existing Web SSH terminal on https://init-d.cskmitl.com/status.

Two attempts stopped during build/import on the existing disk-space guards, before maintenance or workload scale-down. Cleared unused Docker build cache with the user's authorization. Docker reported 9.614 GB for the first cleanup and 7.441 GB for the second; these are Docker's reported cache totals, not independently measured filesystem deltas. No database volumes, uploaded files or backups were deleted manually.

The second attempt had completed all seven application builds and imported Auth before stopping. After space was reclaimed, a private server recovery wrapper reused that exact completed image set (`run-20261028t002928z-1217242`). It verified a clean server checkout and that server HEAD and origin/main matched the pinned commit, held both existing deployment locks, and reused the existing deployment implementation for preflight, import guards, all seven runtime image checks, backup, migration, rollout and health verification. It replaced only the build step with importing the six remaining completed images. Repository deployment scripts were not modified.

The deployment completed with `Deploy OK (Kubernetes)` and journal status `ready`.
All seven application images use `run-20261028t002928z-1217242`; database image versions were preserved.
Product migration `20261028000000_recommendation_views` applied successfully.
All ten deployments were Ready 1/1 after rollout.

## Checks

- Public frontend: HTTP 200.
- Public recommendations endpoint: HTTP 200, JSON contained two requested items.
- Public product feed: HTTP 200.
- Product runtime rules: category 4, style 3, brand 2, size 5, search 3, productView 5, videoView 5, like 8, purchase 10.
- Final free disk: approximately 13 GB (73% used).
- Earlier implementation checks: 30 backend tests including real PostgreSQL ranking, one additional custom-env PostgreSQL ranking scenario, 51 view-consumer frontend tests, 12 homepage/catalog frontend tests, scoped ESLint and diff checks passed. No application source changed after those checks except the separately tested caption removal.

These production checks verify deployment health, public reads and runtime weights. They do not establish every authenticated purchase, upload, chat or recommendation-history flow on production.

## Server evidence

- Successful run, backups and run log: `/var/lib/reloop-deploy-k8s/run-20261028T004423Z-1233356/`
- Deployment output: `/var/log/reloop-rec-c444d4c-import.log`
- Private recovery wrapper: `/var/lib/reloop-deploy-k8s/recover-c444d4c.py`
- Earlier attempt logs: `/var/log/reloop-rec-c444d4c.log`, `/var/log/reloop-rec-c444d4c-retry.log`
- Cache cleanup logs: `/var/log/reloop-cache-clean-c444d4c.log`, `/var/log/reloop-cache-clean-c444d4c-final.log`

The prior untracked `output/deploy-latest-2026-10-28.md` was left unchanged and excluded from the application commit.
