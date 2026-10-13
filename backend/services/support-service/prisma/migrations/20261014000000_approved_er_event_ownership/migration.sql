-- Contract migration: stop legacy writers and run migrateMessagesToChat --apply first.
-- All changes, including the history guards, are atomic. No db-push/baseline bypass.
BEGIN;
LOCK TABLE support_tickets, ticket_messages, ticket_sla_targets, ticket_audit_events IN ACCESS EXCLUSIVE MODE;

-- A receipt is tied to the complete immutable source row and the current ticket link.
-- Chat content is not copied into audit payloads (only its verified fingerprint/IDs).
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM ticket_messages m
   LEFT JOIN ticket_chat_links l ON l.ticket_id=m.ticket_id
   WHERE NOT EXISTS (
     SELECT 1 FROM ticket_audit_events e
     WHERE e.ticket_id=m.ticket_id AND e.event_type='MESSAGE_MIGRATED'
       AND e.dedupe_key='legacy-chat:'||m.id
       AND e.payload->>'legacyMessageId'=m.id
       AND e.payload->>'conversationId'=l.conversation_id
       AND nullif(e.payload->>'chatMessageId','') IS NOT NULL
       AND e.payload->>'legacyFingerprint'=md5(jsonb_build_object(
         'id',m.id,'ticketId',m.ticket_id,'authorId',m.author_id,'authorRole',m.author_role,
         'body',m.body,'isInternal',m.is_internal,'chatMessageId',m.chat_message_id,
         'createdAt',to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text)
   )
 ) THEN RAISE EXCEPTION 'Unverified legacy ticket messages: run migrateMessagesToChat --apply with old writers stopped before this contract migration'; END IF;
 -- Numeric legacy cycles must map to real ordered reopen history, never a nearby timestamp.
 IF EXISTS (
   SELECT 1 FROM ticket_sla_targets st WHERE st.cycle>1 AND NOT EXISTS (
     SELECT 1 FROM (
       SELECT h.ticket_id,row_number() OVER (PARTITION BY h.ticket_id ORDER BY h.created_at,h.status_history_id)+1 AS cycle
       FROM ticket_status_history h JOIN ticket_statuses f ON f.ticket_status_id=h.from_status_id
       JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id
       WHERE f.code='RESOLVED' AND s.code='IN_PROGRESS'
     ) h WHERE h.ticket_id=st.ticket_id AND h.cycle=st.cycle
   )
 ) THEN RAISE EXCEPTION 'Missing real reopen history for legacy SLA cycle: repair history before migration; timestamp inference is forbidden'; END IF;
 IF EXISTS (
   SELECT 1 FROM ticket_sla_targets st GROUP BY st.ticket_id
   HAVING max(st.cycle)-1 <> (SELECT count(*) FROM ticket_status_history h
     JOIN ticket_statuses f ON f.ticket_status_id=h.from_status_id
     JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id
     WHERE h.ticket_id=st.ticket_id AND f.code='RESOLVED' AND s.code='IN_PROGRESS')
 ) OR EXISTS (
   SELECT 1 FROM ticket_status_history h
   JOIN ticket_statuses f ON f.ticket_status_id=h.from_status_id
   JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id
   WHERE f.code='RESOLVED' AND s.code='IN_PROGRESS'
   GROUP BY h.ticket_id,h.created_at HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'Ambiguous or incomplete legacy SLA round history: provide explicit historical correlation before migration'; END IF;
END $$;

INSERT INTO ticket_audit_events(id,ticket_id,actor_id,event_type,dedupe_key,payload,created_at)
 SELECT 'er-queue:'||t.id,t.id,'migration:er','QUEUE_CLASSIFIED','er-queue:'||t.id,
 jsonb_build_object('schemaVersion',1,'ticketVersion',t.lock_version,'priorityScore',t.priority_score,
   'riskReportCount',t.risk_report_count,'source','legacy-stored-snapshot',
   'classification',(SELECT e.payload FROM ticket_audit_events e WHERE e.ticket_id=t.id AND e.event_type='CLASSIFY' ORDER BY e.created_at DESC,e.id DESC LIMIT 1),
   'observedAt',CURRENT_TIMESTAMP,'historicalInputsAvailable',EXISTS(SELECT 1 FROM ticket_audit_events e WHERE e.ticket_id=t.id AND e.event_type='CLASSIFY')),
 CURRENT_TIMESTAMP FROM support_tickets t;
INSERT INTO ticket_audit_events(id,ticket_id,actor_id,event_type,dedupe_key,payload,created_at)
 SELECT 'er-responder:'||id,id,'migration:er','CHAT_RESPONDER_CHANGED','er-responder:'||id,
 jsonb_build_object('schemaVersion',1,'ticketVersion',lock_version,'responderId',chat_responder_id,
   'reason','Legacy stored responder; earlier responsibility history is unknown','observedAt',CURRENT_TIMESTAMP),
 CURRENT_TIMESTAMP FROM support_tickets;

WITH reopens AS (
 SELECT h.*,row_number() OVER (PARTITION BY h.ticket_id ORDER BY h.created_at,h.status_history_id)+1 AS cycle
 FROM ticket_status_history h JOIN ticket_statuses f ON f.ticket_status_id=h.from_status_id
 JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id WHERE f.code='RESOLVED' AND s.code='IN_PROGRESS'
), refs AS (
 SELECT st.ticket_id,st.cycle,jsonb_agg(jsonb_build_object('id',st.sla_target_id,'metricType',st.metric_type,
   'policyId',st.sla_policy_id,'policy',jsonb_build_object('id',p.sla_policy_id,'effectiveFrom',p.effective_from,
     'effectiveTo',p.effective_to,'firstResponseMinutes',p.first_response_minutes,'resolutionMinutes',p.resolution_minutes),
   'snapshotSource','policy-row-at-migration') ORDER BY st.metric_type) AS targets
 FROM ticket_sla_targets st JOIN sla_policies p ON p.sla_policy_id=st.sla_policy_id GROUP BY st.ticket_id,st.cycle
)
INSERT INTO ticket_audit_events(id,ticket_id,actor_id,event_type,dedupe_key,payload,created_at)
 SELECT 'er-round:'||r.ticket_id||':'||r.cycle,r.ticket_id,COALESCE(h.changed_by_id,t.requester_id),
 CASE WHEN r.cycle=1 THEN 'TICKET_OPENED' ELSE 'TICKET_REOPENED' END,
 'sla-round:'||r.ticket_id||':'||r.cycle,
 jsonb_build_object('schemaVersion',1,'cycle',r.cycle,'startedAt',CASE WHEN r.cycle=1 THEN t.created_at ELSE h.created_at END,
   'sourceHistoryId',h.status_history_id,'source',CASE WHEN r.cycle=1 THEN 'ticket-created-at' ELSE 'status-history-reopen' END,'targets',r.targets),
 CASE WHEN r.cycle=1 THEN t.created_at ELSE h.created_at END
 FROM refs r JOIN support_tickets t ON t.id=r.ticket_id LEFT JOIN reopens h ON h.ticket_id=r.ticket_id AND h.cycle=r.cycle;

-- Remove redundant rollback projections only after copying every original audit row.
INSERT INTO ticket_audit_events(id,ticket_id,actor_id,event_type,dedupe_key,payload,created_at)
 SELECT id,ticket_id,actor_id,action,dedupe_key,jsonb_build_object('fromValue',from_value,'toValue',to_value,'reason',reason),created_at
 FROM ticket_audit_logs l WHERE NOT EXISTS(SELECT 1 FROM ticket_audit_events e WHERE e.id=l.id);
DROP TRIGGER audit_legacy_projection ON ticket_audit_events;
DROP FUNCTION audit_legacy_projection();
DROP TABLE ticket_audit_logs;
DROP TRIGGER support_ticket_legacy_projection ON support_tickets;
DROP FUNCTION support_ticket_legacy_projection();
DROP TRIGGER assignment_legacy_projection ON ticket_assignments;
DROP TRIGGER chat_link_legacy_projection ON ticket_chat_links;
DROP TRIGGER sla_legacy_projection ON ticket_sla_targets;
DROP TRIGGER history_legacy_projection ON ticket_status_history;
DROP FUNCTION support_child_legacy_projection();
DROP TRIGGER help_article_legacy_projection ON help_articles;
DROP FUNCTION help_article_legacy_projection();
DROP TRIGGER help_draft_legacy_projection ON help_article_revisions;
DROP FUNCTION help_draft_legacy_projection();
DROP TABLE ticket_messages;
ALTER TABLE ticket_sla_targets DROP COLUMN cycle;
ALTER TABLE support_tickets DROP COLUMN priority_score, DROP COLUMN risk_report_count, DROP COLUMN chat_responder_id,
 DROP COLUMN category, DROP COLUMN priority, DROP COLUMN status, DROP COLUMN assignee_id,
 DROP COLUMN conversation_id, DROP COLUMN sla_due_at, DROP COLUMN first_response_at,
 DROP COLUMN resolved_at, DROP COLUMN closed_at, DROP COLUMN escalated_at, DROP COLUMN escalation_note, DROP COLUMN version;
ALTER TABLE help_articles DROP COLUMN title, DROP COLUMN body, DROP COLUMN category,
 DROP COLUMN author_id, DROP COLUMN version, DROP COLUMN search_text;
ALTER TABLE support_tickets RENAME COLUMN id TO ticket_id;
ALTER TABLE support_tickets RENAME COLUMN target_id TO target_user_id;
ALTER TABLE ticket_audit_events RENAME COLUMN id TO audit_event_id;
ALTER TABLE help_articles RENAME COLUMN id TO article_id;
-- Match the mapped Prisma FK name while retaining its deferred publication validation.
ALTER TABLE help_articles RENAME CONSTRAINT help_articles_id_published_version_fkey TO help_articles_article_id_published_version_fkey;

CREATE INDEX ticket_audit_events_state ON ticket_audit_events(ticket_id,event_type,created_at DESC,audit_event_id DESC);
CREATE UNIQUE INDEX ticket_audit_events_sla_cycle_key ON ticket_audit_events(ticket_id,((payload->>'cycle')::int))
 WHERE event_type IN ('TICKET_OPENED','TICKET_REOPENED');
ALTER TABLE ticket_audit_events ADD CONSTRAINT sla_round_shape CHECK (
 event_type NOT IN ('TICKET_OPENED','TICKET_REOPENED') OR COALESCE(
   jsonb_typeof(payload->'targets')='array' AND jsonb_array_length(payload->'targets')>0
   AND jsonb_typeof(payload->'cycle')='number' AND (payload->>'cycle')::int>0
   AND jsonb_typeof(payload->'startedAt')='string',false));
-- JSON target references are written atomically with their targets by ticketModel.
-- Target ticket/policy FKs and the unique event-cycle index remain database-enforced.
-- No relation-wide deferred validation scans: they introduce cross-ticket SSI conflicts.
COMMIT;
