BEGIN;
SET LOCAL TIME ZONE 'UTC';
-- Stop old application writers for cutover. The table locks prevent concurrent
-- changes during the copy; the old runtime must not resume after this deploy.
LOCK TABLE dispute_case, dispute_case_log, orders, order_log, checkouts, shipping IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE operational_workflow_before ON COMMIT DROP AS SELECT * FROM dispute_case_state;
DO $$ BEGIN
 IF (SELECT count(*) FROM operational_workflow_before) <> (SELECT count(*) FROM dispute_case) THEN
  RAISE EXCEPTION 'Operational cutover blocked: dispute workflow snapshot is missing'; END IF;
 IF EXISTS (SELECT 1 FROM dispute_case c JOIN LATERAL (
  SELECT (detail::jsonb->>'case_version')::int AS version FROM dispute_case_log
  WHERE dispute_case_id=c.dispute_case_id AND action='WORKFLOW_STATE'
  ORDER BY (detail::jsonb->>'case_version')::int DESC,created_at DESC,dispute_case_log_id DESC LIMIT 1
 ) l ON true WHERE l.version <> c.dispute_case_version) THEN
  RAISE EXCEPTION 'Operational cutover blocked: dispute version does not match its snapshot'; END IF;
END $$;
ALTER TABLE dispute_case ADD COLUMN status TEXT,
 ADD COLUMN created_at TIMESTAMP(3),
 ADD COLUMN assigned_role TEXT,
 ADD COLUMN decision_reason TEXT,
 ADD COLUMN decided_by TEXT,
 ADD COLUMN decided_at TIMESTAMP(3),
 ADD COLUMN verdict_key TEXT,
 ADD COLUMN escalation_note TEXT,
 ADD COLUMN escalated_by TEXT,
 ADD COLUMN priority TEXT,
 ADD COLUMN priority_score INTEGER,
 ADD COLUMN risk_report_count INTEGER,
 ADD COLUMN sla_expires_at TIMESTAMP(3),
 ADD COLUMN sla_policy_version TEXT,
 ADD COLUMN first_review_due_at TIMESTAMP(3),
 ADD COLUMN first_reviewed_at TIMESTAMP(3),
 ADD COLUMN decision_due_at TIMESTAMP(3);
UPDATE dispute_case c SET status=b.status, created_at=b.created_at, assigned_role=b.assigned_role, decision_reason=b.decision_reason, decided_by=b.decided_by, decided_at=b.decided_at, verdict_key=b.verdict_key, escalation_note=b.escalation_note, escalated_by=b.escalated_by, priority=b.priority, priority_score=b.priority_score, risk_report_count=b.risk_report_count, sla_expires_at=b.sla_expires_at, sla_policy_version=b.sla_policy_version, first_review_due_at=b.first_review_due_at, first_reviewed_at=b.first_reviewed_at, decision_due_at=b.decision_due_at FROM operational_workflow_before b WHERE c.dispute_case_id=b.dispute_case_id;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM dispute_case c JOIN operational_workflow_before b USING(dispute_case_id)
 WHERE ROW(c.status,c.created_at,c.assigned_role,c.decision_reason,c.decided_by,c.decided_at,c.verdict_key,c.escalation_note,c.escalated_by,c.priority,c.priority_score,c.risk_report_count,c.sla_expires_at,c.sla_policy_version,c.first_review_due_at,c.first_reviewed_at,c.decision_due_at) IS DISTINCT FROM ROW(b.status,b.created_at,b.assigned_role,b.decision_reason,b.decided_by,b.decided_at,b.verdict_key,b.escalation_note,b.escalated_by,b.priority,b.priority_score,b.risk_report_count,b.sla_expires_at,b.sla_policy_version,b.first_review_due_at,b.first_reviewed_at,b.decision_due_at)) THEN
 RAISE EXCEPTION 'Operational cutover blocked: workflow value mismatch'; END IF; END $$;
ALTER TABLE dispute_case ALTER COLUMN status SET NOT NULL, ALTER COLUMN status SET DEFAULT 'OPEN',
 ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
 ALTER COLUMN priority SET NOT NULL, ALTER COLUMN priority SET DEFAULT 'NORMAL',
 ALTER COLUMN priority_score SET NOT NULL, ALTER COLUMN priority_score SET DEFAULT 0,
 ALTER COLUMN risk_report_count SET NOT NULL, ALTER COLUMN risk_report_count SET DEFAULT 0,
 ADD CONSTRAINT dispute_case_risk_nonnegative CHECK(risk_report_count >= 0);
