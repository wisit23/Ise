-- Executive complaints page: tickets are listed by a created_at window. The
-- existing (current_status_id, ticket_priority_id, created_at) index has
-- created_at last, so it cannot serve a time range on its own. Index only; no
-- column or data changes.
CREATE INDEX IF NOT EXISTS "support_tickets_created_at_idx" ON "support_tickets" ("created_at");
