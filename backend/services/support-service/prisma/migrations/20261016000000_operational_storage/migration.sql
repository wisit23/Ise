BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE support_tickets,ticket_audit_events,ticket_sla_targets,ticket_status_history IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE operational_ticket_before ON COMMIT DROP AS
 SELECT t.ticket_id,q.payload AS queue,r.payload AS responder FROM support_tickets t
 LEFT JOIN LATERAL(SELECT payload FROM ticket_audit_events WHERE ticket_id=t.ticket_id AND event_type='QUEUE_CLASSIFIED'
 ORDER BY COALESCE((payload->>'ticketVersion')::int,0) DESC,created_at DESC,audit_event_id DESC LIMIT 1) q ON true
 LEFT JOIN LATERAL(SELECT payload FROM ticket_audit_events WHERE ticket_id=t.ticket_id AND event_type='CHAT_RESPONDER_CHANGED'
 ORDER BY COALESCE((payload->>'ticketVersion')::int,0) DESC,created_at DESC,audit_event_id DESC LIMIT 1) r ON true;
ALTER TABLE support_tickets ADD COLUMN priority_score INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN risk_report_count INTEGER NOT NULL DEFAULT 0 CHECK(risk_report_count>=0),ADD COLUMN chat_responder_id TEXT,
 ADD COLUMN classification_reason_codes TEXT[],ADD COLUMN classification_policy_version TEXT,ADD COLUMN risk_lookup_available BOOLEAN;
UPDATE support_tickets t SET priority_score=COALESCE((b.queue->>'priorityScore')::int,0),
 risk_report_count=COALESCE((b.queue->>'riskReportCount')::int,0),chat_responder_id=b.responder->>'responderId',
 classification_reason_codes=CASE WHEN jsonb_typeof(b.queue->'classification'->'reasonCodes')='array'
 THEN ARRAY(SELECT jsonb_array_elements_text(b.queue->'classification'->'reasonCodes')) ELSE NULL END,
 classification_policy_version=b.queue->'classification'->>'policyVersion',
 risk_lookup_available=(b.queue->'classification'->>'riskLookupAvailable')::boolean
 FROM operational_ticket_before b WHERE b.ticket_id=t.ticket_id;
