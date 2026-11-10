-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "campaign_applications" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_applications_campaign_id_status_idx" ON "campaign_applications"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_applications_creator_id_idx" ON "campaign_applications"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_applications_campaign_id_creator_id_key" ON "campaign_applications"("campaign_id", "creator_id");

-- AddForeignKey
ALTER TABLE "campaign_applications" ADD CONSTRAINT "campaign_applications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_applications" ADD CONSTRAINT "campaign_applications_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only cebi-api reads this table (see the onboarding migration).
ALTER TABLE "campaign_applications" ENABLE ROW LEVEL SECURITY;
