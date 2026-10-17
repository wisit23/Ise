# Current operational storage amendment

Approved by the user in the current thread. These definitions replace log-backed operational storage in the affected models only. Other ER pages and original PDF archives remain historical/reference material. SQL migrations preserve audit rows, IDs, timestamps, policy provenance and delivery identifiers.

Source: service-owned Prisma schemas and the 20261016000000_operational_storage migrations. This is code/schema documentation, not a claim that an application database has been upgraded.

Runtime compatibility keeps the existing addressSnapshot API object while storing seven typed fields in dedicated owner-keyed rows. Missing legacy classification inputs remain SQL NULL; Prisma array fields may expose SQL NULL as an empty list internally. No new classification rule is introduced.

## Order

### orders

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `order_id` | `TEXT` | NN | PK |
| `checkout_id` | `TEXT` | NULL | FK |
| `basket_id` | `TEXT` | NULL | FK/UQ |
| `buyer_id` | `TEXT` | NN | - |
| `seller_id` | `TEXT` | NN | - |
| `product_id` | `TEXT` | NN | - |
| `product_title` | `TEXT` | NULL | - |
| `campaign_code` | `TEXT` | NULL | - |
| `pre_dispute_status` | `TEXT` | NULL | - |
| `campaign_id` | `TEXT` | NULL | - |
| `auction_id` | `TEXT` | NULL | UQ |
| `order_type` | `TEXT` | NN | - |
| `original_amount` | `DECIMAL(18, 2)` | NN | - |
| `orders_amount` | `DECIMAL(18, 2)` | NN | - |
| `status` | `TEXT` | NN | - |
| `version` | `INT` | NN | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |
| `updated_at` | `TIMESTAMP(3)` | NN | - |

### dispute_case

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `dispute_case_id` | `TEXT` | NN | PK |
| `order_id` | `TEXT` | NN | FK/UQ |
| `created_by` | `TEXT` | NN | - |
| `reason` | `TEXT` | NN | - |
| `decision` | `TEXT` | NULL | - |
| `dispute_type` | `TEXT` | NN | - |
| `dispute_case_version` | `INT` | NN | - |
| `assigned_to` | `TEXT` | NULL | - |
| `assigned_at` | `TIMESTAMP(3)` | NULL | - |
| `status` | `TEXT` | NN | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |
| `assigned_role` | `TEXT` | NULL | - |
| `decision_reason` | `TEXT` | NULL | - |
| `decided_by` | `TEXT` | NULL | - |
| `decided_at` | `TIMESTAMP(3)` | NULL | - |
| `verdict_key` | `TEXT` | NULL | UQ |
| `escalation_note` | `TEXT` | NULL | - |
| `escalated_by` | `TEXT` | NULL | - |
| `priority` | `TEXT` | NN | - |
| `priority_score` | `INT` | NN | - |
| `risk_report_count` | `INT` | NN | - |
| `sla_expires_at` | `TIMESTAMP(3)` | NULL | - |
| `sla_policy_version` | `TEXT` | NULL | - |
| `first_review_due_at` | `TIMESTAMP(3)` | NULL | - |
| `first_reviewed_at` | `TIMESTAMP(3)` | NULL | - |
| `decision_due_at` | `TIMESTAMP(3)` | NULL | - |

### checkouts

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `checkout_id` | `TEXT` | NN | PK |
| `buyer_id` | `TEXT` | NN | - |
| `address_id` | `TEXT` | NN | - |
| `status` | `TEXT` | NN | - |
| `paid_at` | `TIMESTAMP(3)` | NULL | - |
| `cancel_at` | `TIMESTAMP(3)` | NN | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |
| `updated_at` | `TIMESTAMP(3)` | NN | - |

### shipping

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `shipping_id` | `TEXT` | NN | PK |
| `order_id` | `TEXT` | NN | FK/UQ |
| `address_id` | `TEXT` | NN | - |
| `company` | `TEXT` | NULL | - |
| `tracking_number` | `TEXT` | NULL | - |
| `status` | `TEXT` | NN | - |
| `updated_at` | `TIMESTAMP(3)` | NN | - |

### checkout_address_snapshots

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `checkout_id` | `TEXT` | NN | PK/FK |
| `recipient_name` | `TEXT` | NN | - |
| `phone` | `TEXT` | NN | - |
| `address_line` | `TEXT` | NN | - |
| `subdistrict` | `TEXT` | NN | - |
| `district` | `TEXT` | NN | - |
| `province` | `TEXT` | NN | - |
| `postal_code` | `TEXT` | NN | - |

### shipping_address_snapshots

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `shipping_id` | `TEXT` | NN | PK/FK |
| `recipient_name` | `TEXT` | NN | - |
| `phone` | `TEXT` | NN | - |
| `address_line` | `TEXT` | NN | - |
| `subdistrict` | `TEXT` | NN | - |
| `district` | `TEXT` | NN | - |
| `province` | `TEXT` | NN | - |
| `postal_code` | `TEXT` | NN | - |

