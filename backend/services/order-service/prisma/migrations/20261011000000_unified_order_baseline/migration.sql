-- CreateTable
CREATE TABLE "basket" (
    "basket_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lock_at" TIMESTAMP(3) NOT NULL,
    "unlock_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "basket_pkey" PRIMARY KEY ("basket_id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "checkout_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "address_snapshot" JSONB NOT NULL,
    "original_amount" DECIMAL(18,2) NOT NULL,
    "orders_amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "cancel_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("checkout_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" TEXT NOT NULL,
    "checkout_id" TEXT,
    "basket_id" TEXT,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "product_title" TEXT,
    "campaign_code" TEXT,
    "auction_id" TEXT,
    "order_type" TEXT NOT NULL,
    "original_amount" DECIMAL(18,2) NOT NULL,
    "orders_amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "pre_dispute_status" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "payment" (
    "payment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_type" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL,
    "payment_amount" DECIMAL(18,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "shipping" (
    "shipping_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "address_snapshot" JSONB NOT NULL,
    "company" TEXT,
    "tracking_number" TEXT,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_pkey" PRIMARY KEY ("shipping_id")
);

-- CreateTable
CREATE TABLE "hold" (
    "hold_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "hold_reason" TEXT NOT NULL,
    "hold_status" TEXT NOT NULL,
    "hold_amount" DECIMAL(18,2) NOT NULL,
    "hold_at" TIMESTAMP(3) NOT NULL,
    "hold_by" TEXT NOT NULL,
    "release_amount" DECIMAL(18,2),
    "release_at" TIMESTAMP(3),
    "released_by" TEXT,

    CONSTRAINT "hold_pkey" PRIMARY KEY ("hold_id")
);

-- CreateTable
CREATE TABLE "order_log" (
    "order_log_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_log_pkey" PRIMARY KEY ("order_log_id")
);

-- CreateTable
CREATE TABLE "dispute_case" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decision" TEXT,
    "dispute_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decision_reason" TEXT,
    "verdict_key" TEXT,
    "escalation_note" TEXT,
    "escalated_by" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "priority_score" INTEGER NOT NULL DEFAULT 0,
    "risk_report_count" INTEGER NOT NULL DEFAULT 0,
    "sla_expires_at" TIMESTAMP(3),
    "sla_policy_version" TEXT,
    "first_review_due_at" TIMESTAMP(3),
    "first_reviewed_at" TIMESTAMP(3),
    "decision_due_at" TIMESTAMP(3),
    "dispute_case_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "assigned_to" TEXT,
    "assigned_role" TEXT,
    "assigned_at" TIMESTAMP(3),

    CONSTRAINT "dispute_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_case_log" (
    "dispute_case_log_id" TEXT NOT NULL,
    "dispute_case_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from_assigned_to" TEXT,
    "to_assigned_to" TEXT,
    "from_assigned_role" TEXT,
    "to_assigned_role" TEXT,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_case_log_pkey" PRIMARY KEY ("dispute_case_log_id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "dispute_evidence_id" TEXT NOT NULL,
    "dispute_case_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "evidence_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "evidence_deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("dispute_evidence_id")
);

-- CreateTable
CREATE TABLE "dispute_audit_log" (
    "dispute_audit_log_id" TEXT NOT NULL,
    "dispute_evidence_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_audit_log_pkey" PRIMARY KEY ("dispute_audit_log_id")
);

-- CreateTable
CREATE TABLE "safety_dispute_evidence" (
    "safety_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "detail" TEXT,
    "verify_by" TEXT,
    "verify_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "safety_dispute_evidence_pkey" PRIMARY KEY ("safety_id")
);

-- CreateTable
CREATE TABLE "safety_log" (
    "safety_log_id" TEXT NOT NULL,
    "safety_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_log_pkey" PRIMARY KEY ("safety_log_id")
);

-- CreateTable
CREATE TABLE "attribution_outbox_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribution_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "basket_buyer_id_status_idx" ON "basket"("buyer_id", "status");

-- CreateIndex
CREATE INDEX "checkouts_buyer_id_status_idx" ON "checkouts"("buyer_id", "status");

-- CreateIndex
CREATE INDEX "checkouts_status_cancel_at_idx" ON "checkouts"("status", "cancel_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_basket_id_key" ON "orders"("basket_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_auction_id_key" ON "orders"("auction_id");

-- CreateIndex
CREATE INDEX "orders_buyer_id_idx" ON "orders"("buyer_id");

-- CreateIndex
CREATE INDEX "orders_seller_id_idx" ON "orders"("seller_id");

-- CreateIndex
CREATE INDEX "orders_checkout_id_idx" ON "orders"("checkout_id");

-- CreateIndex
CREATE INDEX "payment_order_id_created_at_idx" ON "payment"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_order_id_key" ON "shipping"("order_id");

-- CreateIndex
CREATE INDEX "hold_payment_id_hold_status_idx" ON "hold"("payment_id", "hold_status");

-- CreateIndex
CREATE INDEX "order_log_order_id_created_at_idx" ON "order_log"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_case_order_id_key" ON "dispute_case"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_case_verdict_key_key" ON "dispute_case"("verdict_key");

-- CreateIndex
CREATE INDEX "dispute_case_log_dispute_case_id_created_at_idx" ON "dispute_case_log"("dispute_case_id", "created_at");

-- CreateIndex
CREATE INDEX "dispute_evidence_dispute_case_id_idx" ON "dispute_evidence"("dispute_case_id");

-- CreateIndex
CREATE INDEX "dispute_audit_log_dispute_evidence_id_created_at_idx" ON "dispute_audit_log"("dispute_evidence_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "safety_dispute_evidence_evidence_id_key" ON "safety_dispute_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "safety_dispute_evidence_order_id_idx" ON "safety_dispute_evidence"("order_id");

-- CreateIndex
CREATE INDEX "safety_log_safety_id_created_at_idx" ON "safety_log"("safety_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attribution_outbox_events_order_id_key" ON "attribution_outbox_events"("order_id");

-- CreateIndex
CREATE INDEX "attribution_outbox_events_processed_at_next_attempt_at_idx" ON "attribution_outbox_events"("processed_at", "next_attempt_at");

-- CreateIndex
CREATE INDEX "attribution_outbox_events_order_id_processed_at_idx" ON "attribution_outbox_events"("order_id", "processed_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "checkouts"("checkout_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_basket_id_fkey" FOREIGN KEY ("basket_id") REFERENCES "basket"("basket_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping" ADD CONSTRAINT "shipping_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold" ADD CONSTRAINT "hold_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("payment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_log" ADD CONSTRAINT "order_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_case" ADD CONSTRAINT "dispute_case_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_case_log" ADD CONSTRAINT "dispute_case_log_dispute_case_id_fkey" FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_case_id_fkey" FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_audit_log" ADD CONSTRAINT "dispute_audit_log_dispute_evidence_id_fkey" FOREIGN KEY ("dispute_evidence_id") REFERENCES "dispute_evidence"("dispute_evidence_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_dispute_evidence" ADD CONSTRAINT "safety_dispute_evidence_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_dispute_evidence" ADD CONSTRAINT "safety_dispute_evidence_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "dispute_evidence"("dispute_evidence_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_log" ADD CONSTRAINT "safety_log_safety_id_fkey" FOREIGN KEY ("safety_id") REFERENCES "safety_dispute_evidence"("safety_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_outbox_events" ADD CONSTRAINT "attribution_outbox_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

