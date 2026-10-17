BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE auction_rounds,auction_items,marketing_audit_logs IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE auction_state_before ON COMMIT DROP AS
 SELECT DISTINCT ON(entity_type,entity_id) entity_type,entity_id,metadata->'erFields' AS fields
 FROM marketing_audit_logs WHERE action IN('ER_STATE_IMPORT','ER_STATE_SNAPSHOT')
 ORDER BY entity_type,entity_id,created_at DESC,id DESC;
ALTER TABLE auction_rounds ADD COLUMN title TEXT NOT NULL DEFAULT '',ADD COLUMN categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN cancellation_reason TEXT,ADD COLUMN cancelled_at TIMESTAMP(3),ADD COLUMN cancelled_by TEXT;
ALTER TABLE auction_items ADD COLUMN cancellation_reason TEXT,ADD COLUMN cancelled_at TIMESTAMP(3),ADD COLUMN cancelled_by TEXT;
UPDATE auction_rounds r SET title=COALESCE(s.fields->>'title',''),
 categories=COALESCE(ARRAY(SELECT jsonb_array_elements_text(s.fields->'categories')),ARRAY[]::TEXT[]),
 cancellation_reason=s.fields->>'cancellationReason',cancelled_at=(s.fields->>'cancelledAt')::timestamp(3),cancelled_by=s.fields->>'cancelledBy'
 FROM auction_state_before s WHERE s.entity_type='AUCTION_ROUND' AND s.entity_id=r.id;
UPDATE auction_items a SET cancellation_reason=s.fields->>'cancellationReason',cancelled_at=(s.fields->>'cancelledAt')::timestamp(3),cancelled_by=s.fields->>'cancelledBy'
 FROM auction_state_before s WHERE s.entity_type='AUCTION_ITEM' AND s.entity_id=a.id;
-- A dedicated result receipt, with no cascading product FK, preserves replay
-- even when the target product has subsequently been deleted.
CREATE TABLE product_moderation_commands (
 idempotency_key TEXT PRIMARY KEY,action TEXT NOT NULL,product_id TEXT NOT NULL,payload_hash TEXT NOT NULL,
 result JSONB NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(action IN('REMOVE_PRODUCT','RESTORE_PRODUCT')));
INSERT INTO product_moderation_commands SELECT idempotency_key,action,entity_id,metadata->>'payloadHash',metadata->'result',created_at
 FROM marketing_audit_logs WHERE entity_type='PRODUCT_MODERATION' AND idempotency_key IS NOT NULL;
CREATE INDEX product_moderation_commands_product_id_created_at_idx ON product_moderation_commands(product_id,created_at);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM marketing_audit_logs l LEFT JOIN product_moderation_commands c USING(idempotency_key)
 WHERE l.entity_type='PRODUCT_MODERATION' AND l.idempotency_key IS NOT NULL
 AND (c.idempotency_key IS NULL OR ROW(c.action,c.product_id,c.payload_hash,c.result,c.created_at)
 IS DISTINCT FROM ROW(l.action,l.entity_id,l.metadata->>'payloadHash',l.metadata->'result',l.created_at))) THEN
 RAISE EXCEPTION 'Operational Product cutover blocked: moderation receipt mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM auction_state_before s JOIN auction_rounds r ON s.entity_type='AUCTION_ROUND' AND s.entity_id=r.id
 WHERE ROW(r.title,to_jsonb(r.categories),r.cancellation_reason,r.cancelled_at,r.cancelled_by)
 IS DISTINCT FROM ROW(COALESCE(s.fields->>'title',''),COALESCE(s.fields->'categories','[]'::jsonb),s.fields->>'cancellationReason',(s.fields->>'cancelledAt')::timestamp(3),s.fields->>'cancelledBy')) OR
 EXISTS(SELECT 1 FROM auction_state_before s JOIN auction_items a ON s.entity_type='AUCTION_ITEM' AND s.entity_id=a.id
 WHERE ROW(a.cancellation_reason,a.cancelled_at,a.cancelled_by) IS DISTINCT FROM
 ROW(s.fields->>'cancellationReason',(s.fields->>'cancelledAt')::timestamp(3),s.fields->>'cancelledBy')) THEN
 RAISE EXCEPTION 'Operational Product cutover blocked: auction state mismatch'; END IF;
END $$;
-- Defaults reflect runtime defaults; audit history is unchanged.
COMMIT;