CREATE UNIQUE INDEX ticket_status_history_status_history_id_ticket_id_key ON ticket_status_history(status_history_id,ticket_id);
CREATE TABLE ticket_sla_rounds (
 sla_round_id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES support_tickets(ticket_id) ON DELETE CASCADE ON UPDATE CASCADE,
 cycle INTEGER NOT NULL CHECK(cycle>=1),started_at TIMESTAMPTZ(3) NOT NULL,source_history_id TEXT UNIQUE,
 sla_policy_id TEXT NOT NULL REFERENCES sla_policies(sla_policy_id) ON DELETE RESTRICT ON UPDATE CASCADE,
 policy_effective_from TIMESTAMPTZ(3),policy_effective_to TIMESTAMPTZ(3),first_response_minutes INTEGER,resolution_minutes INTEGER,
 snapshot_source TEXT NOT NULL,
 UNIQUE(ticket_id,cycle),UNIQUE(sla_round_id,ticket_id,sla_policy_id),UNIQUE(source_history_id,ticket_id),
 FOREIGN KEY(source_history_id,ticket_id) REFERENCES ticket_status_history(status_history_id,ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TEMP TABLE operational_round_before ON COMMIT DROP AS
 SELECT e.audit_event_id AS round_id,e.ticket_id,e.payload,
 ref->>'id' AS target_id,ref->>'metricType' AS metric_type,ref->>'policyId' AS policy_id,ref->'policy' AS policy,
 COALESCE(ref->>'snapshotSource',CASE WHEN e.actor_id='migration:er' THEN 'legacy-unknown' ELSE 'creation-time' END) AS source
 FROM ticket_audit_events e,LATERAL jsonb_array_elements(e.payload->'targets') ref
 WHERE e.event_type IN('TICKET_OPENED','TICKET_REOPENED');
DO $$ BEGIN
 IF EXISTS(SELECT round_id FROM operational_round_before GROUP BY round_id
 HAVING count(DISTINCT policy_id)<>1 OR count(DISTINCT policy)<>1 OR count(DISTINCT source)<>1) THEN
 RAISE EXCEPTION 'Operational Support cutover blocked: conflicting policies within an SLA round'; END IF;
 IF EXISTS(SELECT target_id FROM operational_round_before GROUP BY target_id HAVING count(*)<>1) THEN
 RAISE EXCEPTION 'Operational Support cutover blocked: SLA target belongs to multiple rounds'; END IF;
 IF EXISTS(SELECT 1 FROM ticket_sla_targets t LEFT JOIN operational_round_before b ON b.target_id=t.sla_target_id
 WHERE b.target_id IS NULL OR ROW(t.ticket_id,t.sla_policy_id,t.metric_type::text) IS DISTINCT FROM ROW(b.ticket_id,b.policy_id,b.metric_type)) THEN
 RAISE EXCEPTION 'Operational Support cutover blocked: incomplete or mismatched SLA ownership'; END IF;
END $$;
INSERT INTO ticket_sla_rounds SELECT DISTINCT round_id,ticket_id,(payload->>'cycle')::int,(payload->>'startedAt')::timestamptz,
 payload->>'sourceHistoryId',policy_id,(policy->>'effectiveFrom')::timestamptz,(policy->>'effectiveTo')::timestamptz,
 (policy->>'firstResponseMinutes')::int,(policy->>'resolutionMinutes')::int,source FROM operational_round_before;
ALTER TABLE ticket_sla_targets ADD COLUMN sla_round_id TEXT;
UPDATE ticket_sla_targets t SET sla_round_id=b.round_id FROM operational_round_before b WHERE b.target_id=t.sla_target_id;
ALTER TABLE ticket_sla_targets ALTER COLUMN sla_round_id SET NOT NULL,
 ADD CONSTRAINT ticket_sla_targets_sla_round_id_ticket_id_sla_policy_id_fkey FOREIGN KEY(sla_round_id,ticket_id,sla_policy_id)
 REFERENCES ticket_sla_rounds(sla_round_id,ticket_id,sla_policy_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX ticket_sla_targets_sla_round_id_metric_type_key ON ticket_sla_targets(sla_round_id,metric_type);
CREATE TABLE ticket_chat_message_receipts (
 chat_message_id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES support_tickets(ticket_id) ON DELETE CASCADE ON UPDATE CASCADE,
 conversation_id TEXT NOT NULL,author_id TEXT,author_role TEXT NOT NULL,is_internal BOOLEAN NOT NULL,
 message_created_at TIMESTAMPTZ(3) NOT NULL,received_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
 CHECK(author_role IN('REQUESTER','AGENT','SYSTEM')));
INSERT INTO ticket_chat_message_receipts SELECT payload->>'chatMessageId',ticket_id,payload->>'conversationId',
 CASE WHEN actor_id IN('system','migration:er') THEN NULL ELSE actor_id END,payload->>'authorRole',(payload->>'isInternal')::boolean,created_at,NULL
 FROM ticket_audit_events WHERE event_type='REPLY' AND dedupe_key LIKE 'chat:%';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM support_tickets t JOIN operational_ticket_before b USING(ticket_id)
 WHERE ROW(t.priority_score,t.risk_report_count,t.chat_responder_id) IS DISTINCT FROM
 ROW(COALESCE((b.queue->>'priorityScore')::int,0),COALESCE((b.queue->>'riskReportCount')::int,0),b.responder->>'responderId')) THEN
 RAISE EXCEPTION 'Operational Support cutover blocked: queue/responder mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM operational_round_before b JOIN ticket_sla_targets t ON t.sla_target_id=b.target_id
 JOIN ticket_sla_rounds r ON r.sla_round_id=t.sla_round_id
 WHERE ROW(r.ticket_id,r.cycle,r.started_at,r.source_history_id,r.sla_policy_id,r.policy_effective_from,r.policy_effective_to,r.first_response_minutes,r.resolution_minutes,r.snapshot_source)
 IS DISTINCT FROM ROW(b.ticket_id,(b.payload->>'cycle')::int,(b.payload->>'startedAt')::timestamptz,b.payload->>'sourceHistoryId',b.policy_id,
 (b.policy->>'effectiveFrom')::timestamptz,(b.policy->>'effectiveTo')::timestamptz,(b.policy->>'firstResponseMinutes')::int,(b.policy->>'resolutionMinutes')::int,b.source)) THEN
 RAISE EXCEPTION 'Operational Support cutover blocked: round policy snapshot mismatch'; END IF;
END $$;
-- All old events, IDs, target dates and provenance remain unchanged.
COMMIT;
