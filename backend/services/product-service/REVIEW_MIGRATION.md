# Moving existing reviews into product-service

The API keeps `/api/reviews/*` and `/review-uploads/*`. The existing Docker
`review_uploads` volume is mounted by product-service, so old media URLs keep
working without copying files.

For an existing installation, back up both databases and the uploads volume,
stop all review writers and gateway traffic, deploy the preserving Product
migration chain, and run the idempotent copy:

```sh
docker compose build product-service gateway
docker compose stop gateway
docker compose run --rm product-service node prisma/migrate.js
docker compose run --rm product-service node migrateReviewsFromReviewDb.js
docker compose up -d --remove-orphans product-service gateway
```

Keep `DATABASE_URL_REVIEW` in `.env` until the copy succeeds. The migration
reads the old database and writes to `DATABASE_URL_PRODUCT`; it leaves the old
database untouched. It aborts if a destination order already has a conflicting
review. Run it again safely after an interruption. Confirm the reported count
matches the old review count before retiring the old database. The old Compose
container can be removed after the cutover; the `review_uploads` volume must
remain because product-service now mounts it.

If the Product migration helper refuses an unreviewed legacy database, stop and
prepare a reviewed preserving mapping. Do not bypass it with `db push`, reset,
or a migration baseline. These are deployment instructions; no real database
was migrated during the ER rehearsal.

The old Review DB keeps its original tables (`reviews`, `review_photos`,
`review_videos`). The script reads them with raw SQL and writes each photo and
video into the unified `review_media` table with the ids `image:<old id>` and
`video:<old id>`, the same ids the Product migration
`20261014000000_approved_er_review_media` gives to rows it converts. A rerun
treats an order as already present only when all review values and the media
IDs, types, URLs, positions and timestamps match; otherwise it aborts.
