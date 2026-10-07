# Moving existing reviews into product-service

The API keeps `/api/reviews/*` and `/review-uploads/*`. The existing Docker
`review_uploads` volume is mounted by product-service, so old media URLs keep
working without copying files.

For an existing installation, back up Postgres, then stop gateway traffic,
push the updated product schema, and run the idempotent copy:

```sh
docker compose build product-service gateway
docker compose stop gateway
docker compose run --rm product-service npx prisma db push --skip-generate
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
