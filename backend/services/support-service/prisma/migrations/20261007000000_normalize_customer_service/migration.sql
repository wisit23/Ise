-- Additive normalization of the human ER. Preserve original rows and legacy projections.
BEGIN;
CREATE TABLE "ticket_categories" (
    "ticket_category_id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name_th" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("ticket_category_id")
);

CREATE TABLE "ticket_priorities" (
    "ticket_priority_id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "rank" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_priorities_pkey" PRIMARY KEY ("ticket_priority_id")
);

CREATE TABLE "ticket_statuses" (
    "ticket_status_id" SMALLSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_statuses_pkey" PRIMARY KEY ("ticket_status_id")
);

CREATE TABLE "sla_policies" (
    "sla_policy_id" TEXT NOT NULL,
    "ticket_category_id" SMALLINT,
    "ticket_priority_id" SMALLINT NOT NULL,
    "first_response_minutes" INTEGER NOT NULL,
    "resolution_minutes" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("sla_policy_id")
);

CREATE TABLE "ticket_assignments" (
    "assignment_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,

    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("assignment_id")
);

CREATE TABLE "ticket_status_history" (
    "status_history_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "from_status_id" SMALLINT,
    "to_status_id" SMALLINT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_status_history_pkey" PRIMARY KEY ("status_history_id")
);

CREATE TABLE "ticket_sla_targets" (
    "sla_target_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sla_policy_id" TEXT NOT NULL,
    "metric_type" VARCHAR(30) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "achieved_at" TIMESTAMPTZ(3),
    "breached_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_sla_targets_pkey" PRIMARY KEY ("sla_target_id")
);

CREATE TABLE "ticket_chat_links" (
    "ticket_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_chat_links_pkey" PRIMARY KEY ("ticket_id")
);

CREATE TABLE "ticket_audit_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "help_categories" (
    "help_category_id" SMALLSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "help_categories_pkey" PRIMARY KEY ("help_category_id")
);

CREATE TABLE "help_article_revisions" (
    "article_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "help_category_id" SMALLINT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_article_revisions_pkey" PRIMARY KEY ("article_id","version")
);
ALTER TABLE support_tickets
 ADD COLUMN ticket_category_id SMALLINT,
 ADD COLUMN ticket_priority_id SMALLINT,
 ADD COLUMN current_status_id SMALLINT,
 ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 0,
 ALTER COLUMN category SET DEFAULT '',
 ALTER COLUMN status SET DEFAULT 'NEW',
 ALTER COLUMN priority SET DEFAULT 'NORMAL';
ALTER TABLE help_articles ADD COLUMN published_version INTEGER,
 ADD COLUMN created_by_id TEXT,
 ALTER COLUMN title SET DEFAULT '',
 ALTER COLUMN body SET DEFAULT '',
 ALTER COLUMN category SET DEFAULT '',
 ALTER COLUMN author_id SET DEFAULT '';
