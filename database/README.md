# Database references

Runtime authority is each service's `backend/services/<service>/prisma/schema.prisma` and its migration helper/history. `auth-service.prisma`, `order-service.prisma`, and `product-service.prisma` here are reference copies, not migration or client-generation entrypoints. Their generator paths are relative to the original runtime schema: **do not run generate/migrate against these copies**.

- Approved ER inputs and explicit amendments: `erdesign/`, especially ข้อ 1.
- Decisions and authorization: [agreement records](../log/loger/README.md). Implementation, measured verification and remaining exceptions: [evidence](../log/evidence/README.md).
- [`schema.md`](schema.md) is explicitly the historical 2026-09-09 snapshot. Its old table/model counts are not a current schema manifest or live database introspection.
- `scripts/generate_customer_service_current_er_drawio.js` is the older four-table Support layout generator; its schema guard intentionally rejects the current thirteen-model schema. Do not bypass that guard or use its old output as current ER. The approved current source is `erdesign/Customer Service/ข้อ 1/customer-service-คน-er.drawio` with `approved-amendments.md`. A PDF export was not regenerated.

The user approved moving preserved Auth `legacy_*` tables to `legacy_archive`. Migration `20261014010000_archive_legacy_auth_tables` relocates the same table objects without discarding their data, constraints, indexes or sequences. Do not drop that schema as cleanup. Product `reviews.product_id` is an explicitly approved logical reference that survives product deletion. No real database was changed; final implementation and rehearsal evidence are in the work map linked above.
