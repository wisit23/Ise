# Product Service ER amendments

## Current approved operational storage amendment (2026-10-14)

The user approved the new typed operational storage design in the current thread. It supersedes the earlier log-backed state direction recorded below for the affected fields. The editable ER has a new `Approved operational storage - current amendment` page. Original diagram pages and original PDF archives are retained; their old storage notes are historical, not the current direction.

See [the complete current storage dictionary](../../../operational-storage.md) and [implementation evidence](../../../../log/evidence/operational-storage.md). New PDF exports are in `output/pdf/*-operational-storage-er.pdf`. Audit logs continue to record actions and preserve old events; operational readers use columns/dedicated tables. Shipping snapshots are a separate table keyed by shipping_id. Auth/Chat ownership and API behavior remain unchanged.



Source: `Product-Service-คน-1.drawio` (ข้อ 1). This amendment records the approved Product changes; it does not claim that unspecified physical SQL details are prescribed by the ER.

## Approved amendments

- `product_categories(product_id, category_id)` models the Product–Category M:N relation. Composite primary key `(product_id, category_id)`; both columns reference the corresponding entity IDs.
- Each Product has one Condition. The Product condition value references the unique `conditions.value`; no additional Product column is introduced.
- `Count Views` is normalized as one `(viewer_id, product_id)` row with a count, preventing duplicate viewer/product pairs.
- `review_media(media_id, review_id, media_type, url, position, created_at)` replaces separate review photo/video tables. `media_type` is `IMAGE` or `VIDEO`; URLs point to uploads, and position preserves display order.
- Campaign spend is derived from `SUM(campaign_attributions.discount_amount)`, not stored in `campaigns.spent_budget`.
- Moderation idempotency and auction-only metadata are retained in `marketing_audit_logs`; permissions and idempotency behavior remain unchanged.
- Follow-up user approval (2026-10-13): `reviews.product_id` is a logical reference to the purchased product, not a physical FK. Reviews and their original product IDs survive product deletion; do not cascade-delete reviews, clear IDs, or prevent the existing deletion flow. The Reviews attribute in the source drawing now explicitly says `(logical)`.
- Reviews `date` is normalized to `created_at` under the earlier approved naming rule. It is the existing creation timestamp, not an added independent review-date field.
- Auction state imports/snapshots are durable operational storage. They must be retained while the corresponding auction uses them, and are excluded from the public operator audit feed.

## Source corrections and limits

The source draw.io already contains `Products.id`, `Marketing Audit Logs.id`, and the previously disputed campaign fields. They remain in the source and schema; earlier audit claims that they were absent were corrected and must not be used to remove them.

The ER does not specify all SQL types, nullability, defaults, indexes, deletion/update actions, or deployment strategy. Existing actual backend limits and compatibility fields not resolved by these amendments must remain documented rather than inferred from the diagram. In particular, this amendment does not authorize changing permissions, cross-service storage, or adding an independent budget-reservation policy.
