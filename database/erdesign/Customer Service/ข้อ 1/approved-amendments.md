# Customer ER ข้อ 1 — approved alignment, 2026-10-14

## Current approved operational storage amendment (2026-10-14)

The user approved the new typed operational storage design in the current thread. It supersedes the earlier log-backed state direction recorded below for the affected fields. The editable ER has a new `Approved operational storage - current amendment` page. Original diagram pages and original PDF archives are retained; their old storage notes are historical, not the current direction.

See [the complete current storage dictionary](../../../operational-storage.md) and [implementation evidence](../../../../log/evidence/operational-storage.md). New PDF exports are in `output/pdf/*-operational-storage-er.pdf`. Audit logs continue to record actions and preserve old events; operational readers use columns/dedicated tables. Shipping snapshots are a separate table keyed by shipping_id. Auth/Chat ownership and API behavior remain unchanged.



Canonical editable diagram: `customer-service-คน-er.drawio`. The adjacent PDF remains the original archived export; it has not been regenerated and must not be used as this amended revision.

## Physical names and preserved public names

Entity labels now use the existing snake_case SQL tables: `ticket_categories`, `ticket_priorities`, `ticket_statuses`, `sla_policies`, `support_tickets`, `ticket_assignments`, `ticket_status_history`, `ticket_sla_targets`, `ticket_chat_links`, `ticket_audit_events`, `help_categories`, `help_articles`, `help_article_revisions`.

| SQL amendment | Prisma/API contract |
|---|---|
| `support_tickets.id` → `ticket_id` | `SupportTicket.id` remains `id` via `@map` |
| `support_tickets.target_id` → `target_user_id` | `targetId` remains the counterparty, not requester/assignee |
| `ticket_audit_events.id` → `audit_event_id` | `TicketAuditLog.id` and existing delegate name preserved |
| `help_articles.id` → `article_id` | `HelpArticle.id` remains `id` |
| `help_article_revisions` PK `(article_id, version)` | Existing composite PK retained; `version` is now underlined in the diagram |

IDs remain existing TEXT, including non-UUID records. Existing SQL types, nullability, defaults, classification/setup data, ticket/policy FKs, one-active-assignment partial unique index, deferred composite publication FK, search trigger/index and publication checks remain. User/order/conversation IDs are logical cross-service references, not invented cross-database FKs.

## Approved ownership replacements

- **Messages:** Chat is sole owner, including `visibility=INTERNAL`. Support stores only `ticket_chat_links` and metadata audit events. `ticket_messages` is removed only when every legacy row has a verified Chat import receipt matching its full source fingerprint and current link. Attachment/edited mirrors retain the original Chat record; a missing original blocks migration. Imports keep timestamps and do not broadcast or change inbox previews.
- **Queue/risk:** replace `priority_score` and `risk_report_count` with `QUEUE_CLASSIFIED` audit payloads. Store exact score, report count, supplied scoreCase result/availability and policy reference at creation. Migration captures the previously stored values and preserves available `CLASSIFY` events; it explicitly marks absent historical inputs as unknown. No current risk lookup is used to invent history. Existing runtime queue scoring rules continue to consume this stored snapshot.
- **Responder:** replace `chat_responder_id` with `CHAT_RESPONDER_CHANGED` payloads. Assignment remains a different responsibility. Claims/escalations record the explicit responder; takeover does not silently replace it. Migration preserves the observed legacy responder and marks earlier responsibility history unknown.
- **SLA:** replace target `cycle` column with `TICKET_OPENED` / `TICKET_REOPENED` events containing round number, actual start, source history ID, exact target IDs/metrics/policy IDs and policy snapshots. Legacy numeric rounds map to real ordered RESOLVED → IN_PROGRESS history; missing history blocks migration. No nearest-time matching. Old target rows/due/achieved/breached timestamps are retained. Future reopens use the recorded policy snapshot and create new resolution targets; completion/escalation updates only effective targets, not old rounds. A target/policy FK remains SQL-enforced; JSON references are generated atomically by the service, not represented as a nonexistent JSON FK.

Redundant pre-normalization ticket/help column projections, duplicate `ticket_audit_logs` and their rollback triggers are removed after normalized data is preserved. They are not active ER storage. No other service/domain entity is introduced.

## Pending decision — publication timestamp

Parent review found that `help_articles.published_at` exists in the current backend but **not** in the original ER or recorded user approvals. Active callers are not permission to add an ER attribute. The worker's unapproved oval/edge was removed again; existing backend data and publication behavior remain untouched pending a decision. Keeping this column and adding it to ER needs explicit approval. Removing it without an approved lossless representation would discard exact publication times; revision creation time is not an equivalent replacement. Strict ER completion therefore remains blocked on this one attribute, in addition to the separately recorded Auth archives. Earlier thirteen-table attribute parity was measured against the worker-amended drawing, not the authorized original; it is not proof of approval.

See `log/evidence/support-service/implementation.md` and `log/evidence/chat-service/implementation.md` for executed evidence, deployment sequencing and limits.