CREATE UNIQUE INDEX dispute_case_verdict_key_key ON dispute_case(verdict_key);
CREATE INDEX dispute_case_status_assigned_role_sla_expires_at_idx ON dispute_case(status,assigned_role,sla_expires_at);
DROP VIEW dispute_case_state;
ALTER TABLE orders ADD COLUMN product_title TEXT, ADD COLUMN campaign_code TEXT, ADD COLUMN pre_dispute_status TEXT;
CREATE TEMP TABLE operational_history_before ON COMMIT DROP AS
 SELECT DISTINCT ON(action,detail::jsonb->>'entity_id') action,detail::jsonb->>'entity_id' AS entity_id,detail::jsonb->'state' AS state
 FROM order_log WHERE action IN('ORDER_HISTORY_STATE','CHECKOUT_ADDRESS_STATE','SHIPPING_ADDRESS_STATE')
 ORDER BY action,detail::jsonb->>'entity_id',(detail::jsonb->>'revision')::bigint DESC;
UPDATE orders o SET product_title=b.state->>'productTitle',campaign_code=b.state->>'campaignCode',pre_dispute_status=b.state->>'preDisputeStatus'
 FROM operational_history_before b WHERE b.action='ORDER_HISTORY_STATE' AND b.entity_id=o.order_id;
CREATE TABLE checkout_address_snapshots (checkout_id TEXT PRIMARY KEY REFERENCES checkouts(checkout_id) ON DELETE CASCADE ON UPDATE CASCADE,
recipient_name TEXT NOT NULL,
phone TEXT NOT NULL,
address_line TEXT NOT NULL,
subdistrict TEXT NOT NULL,
district TEXT NOT NULL,
province TEXT NOT NULL,
postal_code TEXT NOT NULL);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM operational_history_before b
 WHERE b.action='CHECKOUT_ADDRESS_STATE' AND b.state->'addressSnapshot' <> 'null'::jsonb
 AND (jsonb_typeof(b.state->'addressSnapshot') <> 'object' OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(b.state->'addressSnapshot') k WHERE k NOT IN ('recipientName','phone','addressLine','subdistrict','district','province','postalCode')) OR
 EXISTS(SELECT 1 FROM unnest(ARRAY['recipientName','phone','addressLine','subdistrict','district','province','postalCode']) k WHERE jsonb_typeof(b.state->'addressSnapshot'->k) IS DISTINCT FROM 'string'))) THEN
 RAISE EXCEPTION 'Operational cutover blocked: unrepresentable checkout address snapshot'; END IF; END $$;
INSERT INTO checkout_address_snapshots SELECT b.entity_id,b.state->'addressSnapshot'->>'recipientName',b.state->'addressSnapshot'->>'phone',b.state->'addressSnapshot'->>'addressLine',b.state->'addressSnapshot'->>'subdistrict',b.state->'addressSnapshot'->>'district',b.state->'addressSnapshot'->>'province',b.state->'addressSnapshot'->>'postalCode' FROM operational_history_before b WHERE b.action='CHECKOUT_ADDRESS_STATE' AND b.state->'addressSnapshot' <> 'null'::jsonb;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM operational_history_before b JOIN checkout_address_snapshots a ON a.checkout_id=b.entity_id
 WHERE b.action='CHECKOUT_ADDRESS_STATE' AND b.state->'addressSnapshot' IS DISTINCT FROM jsonb_build_object('recipientName',a.recipient_name,'phone',a.phone,'addressLine',a.address_line,'subdistrict',a.subdistrict,'district',a.district,'province',a.province,'postalCode',a.postal_code)) THEN
 RAISE EXCEPTION 'Operational cutover blocked: checkout snapshot mismatch'; END IF; END $$;