### order_attribution_jobs

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `id` | `TEXT` | NN | PK |
| `order_id` | `TEXT` | NN | FK/UQ |
| `campaign_id` | `TEXT` | NN | - |
| `gross_amount` | `DECIMAL(18, 2)` | NN | - |
| `discount_amount` | `DECIMAL(18, 2)` | NN | - |
| `net_amount` | `DECIMAL(18, 2)` | NN | - |
| `completed_at` | `TIMESTAMP(3)` | NN | - |
| `attempts` | `INT` | NN | - |
| `last_error` | `TEXT` | NULL | - |
| `next_attempt_at` | `TIMESTAMP(3)` | NN | - |
| `processed_at` | `TIMESTAMP(3)` | NULL | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |

### order_product_sync_jobs

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `event_id` | `TEXT` | NN | PK |
| `order_id` | `TEXT` | NN | FK |
| `product_id` | `TEXT` | NN | - |
| `action` | `TEXT` | NN | - |
| `reservation_id` | `TEXT` | NULL | - |
| `target_status` | `TEXT` | NULL | - |
| `actor_id` | `TEXT` | NN | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |
| `processed_at` | `TIMESTAMP(3)` | NULL | - |

### Relationships

- `dispute_case.order_id` -> `orders.order_id`; parent:child **1 : 0..1**.
- `orders.checkout_id` -> `checkouts.checkout_id`; parent:child **1 : 0..N**.
- `shipping.order_id` -> `orders.order_id`; parent:child **1 : 0..1**.
- `checkout_address_snapshots.checkout_id` -> `checkouts.checkout_id`; parent:child **1 : 0..1**.
- `shipping_address_snapshots.shipping_id` -> `shipping.shipping_id`; parent:child **1 : 0..1**.
- `order_attribution_jobs.order_id` -> `orders.order_id`; parent:child **1 : 0..1**.
- `order_product_sync_jobs.order_id` -> `orders.order_id`; parent:child **1 : 0..N**.

### Storage constraints

- Operational dispute state is stored in dispute_case, not WORKFLOW_STATE logs.
- Address tables each contain owner PK/FK plus seven typed address fields.
- Attribution and product sync are durable job tables. IDs are unchanged on retry.
- Checkout totals remain derived from order amounts; audit history is retained.

## Product

### auction_rounds

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `title` | `TEXT` | NN | - |
| `categories` | `TEXT[]` | NN | - |
| `cancellation_reason` | `TEXT` | NULL | - |
| `cancelled_at` | `TIMESTAMP(3)` | NULL | - |
| `cancelled_by` | `TEXT` | NULL | - |
| `id` | `TEXT` | NN | PK |
| `submission_starts_at` | `TIMESTAMP(3)` | NN | - |
| `submission_ends_at` | `TIMESTAMP(3)` | NN | - |
| `auction_starts_at` | `TIMESTAMP(3)` | NN | - |
| `auction_ends_at` | `TIMESTAMP(3)` | NN | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |
| `updated_at` | `TIMESTAMP(3)` | NN | - |

### auction_items

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `cancellation_reason` | `TEXT` | NULL | - |
| `cancelled_at` | `TIMESTAMP(3)` | NULL | - |
| `cancelled_by` | `TEXT` | NULL | - |
| `id` | `TEXT` | NN | PK |
| `product_id` | `TEXT` | NN | FK |
| `seller_id` | `TEXT` | NN | - |
| `status` | `AuctionStatus` | NN | - |
| `starting_price` | `INT` | NN | - |
| `bid_increment` | `INT` | NN | - |
| `scheduled_start_at` | `TIMESTAMP(3)` | NULL | - |
| `scheduled_end_at` | `TIMESTAMP(3)` | NULL | - |
| `opened_at` | `TIMESTAMP(3)` | NULL | - |
| `closed_at` | `TIMESTAMP(3)` | NULL | - |
| `approved_by` | `TEXT` | NULL | - |
| `approved_at` | `TIMESTAMP(3)` | NULL | - |
| `winning_bid_id` | `TEXT` | NULL | UQ |
| `winning_order_id` | `TEXT` | NULL | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |
| `updated_at` | `TIMESTAMP(3)` | NN | - |
| `round_id` | `TEXT` | NULL | FK |

### product_moderation_commands

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `idempotency_key` | `TEXT` | NN | PK |
| `action` | `TEXT` | NN | - |
| `product_id` | `TEXT` | NN | - |
| `payload_hash` | `TEXT` | NN | - |
| `result` | `JSONB` | NN | - |
| `created_at` | `TIMESTAMP(3)` | NN | - |

### Relationships

- `auction_items.round_id` -> `auction_rounds.id`; parent:child **1 : 0..N**.
- `auction_items.product_id` -> `products.id`; parent:child **1 : 0..N**.
- `product_moderation_commands.product_id` -> `products.id`; parent:child **logical / historical**.

### Storage constraints

