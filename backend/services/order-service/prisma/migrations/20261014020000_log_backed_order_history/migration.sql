BEGIN;
-- Imported state is labelled as import, not a fabricated historical event.
-- Refuse an unrepresentable checkout instead of dropping its address/totals.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM checkouts c LEFT JOIN orders o ON o.checkout_id=c.checkout_id
    GROUP BY c.checkout_id HAVING count(o.order_id)=0
      OR c.original_amount <> COALESCE(sum(o.original_amount),0)
      OR c.orders_amount <> COALESCE(sum(o.orders_amount),0)) THEN
    RAISE EXCEPTION 'Order history cutover blocked: checkout without linked orders or stored totals differing from linked order amounts; review preserving mapping first';
  END IF;
  IF EXISTS (SELECT 1 FROM attribution_outbox_events a JOIN order_log l ON l.order_log_id=a.id) THEN
    RAISE EXCEPTION 'Order history cutover blocked: outbox event ID collides with existing order log ID';
  END IF;
END $$;

INSERT INTO order_log(order_log_id,order_id,seller_id,buyer_id,actor_id,action,detail,created_at)
SELECT 'order-history-import:'||order_id,order_id,seller_id,buyer_id,buyer_id,'ORDER_HISTORY_STATE',
 jsonb_build_object('schema_version',1,'entity_id',order_id,'revision',1,'source','legacy_import',
   'state',jsonb_build_object('productTitle',product_title,'campaignCode',campaign_code,'preDisputeStatus',pre_dispute_status))::text,CURRENT_TIMESTAMP
FROM orders;

INSERT INTO order_log(order_log_id,order_id,seller_id,buyer_id,actor_id,action,detail,created_at)
SELECT 'checkout-address-import:'||c.checkout_id,o.order_id,o.seller_id,o.buyer_id,o.buyer_id,'CHECKOUT_ADDRESS_STATE',
 jsonb_build_object('schema_version',1,'entity_id',c.checkout_id,'revision',1,'source','legacy_import',
 'address_id',c.address_id,'state',jsonb_build_object('addressSnapshot',c.address_snapshot))::text,CURRENT_TIMESTAMP
FROM checkouts c JOIN LATERAL (SELECT * FROM orders WHERE checkout_id=c.checkout_id ORDER BY order_id LIMIT 1) o ON true;

INSERT INTO order_log(order_log_id,order_id,seller_id,buyer_id,actor_id,action,detail,created_at)
SELECT 'shipping-address-import:'||s.shipping_id,o.order_id,o.seller_id,o.buyer_id,o.buyer_id,'SHIPPING_ADDRESS_STATE',
 jsonb_build_object('schema_version',1,'entity_id',s.shipping_id,'revision',1,'source','legacy_import',
 'address_id',s.address_id,'state',jsonb_build_object('addressSnapshot',s.address_snapshot))::text,CURRENT_TIMESTAMP
FROM shipping s JOIN orders o ON o.order_id=s.order_id;

INSERT INTO order_log(order_log_id,order_id,seller_id,buyer_id,actor_id,action,detail,created_at)
SELECT a.id,o.order_id,o.seller_id,o.buyer_id,o.buyer_id,'ATTRIBUTION_REQUESTED',
 jsonb_build_object('schema_version',1,'source','legacy_import','campaignId',a.campaign_id,
 'grossAmount',a.gross_amount::text,'discountAmount',a.discount_amount::text,'netAmount',a.net_amount::text,
 'completedAt',a.completed_at,'attempts',a.attempts,'lastError',a.last_error,'nextAttemptAt',a.next_attempt_at)::text,a.created_at
FROM attribution_outbox_events a JOIN orders o ON o.order_id=a.order_id;

INSERT INTO order_log(order_log_id,order_id,seller_id,buyer_id,actor_id,action,detail,created_at)
SELECT a.id||':ack',o.order_id,o.seller_id,o.buyer_id,o.buyer_id,'ATTRIBUTION_ACK',
 jsonb_build_object('schema_version',1,'source','legacy_import','eventId',a.id,'attempts',a.attempts,'processedAt',a.processed_at)::text,a.processed_at
FROM attribution_outbox_events a JOIN orders o ON o.order_id=a.order_id WHERE a.processed_at IS NOT NULL;

CREATE UNIQUE INDEX order_log_attribution_job_order_key ON order_log(order_id) WHERE action='ATTRIBUTION_REQUESTED';
CREATE UNIQUE INDEX order_log_attribution_ack_event_key ON order_log((detail::jsonb->>'eventId')) WHERE action='ATTRIBUTION_ACK';
CREATE UNIQUE INDEX order_log_history_entity_revision_idx ON order_log(action,(detail::jsonb->>'entity_id'),((detail::jsonb->>'revision')::bigint))
 WHERE action IN ('ORDER_HISTORY_STATE','SHIPPING_ADDRESS_STATE','CHECKOUT_ADDRESS_STATE');
