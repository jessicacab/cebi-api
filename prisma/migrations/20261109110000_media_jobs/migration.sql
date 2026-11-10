-- CreateEnum
CREATE TYPE "MediaJobKind" AS ENUM ('POLISH', 'ANIMATE');

-- CreateEnum
CREATE TYPE "MediaJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "media_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "piece_id" UUID,
    "kind" "MediaJobKind" NOT NULL,
    "status" "MediaJobStatus" NOT NULL DEFAULT 'QUEUED',
    "options" JSONB NOT NULL DEFAULT '{}',
    "input_url" TEXT,
    "output_url" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_jobs_user_id_created_at_idx" ON "media_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "media_jobs_status_idx" ON "media_jobs"("status");

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only cebi-api reads this table (see the onboarding migration).
ALTER TABLE "media_jobs" ENABLE ROW LEVEL SECURITY;
