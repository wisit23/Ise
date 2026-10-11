-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('draft', 'pending_approval', 'rejected', 'approved', 'scheduled', 'open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'published', 'ended', 'rejected');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('CLAIMED', 'USED', 'EXPIRED');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "search_vector" tsvector,
    "condition" TEXT NOT NULL DEFAULT 'Good',
    "tags" TEXT[],
    "location" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT 'Free size',
    "status" TEXT NOT NULL DEFAULT 'available',
    "reservation_id" TEXT,
    "reserved_by" TEXT,
    "reservation_expires_at" TIMESTAMP(3),
    "moderated_at" TIMESTAMP(3),
    "moderation_reason" TEXT,
    "pre_removal_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_text" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_moderation_commands" (
    "idempotency_key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_moderation_commands_pkey" PRIMARY KEY ("idempotency_key")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_videos" (
    "id" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "description" TEXT,
    "seller_id" TEXT NOT NULL,
    "seller_name" TEXT,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipe_choices" (
    "id" TEXT NOT NULL,
    "product_video_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipe_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_items" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'draft',
    "starting_price" INTEGER NOT NULL,
    "bid_increment" INTEGER NOT NULL,
    "scheduled_start_at" TIMESTAMP(3),
    "scheduled_end_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "winning_bid_id" TEXT,
    "winning_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "round_id" TEXT,

    CONSTRAINT "auction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_rounds" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submission_starts_at" TIMESTAMP(3) NOT NULL,
    "submission_ends_at" TIMESTAMP(3) NOT NULL,
    "auction_starts_at" TIMESTAMP(3) NOT NULL,
    "auction_ends_at" TIMESTAMP(3) NOT NULL,
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "cover_image" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "author_id" TEXT NOT NULL,
    "author_name" TEXT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discount_value" INTEGER NOT NULL,
    "min_order_price" INTEGER NOT NULL DEFAULT 0,
    "max_discount" INTEGER,
    "applicable_category" TEXT,
    "budget" INTEGER,
    "spent_budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "target_segment" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vouchers" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'CLAIMED',
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),
    "used_order_id" TEXT,

    CONSTRAINT "user_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "product_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_photos" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_videos" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_attributions" (
    "event_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_attributions_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "marketing_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "previous_state" JSONB,
    "new_state" JSONB,
    "metadata" JSONB,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_reservation_id_key" ON "products"("reservation_id");

-- CreateIndex
CREATE INDEX "products_seller_id_idx" ON "products"("seller_id");

-- CreateIndex
CREATE INDEX "products_status_category_idx" ON "products"("status", "category");

-- CreateIndex
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "products_search_text_idx" ON "products" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_status_reservation_expires_at_idx" ON "products"("status", "reservation_expires_at");

-- CreateIndex
CREATE INDEX "product_moderation_commands_product_id_created_at_idx" ON "product_moderation_commands"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "photos_product_id_idx" ON "photos"("product_id");

-- CreateIndex
CREATE INDEX "videos_product_id_idx" ON "videos"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "conditions_value_key" ON "conditions"("value");

-- CreateIndex
CREATE INDEX "product_videos_product_id_idx" ON "product_videos"("product_id");

-- CreateIndex
CREATE INDEX "product_videos_seller_id_idx" ON "product_videos"("seller_id");

-- CreateIndex
CREATE INDEX "product_videos_created_at_idx" ON "product_videos"("created_at");

-- CreateIndex
CREATE INDEX "swipe_choices_user_id_idx" ON "swipe_choices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "swipe_choices_product_video_id_user_id_key" ON "swipe_choices"("product_video_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_items_winning_bid_id_key" ON "auction_items"("winning_bid_id");

-- CreateIndex
CREATE INDEX "auction_items_product_id_idx" ON "auction_items"("product_id");

-- CreateIndex
CREATE INDEX "auction_items_seller_id_idx" ON "auction_items"("seller_id");

-- CreateIndex
CREATE INDEX "auction_items_status_idx" ON "auction_items"("status");

-- CreateIndex
CREATE INDEX "auction_items_round_id_idx" ON "auction_items"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "bids_idempotency_key_key" ON "bids"("idempotency_key");

-- CreateIndex
CREATE INDEX "bids_auction_id_amount_idx" ON "bids"("auction_id", "amount");

-- CreateIndex
CREATE INDEX "bids_bidder_id_idx" ON "bids"("bidder_id");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_idx" ON "articles"("status");

-- CreateIndex
CREATE INDEX "articles_category_idx" ON "articles"("category");

-- CreateIndex
CREATE INDEX "articles_status_category_idx" ON "articles"("status", "category");

-- CreateIndex
CREATE INDEX "articles_search_text_idx" ON "articles" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_code_key" ON "campaigns"("code");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_code_idx" ON "campaigns"("code");

-- CreateIndex
CREATE INDEX "campaigns_starts_at_ends_at_idx" ON "campaigns"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "user_vouchers_user_id_idx" ON "user_vouchers"("user_id");

-- CreateIndex
CREATE INDEX "user_vouchers_campaign_id_idx" ON "user_vouchers"("campaign_id");

-- CreateIndex
CREATE INDEX "user_vouchers_status_idx" ON "user_vouchers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_vouchers_user_id_campaign_id_key" ON "user_vouchers"("user_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_seller_id_idx" ON "reviews"("seller_id");

-- CreateIndex
CREATE INDEX "reviews_product_id_idx" ON "reviews"("product_id");

-- CreateIndex
CREATE INDEX "review_photos_review_id_idx" ON "review_photos"("review_id");

-- CreateIndex
CREATE INDEX "review_videos_review_id_idx" ON "review_videos"("review_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_attributions_order_id_key" ON "campaign_attributions"("order_id");

-- CreateIndex
CREATE INDEX "campaign_attributions_campaign_id_idx" ON "campaign_attributions"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_attributions_completed_at_idx" ON "campaign_attributions"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_audit_logs_idempotency_key_key" ON "marketing_audit_logs"("idempotency_key");

-- CreateIndex
CREATE INDEX "marketing_audit_logs_created_at_idx" ON "marketing_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "marketing_audit_logs_entity_type_entity_id_idx" ON "marketing_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "marketing_audit_logs_action_idx" ON "marketing_audit_logs"("action");

-- CreateIndex
CREATE INDEX "marketing_audit_logs_actor_id_idx" ON "marketing_audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "product_moderation_commands" ADD CONSTRAINT "product_moderation_commands_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipe_choices" ADD CONSTRAINT "swipe_choices_product_video_id_fkey" FOREIGN KEY ("product_video_id") REFERENCES "product_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_items" ADD CONSTRAINT "auction_items_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "auction_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_items" ADD CONSTRAINT "auction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_videos" ADD CONSTRAINT "review_videos_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