CREATE INDEX order_log_attribution_result_event_idx ON order_log(action,(detail::jsonb->>'eventId'))
 WHERE action IN ('ATTRIBUTION_ACK','ATTRIBUTION_RETRY');

CREATE VIEW order_attribution_jobs AS
SELECT j.order_log_id AS id,j.order_id,j.detail::jsonb->>'campaignId' AS campaign_id,
 (j.detail::jsonb->>'grossAmount')::numeric(18,2) AS gross_amount,
 (j.detail::jsonb->>'discountAmount')::numeric(18,2) AS discount_amount,
 (j.detail::jsonb->>'netAmount')::numeric(18,2) AS net_amount,
 (j.detail::jsonb->>'completedAt')::timestamptz AS completed_at,
 COALESCE((ack.detail::jsonb->>'attempts')::int,(retry.detail::jsonb->>'attempts')::int,(j.detail::jsonb->>'attempts')::int,0) AS attempts,
 CASE WHEN ack.order_log_id IS NOT NULL THEN NULL ELSE COALESCE(retry.detail::jsonb->>'lastError',j.detail::jsonb->>'lastError') END AS last_error,
 COALESCE((retry.detail::jsonb->>'nextAttemptAt')::timestamptz,(j.detail::jsonb->>'nextAttemptAt')::timestamptz,j.created_at) AS next_attempt_at,
 (ack.detail::jsonb->>'processedAt')::timestamptz AS processed_at,j.created_at
FROM order_log j
LEFT JOIN LATERAL (SELECT * FROM order_log WHERE action='ATTRIBUTION_ACK' AND detail::jsonb->>'eventId'=j.order_log_id LIMIT 1) ack ON true
LEFT JOIN LATERAL (SELECT * FROM order_log WHERE action='ATTRIBUTION_RETRY' AND detail::jsonb->>'eventId'=j.order_log_id
 ORDER BY (detail::jsonb->>'attempts')::int DESC,created_at DESC,order_log_id DESC LIMIT 1) retry ON true
WHERE j.action='ATTRIBUTION_REQUESTED';

-- Check every imported value before any destructive DDL.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM orders o LEFT JOIN order_log l ON l.order_log_id='order-history-import:'||o.order_id
    WHERE l.order_log_id IS NULL OR l.detail::jsonb->'state' IS DISTINCT FROM
      jsonb_build_object('productTitle',o.product_title,'campaignCode',o.campaign_code,'preDisputeStatus',o.pre_dispute_status))
    OR EXISTS (SELECT 1 FROM checkouts c LEFT JOIN order_log l ON l.order_log_id='checkout-address-import:'||c.checkout_id
      WHERE l.order_log_id IS NULL OR l.detail::jsonb->'state'->'addressSnapshot' IS DISTINCT FROM c.address_snapshot)
    OR EXISTS (SELECT 1 FROM shipping s LEFT JOIN order_log l ON l.order_log_id='shipping-address-import:'||s.shipping_id
      WHERE l.order_log_id IS NULL OR l.detail::jsonb->'state'->'addressSnapshot' IS DISTINCT FROM s.address_snapshot)
    OR EXISTS (SELECT 1 FROM attribution_outbox_events a LEFT JOIN order_attribution_jobs j ON j.id=a.id
      WHERE j.id IS NULL OR ROW(j.order_id,j.campaign_id,j.gross_amount,j.discount_amount,j.net_amount,j.completed_at,j.attempts,j.next_attempt_at,j.processed_at)
        IS DISTINCT FROM ROW(a.order_id,a.campaign_id,a.gross_amount,a.discount_amount,a.net_amount,a.completed_at,a.attempts,a.next_attempt_at,a.processed_at)
      OR (a.processed_at IS NULL AND j.last_error IS DISTINCT FROM a.last_error)) THEN
    RAISE EXCEPTION 'Order history cutover blocked: imported data verification failed';
  END IF;
END $$;

DROP TABLE attribution_outbox_events;
ALTER TABLE orders DROP COLUMN product_title,DROP COLUMN campaign_code,DROP COLUMN pre_dispute_status;
ALTER TABLE checkouts DROP COLUMN address_snapshot,DROP COLUMN original_amount,DROP COLUMN orders_amount;
ALTER TABLE shipping DROP COLUMN address_snapshot;
COMMIT;
