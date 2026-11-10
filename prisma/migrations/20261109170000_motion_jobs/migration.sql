-- Moving ads: MOTION jobs keep their 3 variations.
-- AlterEnum
ALTER TYPE "MediaJobKind" ADD VALUE 'MOTION';

-- AlterTable
ALTER TABLE "media_jobs" ADD COLUMN     "variants" JSONB;