CREATE TABLE shipping_address_snapshots (shipping_id TEXT PRIMARY KEY REFERENCES shipping(shipping_id) ON DELETE CASCADE ON UPDATE CASCADE,
recipient_name TEXT NOT NULL,
phone TEXT NOT NULL,
address_line TEXT NOT NULL,
subdistrict TEXT NOT NULL,
district TEXT NOT NULL,
province TEXT NOT NULL,
postal_code TEXT NOT NULL);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM operational_history_before b
 WHERE b.action='SHIPPING_ADDRESS_STATE' AND b.state->'addressSnapshot' <> 'null'::jsonb
 AND (jsonb_typeof(b.state->'addressSnapshot') <> 'object' OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(b.state->'addressSnapshot') k WHERE k NOT IN ('recipientName','phone','addressLine','subdistrict','district','province','postalCode')) OR
 EXISTS(SELECT 1 FROM unnest(ARRAY['recipientName','phone','addressLine','subdistrict','district','province','postalCode']) k WHERE jsonb_typeof(b.state->'addressSnapshot'->k) IS DISTINCT FROM 'string'))) THEN
 RAISE EXCEPTION 'Operational cutover blocked: unrepresentable shipping address snapshot'; END IF; END $$;
INSERT INTO shipping_address_snapshots SELECT b.entity_id,b.state->'addressSnapshot'->>'recipientName',b.state->'addressSnapshot'->>'phone',b.state->'addressSnapshot'->>'addressLine',b.state->'addressSnapshot'->>'subdistrict',b.state->'addressSnapshot'->>'district',b.state->'addressSnapshot'->>'province',b.state->'addressSnapshot'->>'postalCode' FROM operational_history_before b WHERE b.action='SHIPPING_ADDRESS_STATE' AND b.state->'addressSnapshot' <> 'null'::jsonb;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM operational_history_before b JOIN shipping_address_snapshots a ON a.shipping_id=b.entity_id
 WHERE b.action='SHIPPING_ADDRESS_STATE' AND b.state->'addressSnapshot' IS DISTINCT FROM jsonb_build_object('recipientName',a.recipient_name,'phone',a.phone,'addressLine',a.address_line,'subdistrict',a.subdistrict,'district',a.district,'province',a.province,'postalCode',a.postal_code)) THEN
 RAISE EXCEPTION 'Operational cutover blocked: shipping snapshot mismatch'; END IF; END $$;
CREATE TEMP TABLE operational_attribution_before ON COMMIT DROP AS SELECT * FROM order_attribution_jobs;
DROP VIEW order_attribution_jobs;
CREATE TABLE order_attribution_jobs (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE RESTRICT ON UPDATE CASCADE,
 campaign_id TEXT NOT NULL,gross_amount NUMERIC(18,2) NOT NULL,discount_amount NUMERIC(18,2) NOT NULL,net_amount NUMERIC(18,2) NOT NULL,
 completed_at TIMESTAMP(3) NOT NULL,attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),last_error TEXT,
 next_attempt_at TIMESTAMP(3) NOT NULL,processed_at TIMESTAMP(3),created_at TIMESTAMP(3) NOT NULL);
INSERT INTO order_attribution_jobs SELECT * FROM operational_attribution_before;
CREATE INDEX order_attribution_jobs_processed_at_next_attempt_at_idx ON order_attribution_jobs(processed_at,next_attempt_at);
CREATE TABLE order_product_sync_jobs (
 event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT ON UPDATE CASCADE,
 product_id TEXT NOT NULL,action TEXT NOT NULL,reservation_id TEXT,target_status TEXT,actor_id TEXT NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,processed_at TIMESTAMP(3),
 CHECK ((action IN('COMPLETE_RESERVATION','RELEASE_RESERVATION') AND reservation_id IS NOT NULL AND target_status IS NULL)
 OR (action='SET_STATUS' AND target_status IS NOT NULL AND reservation_id IS NULL)));
INSERT INTO order_product_sync_jobs SELECT l.order_log_id,l.order_id,l.detail::jsonb->>'productId',l.detail::jsonb->>'action',
 l.detail::jsonb->>'reservationId',l.detail::jsonb->>'targetStatus',l.actor_id,l.created_at,
 (SELECT min(a.created_at) FROM order_log a WHERE a.action='PRODUCT_SYNC_COMPLETED' AND a.detail=l.order_log_id)
 FROM order_log l WHERE l.action='PRODUCT_SYNC_REQUESTED';
CREATE INDEX order_product_sync_jobs_processed_at_created_at_idx ON order_product_sync_jobs(processed_at,created_at);
CREATE INDEX order_product_sync_jobs_order_id_idx ON order_product_sync_jobs(order_id);
-- Audit rows remain byte-for-byte. No old migrations are edited.
COMMIT;
