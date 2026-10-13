# Local Docker rebuild and startup — 2026-10-13

- User requested rebuilding Docker and running local.
- `docker compose build`: all 7 application images rebuilt successfully.
- Existing configured `reloop_auth/product/order/support` databases were legacy schemas without migration history. They were inspected read-only and retained.
- Ran the existing `scripts/prepare-local-dataset.cjs` with `LOCAL_DATASET_LABEL=20261013_erlocal`: preserving migrations installed on four new PostgreSQL databases, Auth/Product reference/demo seeds installed, Support reference data installed, and indexes provisioned on the new Mongo demo database.
- The existing script saved the prior environment as `.env.pre-dataset-20261013_erlocal.local` and switched `.env` to the new local dataset. No old database or volume was deleted.
- `docker compose up -d --wait --wait-timeout 120`: completed successfully. Five backend services, gateway, Postgres, Mongo and Redis report healthy. Frontend and pgAdmin are running; mongo-init completed as designed.
- Frontend: http://localhost:3005/ ; Gateway: http://localhost:8080/ ; pgAdmin: http://localhost:5050/
- HTTP checks: frontend / 200, gateway /health 200, product feed 200; buyer.demo@example.com login and authenticated /api/auth/me both 200.
- Browser verified the rendered homepage and /products with populated categories/cards/pagination through Chrome. T3 preview navigation worked but snapshots timed out twice, so the documented browser fallback was used.
- Runtime remains the repository Dockerfiles' Node 22. Images built and local smoke checks passed; prior deeper ER tests used Node24. No Dockerfile/code edits were required for this startup.
- Build/start logs: local-docker-build.txt, local-docker-infra.txt, local-docker-dataset.txt, local-docker-start.txt. Detailed preparation logs live in tmp/local-dataset-20261013_erlocal.
- Local containers are intentionally left running for the user. This does not migrate or deploy production.

Applied: nes-mode Harness/Senior Mentor/Wayfinder, Runtime Forensics; computer-use/browser runtime for fallback UI verification.