ALTER TABLE ticket_sla_targets ADD COLUMN cycle INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "support_tickets" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "sla_due_at" TYPE TIMESTAMPTZ(3) USING "sla_due_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "first_response_at" TYPE TIMESTAMPTZ(3) USING "first_response_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "resolved_at" TYPE TIMESTAMPTZ(3) USING "resolved_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "closed_at" TYPE TIMESTAMPTZ(3) USING "closed_at" AT TIME ZONE 'UTC';
ALTER TABLE "support_tickets" ALTER COLUMN "escalated_at" TYPE TIMESTAMPTZ(3) USING "escalated_at" AT TIME ZONE 'UTC';
ALTER TABLE "ticket_messages" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "ticket_audit_logs" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "help_articles" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "help_articles" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "help_articles" ALTER COLUMN "published_at" TYPE TIMESTAMPTZ(3) USING "published_at" AT TIME ZONE 'UTC';
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_categories_code_key" ON "ticket_categories"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_priorities_code_key" ON "ticket_priorities"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_priorities_rank_key" ON "ticket_priorities"("rank");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_statuses_code_key" ON "ticket_statuses"("code");
CREATE INDEX IF NOT EXISTS "sla_policies_ticket_category_id_ticket_priority_id_effectiv_idx" ON "sla_policies"("ticket_category_id", "ticket_priority_id", "effective_from");
CREATE INDEX IF NOT EXISTS "sla_policies_ticket_priority_id_idx" ON "sla_policies"("ticket_priority_id");
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");
CREATE INDEX IF NOT EXISTS "support_tickets_current_status_id_ticket_priority_id_create_idx" ON "support_tickets"("current_status_id", "ticket_priority_id", "created_at");
CREATE INDEX IF NOT EXISTS "support_tickets_requester_id_created_at_idx" ON "support_tickets"("requester_id", "created_at");
CREATE INDEX IF NOT EXISTS "support_tickets_ticket_category_id_idx" ON "support_tickets"("ticket_category_id");
CREATE INDEX IF NOT EXISTS "support_tickets_ticket_priority_id_idx" ON "support_tickets"("ticket_priority_id");
CREATE INDEX IF NOT EXISTS "ticket_assignments_ticket_id_assigned_at_idx" ON "ticket_assignments"("ticket_id", "assigned_at");
CREATE INDEX IF NOT EXISTS "ticket_assignments_assignee_id_ended_at_idx" ON "ticket_assignments"("assignee_id", "ended_at");
CREATE INDEX IF NOT EXISTS "ticket_status_history_ticket_id_created_at_idx" ON "ticket_status_history"("ticket_id", "created_at");
CREATE INDEX IF NOT EXISTS "ticket_status_history_from_status_id_idx" ON "ticket_status_history"("from_status_id");
CREATE INDEX IF NOT EXISTS "ticket_status_history_to_status_id_idx" ON "ticket_status_history"("to_status_id");
CREATE INDEX IF NOT EXISTS "ticket_sla_targets_sla_policy_id_idx" ON "ticket_sla_targets"("sla_policy_id");
CREATE INDEX IF NOT EXISTS "ticket_sla_targets_metric_type_due_at_idx" ON "ticket_sla_targets"("metric_type", "due_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_sla_targets_ticket_id_metric_type_cycle_key" ON "ticket_sla_targets"("ticket_id", "metric_type", "cycle");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_chat_links_conversation_id_key" ON "ticket_chat_links"("conversation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_messages_chat_message_id_key" ON "ticket_messages"("chat_message_id");
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages"("ticket_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_audit_events_dedupe_key_key" ON "ticket_audit_events"("dedupe_key");
CREATE INDEX IF NOT EXISTS "ticket_audit_events_ticket_id_created_at_idx" ON "ticket_audit_events"("ticket_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "help_categories_code_key" ON "help_categories"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "help_articles_slug_key" ON "help_articles"("slug");
CREATE INDEX IF NOT EXISTS "help_articles_status_idx" ON "help_articles"("status");
CREATE INDEX IF NOT EXISTS "help_article_revisions_help_category_id_idx" ON "help_article_revisions"("help_category_id");
CREATE INDEX IF NOT EXISTS "help_article_revisions_search_text_idx" ON "help_article_revisions" USING GIN ("search_text" gin_trgm_ops);

INSERT INTO ticket_categories(code,name_th,name_en,updated_at)
 VALUES ('ORDER','คำสั่งซื้อ','Order',now()),('PAYMENT','การชำระเงิน','Payment',now()),
 ('ACCOUNT','บัญชีผู้ใช้','Account',now()),('TECHNICAL','ปัญหาทางเทคนิค','Technical',now()),('OTHER','อื่น ๆ','Other',now());
INSERT INTO ticket_categories(code,name_th,updated_at)
 SELECT DISTINCT category,category,now() FROM support_tickets ON CONFLICT(code) DO NOTHING;
INSERT INTO ticket_priorities(code,name,rank,updated_at)
 VALUES ('LOW','LOW',1,now()),('NORMAL','NORMAL',2,now()),('HIGH','HIGH',3,now()),('URGENT','URGENT',4,now());
INSERT INTO ticket_priorities(code,name,rank,updated_at)
 SELECT code,code,100+row_number() OVER (ORDER BY code),now()
 FROM (SELECT DISTINCT priority AS code FROM support_tickets WHERE priority NOT IN ('LOW','NORMAL','HIGH','URGENT')) x;
INSERT INTO ticket_statuses(code,name,is_terminal,sort_order,updated_at)
 VALUES ('NEW','NEW',false,0,now()),('ASSIGNED','ASSIGNED',false,1,now()),
 ('IN_PROGRESS','IN_PROGRESS',false,2,now()),('PENDING_USER','PENDING_USER',false,3,now()),
 ('ESCALATED','ESCALATED',false,4,now()),('RESOLVED','RESOLVED',false,5,now()),('CLOSED','CLOSED',true,6,now());
INSERT INTO ticket_statuses(code,name,sort_order,updated_at)
 SELECT code,code,100,now() FROM (
 SELECT status AS code FROM support_tickets
 UNION SELECT from_value FROM ticket_audit_logs WHERE action='STATUS_CHANGE' AND from_value IS NOT NULL
 UNION SELECT to_value FROM ticket_audit_logs WHERE action='STATUS_CHANGE' AND to_value IS NOT NULL
 ) x ON CONFLICT(code) DO NOTHING;
INSERT INTO help_categories(code,name_th,name_en,updated_at)
 SELECT code,name_th,name_en,now() FROM ticket_categories;
INSERT INTO help_categories(code,name_th,updated_at)
 SELECT DISTINCT category,category,now() FROM help_articles ON CONFLICT(code) DO NOTHING;
INSERT INTO sla_policies(sla_policy_id,ticket_priority_id,first_response_minutes,resolution_minutes,effective_from)
 SELECT 'sla-default-'||code||'-v1',ticket_priority_id,
 CASE code WHEN 'LOW' THEN 4320 WHEN 'HIGH' THEN 240 WHEN 'URGENT' THEN 60 ELSE 1440 END,
 CASE code WHEN 'LOW' THEN 4320 WHEN 'HIGH' THEN 240 WHEN 'URGENT' THEN 60 ELSE 1440 END,
 '1970-01-01T00:00:00Z'::timestamptz FROM ticket_priorities;
UPDATE support_tickets t SET ticket_category_id=c.ticket_category_id,
 ticket_priority_id=p.ticket_priority_id,current_status_id=s.ticket_status_id,lock_version=t.version
 FROM ticket_categories c,ticket_priorities p,ticket_statuses s
 WHERE c.code=t.category AND p.code=t.priority AND s.code=t.status;
ALTER TABLE support_tickets ALTER COLUMN ticket_category_id SET NOT NULL,
 ALTER COLUMN ticket_priority_id SET NOT NULL, ALTER COLUMN current_status_id SET NOT NULL;
CREATE SEQUENCE support_ticket_number_seq;
SELECT setval('support_ticket_number_seq',
 GREATEST(COALESCE((SELECT max(substring(ticket_number from '^#CS-([0-9]+)$')::bigint) FROM support_tickets),0)+1,1),false);
CREATE FUNCTION next_support_ticket_number() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT '#CS-' || CASE WHEN n<1000000 THEN lpad(n::text,6,'0') ELSE n::text END
 FROM (SELECT nextval('support_ticket_number_seq') AS n) value;
$$;
ALTER TABLE support_tickets ALTER COLUMN ticket_number SET DEFAULT next_support_ticket_number();
INSERT INTO ticket_assignments(assignment_id,ticket_id,assignee_id,assigned_by_id,assigned_at,ended_at,end_reason)
 SELECT 'legacy-assignment:'||id,id,assignee_id,'migration:legacy',created_at,
 CASE WHEN status='CLOSED' THEN COALESCE(closed_at,updated_at) END,
 CASE WHEN status='CLOSED' THEN 'Legacy closed ticket' END
 FROM support_tickets WHERE assignee_id IS NOT NULL;
INSERT INTO ticket_status_history(status_history_id,ticket_id,from_status_id,to_status_id,changed_by_id,reason,created_at)
 SELECT 'legacy-audit:'||a.id,a.ticket_id,f.ticket_status_id,t.ticket_status_id,a.actor_id,a.reason,a.created_at
 FROM ticket_audit_logs a LEFT JOIN ticket_statuses f ON f.code=a.from_value
 JOIN ticket_statuses t ON t.code=a.to_value WHERE a.action='STATUS_CHANGE';
INSERT INTO ticket_status_history(status_history_id,ticket_id,to_status_id,changed_by_id,reason,created_at)
 SELECT 'legacy-initial:'||t.id,t.id,s.ticket_status_id,t.requester_id,'Migrated initial state',t.created_at
 FROM support_tickets t JOIN ticket_statuses s ON s.code='NEW'
 WHERE NOT EXISTS(SELECT 1 FROM ticket_status_history h WHERE h.ticket_id=t.id AND h.from_status_id IS NULL AND h.to_status_id=s.ticket_status_id);
INSERT INTO ticket_status_history(status_history_id,ticket_id,to_status_id,changed_by_id,reason,created_at)
 SELECT 'legacy-milestone:'||t.id||':'||m.code,t.id,s.ticket_status_id,'migration:legacy',
 CASE WHEN m.code='ESCALATED' THEN COALESCE(t.escalation_note,'Migrated legacy timestamp') ELSE 'Migrated legacy timestamp' END,m.at
 FROM support_tickets t CROSS JOIN LATERAL
 (VALUES ('RESOLVED',t.resolved_at),('CLOSED',t.closed_at),('ESCALATED',t.escalated_at)) m(code,at)
 JOIN ticket_statuses s ON s.code=m.code
 WHERE m.at IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM ticket_status_history h WHERE h.ticket_id=t.id AND h.to_status_id=s.ticket_status_id AND h.created_at=m.at);
INSERT INTO ticket_status_history(status_history_id,ticket_id,to_status_id,changed_by_id,reason,created_at)
 SELECT 'legacy-current:'||t.id,t.id,t.current_status_id,'migration:legacy','Migrated current state; earlier history may be incomplete',t.updated_at
 FROM support_tickets t WHERE NOT EXISTS(SELECT 1 FROM ticket_status_history h WHERE h.ticket_id=t.id AND h.to_status_id=t.current_status_id);
INSERT INTO ticket_sla_targets(sla_target_id,ticket_id,sla_policy_id,metric_type,due_at,achieved_at,breached_at,updated_at)
 SELECT 'legacy-sla:'||t.id||':'||m.type,t.id,p.sla_policy_id,m.type,
 COALESCE(t.sla_due_at,t.created_at+(CASE WHEN m.type='FIRST_RESPONSE' THEN p.first_response_minutes ELSE p.resolution_minutes END)*interval '1 minute'),
 CASE WHEN m.type='FIRST_RESPONSE' THEN t.first_response_at ELSE COALESCE(t.resolved_at,t.closed_at) END,
 CASE WHEN t.sla_due_at <= t.escalated_at THEN t.escalated_at END,t.updated_at
 FROM support_tickets t JOIN sla_policies p ON p.ticket_priority_id=t.ticket_priority_id
 CROSS JOIN (VALUES ('FIRST_RESPONSE'),('RESOLUTION')) m(type);
DO $$ BEGIN
 IF EXISTS(SELECT conversation_id FROM support_tickets WHERE conversation_id IS NOT NULL GROUP BY conversation_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Duplicate conversation IDs: resolve ticket ownership before normalizing chat links'; END IF;
END $$;
INSERT INTO ticket_chat_links(ticket_id,conversation_id,linked_at)
 SELECT id,conversation_id,created_at FROM support_tickets WHERE conversation_id IS NOT NULL;
INSERT INTO ticket_audit_events(id,ticket_id,actor_id,event_type,dedupe_key,payload,created_at)
 SELECT id,ticket_id,actor_id,action,dedupe_key,
 jsonb_build_object('fromValue',from_value,'toValue',to_value,'reason',reason),created_at FROM ticket_audit_logs;
UPDATE help_articles SET created_by_id=author_id;
INSERT INTO help_article_revisions(article_id,version,help_category_id,title,body,author_id,search_text,created_at)
 SELECT a.id,GREATEST(a.version,1),c.help_category_id,a.title,a.body,a.author_id,
 concat_ws(' ',a.title,a.body,c.code),a.updated_at
 FROM help_articles a JOIN help_categories c ON c.code=a.category;
UPDATE help_articles SET published_version=GREATEST(version,1) WHERE status='PUBLISHED';
ALTER TABLE help_articles ALTER COLUMN created_by_id SET NOT NULL;

ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_ticket_category_id_fkey" FOREIGN KEY ("ticket_category_id") REFERENCES "ticket_categories"("ticket_category_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_ticket_priority_id_fkey" FOREIGN KEY ("ticket_priority_id") REFERENCES "ticket_priorities"("ticket_priority_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_ticket_category_id_fkey" FOREIGN KEY ("ticket_category_id") REFERENCES "ticket_categories"("ticket_category_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_ticket_priority_id_fkey" FOREIGN KEY ("ticket_priority_id") REFERENCES "ticket_priorities"("ticket_priority_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_current_status_id_fkey" FOREIGN KEY ("current_status_id") REFERENCES "ticket_statuses"("ticket_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "ticket_statuses"("ticket_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "ticket_statuses"("ticket_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_sla_targets" ADD CONSTRAINT "ticket_sla_targets_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_sla_targets" ADD CONSTRAINT "ticket_sla_targets_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("sla_policy_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_chat_links" ADD CONSTRAINT "ticket_chat_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_audit_events" ADD CONSTRAINT "ticket_audit_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_id_published_version_fkey" FOREIGN KEY ("id", "published_version") REFERENCES "help_article_revisions"("article_id", "version") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "help_article_revisions" ADD CONSTRAINT "help_article_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "help_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "help_article_revisions" ADD CONSTRAINT "help_article_revisions_help_category_id_fkey" FOREIGN KEY ("help_category_id") REFERENCES "help_categories"("help_category_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX ticket_assignments_one_active ON ticket_assignments(ticket_id) WHERE ended_at IS NULL;
CREATE INDEX ticket_sla_targets_pending_due ON ticket_sla_targets(due_at,ticket_id) WHERE achieved_at IS NULL AND breached_at IS NULL;
ALTER TABLE sla_policies ADD CONSTRAINT sla_policy_positive_minutes CHECK(first_response_minutes>0 AND resolution_minutes>0),
 ADD CONSTRAINT sla_policy_effective_window CHECK(effective_to IS NULL OR effective_to>effective_from);
ALTER TABLE ticket_assignments ADD CONSTRAINT assignment_time_window CHECK(ended_at IS NULL OR ended_at>=assigned_at);
ALTER TABLE ticket_sla_targets ADD CONSTRAINT sla_metric_type CHECK(metric_type IN ('FIRST_RESPONSE','RESOLUTION'));
ALTER TABLE ticket_sla_targets ADD CONSTRAINT sla_positive_cycle CHECK(cycle>0);
ALTER TABLE ticket_messages ADD CONSTRAINT ticket_message_role CHECK(author_role IN ('REQUESTER','AGENT','SYSTEM'));
ALTER TABLE help_article_revisions ADD CONSTRAINT revision_positive_version CHECK(version>0);
ALTER TABLE help_articles ADD CONSTRAINT help_publication_state CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED') AND (status<>'PUBLISHED' OR published_version IS NOT NULL));
-- Legacy columns remain as rollback projections. Only normalized relations are authoritative.
CREATE FUNCTION support_ticket_legacy_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT code INTO NEW.category FROM ticket_categories WHERE ticket_category_id=NEW.ticket_category_id;
 SELECT code INTO NEW.priority FROM ticket_priorities WHERE ticket_priority_id=NEW.ticket_priority_id;
 SELECT code INTO NEW.status FROM ticket_statuses WHERE ticket_status_id=NEW.current_status_id;
 NEW.version:=NEW.lock_version;
 RETURN NEW;
END $$;
CREATE TRIGGER support_ticket_legacy_projection BEFORE INSERT OR UPDATE ON support_tickets
 FOR EACH ROW EXECUTE FUNCTION support_ticket_legacy_projection();
CREATE FUNCTION support_child_legacy_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text;
BEGIN
 tid:=COALESCE(NEW.ticket_id,OLD.ticket_id);
 IF TG_TABLE_NAME='ticket_assignments' THEN
   UPDATE support_tickets SET assignee_id=(SELECT assignee_id FROM ticket_assignments WHERE ticket_id=tid AND ended_at IS NULL) WHERE id=tid;
 ELSIF TG_TABLE_NAME='ticket_chat_links' THEN
   UPDATE support_tickets SET conversation_id=(SELECT conversation_id FROM ticket_chat_links WHERE ticket_id=tid) WHERE id=tid;
 ELSIF TG_TABLE_NAME='ticket_sla_targets' THEN
   UPDATE support_tickets SET
     sla_due_at=(SELECT due_at FROM ticket_sla_targets WHERE ticket_id=tid AND achieved_at IS NULL ORDER BY due_at LIMIT 1),
     first_response_at=(SELECT achieved_at FROM ticket_sla_targets WHERE ticket_id=tid AND metric_type='FIRST_RESPONSE')
   WHERE id=tid;
 ELSIF TG_TABLE_NAME='ticket_status_history' THEN
   UPDATE support_tickets SET
     resolved_at=(SELECT h.created_at FROM ticket_status_history h JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id WHERE h.ticket_id=tid AND s.code='RESOLVED' ORDER BY h.created_at DESC LIMIT 1),
     closed_at=(SELECT h.created_at FROM ticket_status_history h JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id WHERE h.ticket_id=tid AND s.code='CLOSED' ORDER BY h.created_at DESC LIMIT 1),
     escalated_at=(SELECT h.created_at FROM ticket_status_history h JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id WHERE h.ticket_id=tid AND s.code='ESCALATED' ORDER BY h.created_at DESC LIMIT 1),
     escalation_note=(SELECT h.reason FROM ticket_status_history h JOIN ticket_statuses s ON s.ticket_status_id=h.to_status_id WHERE h.ticket_id=tid AND s.code='ESCALATED' ORDER BY h.created_at DESC LIMIT 1)
   WHERE id=tid;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER assignment_legacy_projection AFTER INSERT OR UPDATE OR DELETE ON ticket_assignments FOR EACH ROW EXECUTE FUNCTION support_child_legacy_projection();
CREATE TRIGGER chat_link_legacy_projection AFTER INSERT OR UPDATE OR DELETE ON ticket_chat_links FOR EACH ROW EXECUTE FUNCTION support_child_legacy_projection();
CREATE TRIGGER sla_legacy_projection AFTER INSERT OR UPDATE OR DELETE ON ticket_sla_targets FOR EACH ROW EXECUTE FUNCTION support_child_legacy_projection();
CREATE TRIGGER history_legacy_projection AFTER INSERT OR UPDATE OR DELETE ON ticket_status_history FOR EACH ROW EXECUTE FUNCTION support_child_legacy_projection();
CREATE FUNCTION audit_legacy_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO ticket_audit_logs(id,ticket_id,actor_id,action,from_value,to_value,reason,dedupe_key,created_at)
 VALUES (NEW.id,NEW.ticket_id,NEW.actor_id,NEW.event_type,NEW.payload->>'fromValue',NEW.payload->>'toValue',NEW.payload->>'reason',NEW.dedupe_key,NEW.created_at)
 ON CONFLICT(id) DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER audit_legacy_projection AFTER INSERT ON ticket_audit_events FOR EACH ROW EXECUTE FUNCTION audit_legacy_projection();
CREATE FUNCTION help_revision_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.search_text:=concat_ws(' ',NEW.title,NEW.body,(SELECT code FROM help_categories WHERE help_category_id=NEW.help_category_id));
 RETURN NEW;
END $$;
CREATE TRIGGER help_revision_search_text BEFORE INSERT OR UPDATE ON help_article_revisions FOR EACH ROW EXECUTE FUNCTION help_revision_search_text();
CREATE FUNCTION help_article_legacy_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
 NEW.author_id:=NEW.created_by_id;
 IF NEW.published_version IS NOT NULL THEN
   SELECT v.*,c.code INTO r FROM help_article_revisions v JOIN help_categories c USING(help_category_id)
   WHERE v.article_id=NEW.id AND v.version=NEW.published_version;
   IF FOUND THEN NEW.title:=r.title; NEW.body:=r.body; NEW.category:=r.code; NEW.version:=r.version; NEW.search_text:=r.search_text; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER help_article_legacy_projection BEFORE INSERT OR UPDATE ON help_articles FOR EACH ROW EXECUTE FUNCTION help_article_legacy_projection();
CREATE FUNCTION help_draft_legacy_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE help_articles SET title=NEW.title,body=NEW.body,
 category=(SELECT code FROM help_categories WHERE help_category_id=NEW.help_category_id),
 version=NEW.version,search_text=NEW.search_text
 WHERE id=NEW.article_id AND published_version IS NULL;
 RETURN NULL;
END $$;
CREATE TRIGGER help_draft_legacy_projection AFTER INSERT ON help_article_revisions FOR EACH ROW EXECUTE FUNCTION help_draft_legacy_projection();

COMMIT;
