BEGIN;
-- Never discard a legacy budget balance that does not reconcile to immutable facts.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM campaigns c LEFT JOIN (
   SELECT campaign_id, SUM(discount_amount) AS spent FROM campaign_attributions GROUP BY campaign_id
  ) a ON a.campaign_id=c.id WHERE c.spent_budget <> COALESCE(a.spent,0)
 ) THEN RAISE EXCEPTION 'Product ER migration blocked: spent_budget differs from attribution SUM; investigate before retry'; END IF;
 IF EXISTS (
  SELECT 1 FROM product_moderation_commands c JOIN marketing_audit_logs l ON l.idempotency_key=c.idempotency_key
 ) THEN RAISE EXCEPTION 'Product ER migration blocked: moderation/audit idempotency key collision'; END IF;
END $$;
-- No previous state or original actor was retained by the old command table.
-- Preserve only what is known. Import provenance is not historical authorship.
INSERT INTO marketing_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,new_state,metadata,idempotency_key,created_at)
SELECT gen_random_uuid()::text,'LEGACY_IMPORT','SYSTEM',action,'PRODUCT_MODERATION',product_id,result,
 jsonb_build_object('payloadHash',payload_hash,'result',result,'provenance','product_moderation_commands','originalActorKnown',false),idempotency_key,created_at
FROM product_moderation_commands;
-- Current-state imports, captured now; NOT fabricated create/cancel events.
INSERT INTO marketing_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
SELECT gen_random_uuid()::text,'LEGACY_IMPORT','SYSTEM','ER_STATE_IMPORT','AUCTION_ROUND',id,
 jsonb_build_object('provenance','auction_rounds current snapshot','erFields',jsonb_build_object('title',title,'categories',categories,'cancellationReason',cancellation_reason,'cancelledAt',to_char(cancelled_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cancelledBy',cancelled_by))
FROM auction_rounds;
INSERT INTO marketing_audit_logs(id,actor_id,actor_role,action,entity_type,entity_id,metadata)
SELECT gen_random_uuid()::text,'LEGACY_IMPORT','SYSTEM','ER_STATE_IMPORT','AUCTION_ITEM',id,
 jsonb_build_object('provenance','auction_items current snapshot','erFields',jsonb_build_object('cancellationReason',cancellation_reason,'cancelledAt',to_char(cancelled_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cancelledBy',cancelled_by))
FROM auction_items;
DROP TABLE product_moderation_commands;
ALTER TABLE campaigns DROP COLUMN spent_budget;
ALTER TABLE auction_items DROP COLUMN cancellation_reason, DROP COLUMN cancelled_at, DROP COLUMN cancelled_by;
ALTER TABLE auction_rounds DROP COLUMN title, DROP COLUMN categories, DROP COLUMN cancellation_reason, DROP COLUMN cancelled_at, DROP COLUMN cancelled_by;
COMMIT;
