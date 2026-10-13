# Order Service ข้อ 1 — approved ER amendments

This is an explicit amendment to the existing ER reference, not a claim that the historical PDF/drawing has been regenerated. Runtime authority: `backend/services/order-service/prisma/schema.prisma`. Agreements and measured implementation status: `log/loger/order-service/decisions.md`, `workflow-implementation.md`, and the overall work map.

## DisputeCase storage

`dispute_case` retains exactly these physical columns:

1. `dispute_case_id` (PK)
2. `order_id` (FK to `orders.order_id`)
3. `created_by`
4. `reason`
5. `decision`
6. `dispute_case_version`
7. `dispute_type`
8. `assigned_to`
9. `assigned_at`

The user approved moving all seventeen supplementary workflow values into existing `dispute_case_log.detail`: status, created_at, assigned_role, decision_reason, decided_by, decided_at, verdict_key, escalation_note, escalated_by, priority, priority_score, risk_report_count, sla_expires_at, sla_policy_version, first_review_due_at, first_reviewed_at, decision_due_at. Existing operational values are imported before the old columns are removed; no historical events are fabricated.

`dispute_case_state` is a read-only derived SQL view over the core row and versioned workflow logs. It is not a persistent entity or a second workflow storage table. `from_assigned_role` and `to_assigned_role` are likewise preserved in log detail envelopes, not kept as supplementary physical columns. Public audit/history retains the previous human-readable detail and role fields while internal state snapshots are excluded.

## Evidence and safety links

- `dispute_evidence` has one physical `dispute_status` column, renamed from `status` with values retained. No second status is introduced.
- `evidence` has `evidence_id` (PK), `dispute_evidence_id` (FK to `dispute_evidence.dispute_evidence_id`), and `ref_path` (file reference text, **not** a table FK).
- Legacy `dispute_evidence.evidence_path` values are preserved as evidence rows before the redundant path column is removed. Existing file storage is unchanged.
- `dispute_audit_log` PK is `dispute_audit_log_id`; its `dispute_id` FK references **DisputeEvidence**, not DisputeCase.
- `safety_dispute_evidence.evidence_id` references **DisputeEvidence**. `safety_log` PK remains `safety_log_id`.

## Hold and agreed Order links

- Physical `hold.source` becomes `hold_type`, retaining its values. There is no duplicate `source` column.
- `hold.payment_id` identifies its payment; `reference_id` identifies the cause/case; `hold_reason` describes the reason.
- Approved links: `orders.checkout_id` to checkout, `orders.basket_id` to basket, `hold.payment_id` to payment, and `order_log.order_id` to order. Existing snake_case physical table names and Prisma mappings specify the concrete targets.

## Approved history/outbox storage direction

Customer-selected address snapshots and historical product titles belong in existing `order_log.detail`. Checkout totals are derived from order amounts. Pre-dispute status must use reliable order history; unknown history is not invented. Durable attribution jobs use `order_log` transactionally and retry the same event ID; Product deduplicates effects. Their implementation/verification is a separate tracked unit and is not certified by this amendment.

This document records approved entity/attribute relationships. Types, index details, log formats, operational migration guards, and measured test coverage are implementation matters documented separately, not facts inferred from unlabeled ER lines. Historical data and compatibility cannot be waived merely to obtain a matching drawing.