- Auction title/categories/cancellation fields live in auction rows, not audit JSON.
- Current moderation state remains in products (existing columns are unchanged).
- Moderation result receipts retain product IDs after deletion; no cascading FK.
- Budget is still derived from campaign attribution facts. Audit history is retained.

## Support

### support_tickets

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `priority_score` | `INT` | NN | - |
| `risk_report_count` | `INT` | NN | - |
| `chat_responder_id` | `TEXT` | NULL | - |
| `classification_reason_codes` | `TEXT[]` | NULL | - |
| `classification_policy_version` | `TEXT` | NULL | - |
| `risk_lookup_available` | `BOOL` | NULL | - |
| `ticket_id` | `TEXT` | NN | PK |
| `ticket_number` | `TEXT` | NN | UQ |
| `requester_id` | `TEXT` | NN | - |
| `subject` | `TEXT` | NN | - |
| `description` | `TEXT` | NN | - |
| `ticket_category_id` | `SMALLINT` | NN | FK |
| `ticket_priority_id` | `SMALLINT` | NN | FK |
| `current_status_id` | `SMALLINT` | NN | FK |
| `order_id` | `TEXT` | NULL | - |
| `target_user_id` | `TEXT` | NULL | - |
| `lock_version` | `INT` | NN | - |
| `created_at` | `TIMESTAMPTZ(3)` | NN | - |
| `updated_at` | `TIMESTAMPTZ(3)` | NN | - |

### ticket_sla_rounds

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `sla_round_id` | `TEXT` | NN | PK |
| `ticket_id` | `TEXT` | NN | FK |
| `cycle` | `INT` | NN | - |
| `started_at` | `TIMESTAMPTZ(3)` | NN | - |
| `source_history_id` | `TEXT` | NULL | FK/UQ |
| `sla_policy_id` | `TEXT` | NN | FK |
| `policy_effective_from` | `TIMESTAMPTZ(3)` | NULL | - |
| `policy_effective_to` | `TIMESTAMPTZ(3)` | NULL | - |
| `first_response_minutes` | `INT` | NULL | - |
| `resolution_minutes` | `INT` | NULL | - |
| `snapshot_source` | `TEXT` | NN | - |

### ticket_sla_targets

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `sla_round_id` | `TEXT` | NN | FK |
| `sla_target_id` | `TEXT` | NN | PK |
| `ticket_id` | `TEXT` | NN | FK |
| `sla_policy_id` | `TEXT` | NN | FK |
| `metric_type` | `VARCHAR(30)` | NN | - |
| `due_at` | `TIMESTAMPTZ(3)` | NN | - |
| `achieved_at` | `TIMESTAMPTZ(3)` | NULL | - |
| `breached_at` | `TIMESTAMPTZ(3)` | NULL | - |
| `created_at` | `TIMESTAMPTZ(3)` | NN | - |
| `updated_at` | `TIMESTAMPTZ(3)` | NN | - |

### ticket_chat_message_receipts

| Column | Type | Nullable | Key |
| --- | --- | --- | --- |
| `chat_message_id` | `TEXT` | NN | PK |
| `ticket_id` | `TEXT` | NN | FK |
| `conversation_id` | `TEXT` | NN | - |
| `author_id` | `TEXT` | NULL | - |
| `author_role` | `TEXT` | NN | - |
| `is_internal` | `BOOL` | NN | - |
| `message_created_at` | `TIMESTAMPTZ(3)` | NN | - |
| `received_at` | `TIMESTAMPTZ(3)` | NULL | - |

### Relationships

- `ticket_sla_rounds.ticket_id` -> `support_tickets.ticket_id`; parent:child **1 : 0..N**.
- `ticket_sla_targets.sla_round_id,ticket_id,sla_policy_id` -> `ticket_sla_rounds.sla_round_id,ticket_id,sla_policy_id`; parent:child **1 : 0..N**.
- `ticket_sla_rounds.sla_policy_id` -> `sla_policies.sla_policy_id`; parent:child **1 : 0..N**.
- `ticket_sla_rounds.source_history_id,ticket_id` -> `ticket_status_history.status_history_id,ticket_id`; parent:child **1 : 0..1 / optional**.
- `ticket_chat_message_receipts.ticket_id` -> `support_tickets.ticket_id`; parent:child **1 : 0..N**.

### Storage constraints

- Queue/classification/responder fields live in support_tickets, not audit events.
- SLA targets use a same-ticket/same-policy composite round FK (deferred).
- UNIQUE(ticket_id, cycle); UNIQUE(sla_round_id, metric_type); source history is unique.
- Policy snapshots keep recorded provenance. Unknown legacy values remain unknown.
- Chat receipts contain metadata only. Chat retains ownership of message bodies.

## Migration and verification

Stop old writers before cutover; deploy the new runtime after the migration. New migrations do not edit old migration files or delete audit rows. Missing/conflicting snapshots, inconsistent round ownership and unrepresentable address data block migration transactionally. Local application database migration was subsequently authorized and completed; see the dated evidence for its scope and limits.

See [agreements](../log/loger/operational-storage.md) and [implementation evidence](../log/evidence/operational-storage.md).
