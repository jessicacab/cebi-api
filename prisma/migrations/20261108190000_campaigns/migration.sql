-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('FIXED', 'COMMISSION', 'PRODUCT', 'HYBRID');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "content_type_id" UUID NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "platforms" "SocialPlatform"[],
    "deliverables" JSONB NOT NULL,
    "hashtags" TEXT[],
    "tag_business" BOOLEAN NOT NULL DEFAULT true,
    "mentions" TEXT[],
    "talking_points" TEXT[],
    "avoid" TEXT[],
    "link" TEXT,
    "show_location" BOOLEAN NOT NULL DEFAULT false,
    "review_drafts" BOOLEAN NOT NULL DEFAULT false,
    "revisions" INTEGER NOT NULL DEFAULT 0,
    "keep_live_days" INTEGER,
    "ad_usage_days" INTEGER,
    "payment" "PaymentKind" NOT NULL,
    "cash_per_creator" INTEGER,
    "commission_pct" INTEGER,
    "product" TEXT,
    "product_value" INTEGER,
    "slots" INTEGER NOT NULL,
    "apply_by" DATE NOT NULL,
    "content_due" DATE NOT NULL,
    "publish_start" DATE,
    "publish_end" DATE,
    "spread_evenly" BOOLEAN NOT NULL DEFAULT false,
    "visit_times" TEXT[],
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_business_id_status_idx" ON "campaigns"("business_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_status_apply_by_idx" ON "campaigns"("status", "apply_by");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_content_type_id_fkey" FOREIGN KEY ("content_type_id") REFERENCES "content_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only cebi-api reads this table (see the onboarding migration).
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
