-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('TODO', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED');

-- AlterTable
ALTER TABLE "campaign_applications" ADD COLUMN     "paid_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "creator_deliverables" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "platform" "SocialPlatform",
    "number" INTEGER NOT NULL,
    "min_seconds" INTEGER,
    "max_seconds" INTEGER,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'TODO',
    "content_url" TEXT,
    "caption" TEXT,
    "submitted_at" TIMESTAMP(3),
    "feedback" TEXT,
    "revisions_used" INTEGER NOT NULL DEFAULT 0,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_deliverables_application_id_idx" ON "creator_deliverables"("application_id");

-- CreateIndex
CREATE INDEX "creator_deliverables_campaign_id_status_idx" ON "creator_deliverables"("campaign_id", "status");

-- AddForeignKey
ALTER TABLE "creator_deliverables" ADD CONSTRAINT "creator_deliverables_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "campaign_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_deliverables" ADD CONSTRAINT "creator_deliverables_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only cebi-api reads this table (see the onboarding migration).
ALTER TABLE "creator_deliverables" ENABLE ROW LEVEL SECURITY;
