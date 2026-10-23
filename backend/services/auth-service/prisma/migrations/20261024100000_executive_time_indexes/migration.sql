-- Executive dashboard: web usage reads login_logs in a login_at window (the
-- existing (user_id, login_at) index leads with user_id, so it cannot serve a
-- time range), new users read users by created_at, and the complaints list
-- reads reports by reported_at. Indexes only; no column or data changes.
CREATE INDEX IF NOT EXISTS "login_logs_login_at_idx" ON "login_logs" ("login_at");
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" ("created_at");
CREATE INDEX IF NOT EXISTS "reports_reported_at_idx" ON "reports" ("reported_at");
