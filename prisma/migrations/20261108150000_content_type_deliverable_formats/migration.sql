-- AlterTable
ALTER TABLE "content_types" ADD COLUMN     "default_duration_days" INTEGER NOT NULL DEFAULT 14;

-- Deliverables now say photo or video, how many, and how long each video is,
-- instead of free text labels.
UPDATE "content_types" SET "deliverables" = CASE "slug"
  WHEN 'sponsored-content' THEN '[{"format":"VIDEO","count":1,"minSeconds":30,"maxSeconds":60}]'
  WHEN 'product-review'    THEN '[{"format":"VIDEO","count":1,"minSeconds":60,"maxSeconds":180}]'
  WHEN 'ugc'               THEN '[{"format":"VIDEO","count":2,"minSeconds":15,"maxSeconds":30}]'
  WHEN 'affiliate'         THEN '[{"format":"VIDEO","count":1,"minSeconds":15,"maxSeconds":30}]'
  WHEN 'store-visit'       THEN '[{"format":"VIDEO","count":1,"minSeconds":30,"maxSeconds":60},{"format":"PHOTO","count":3}]'
  WHEN 'trend-challenge'   THEN '[{"format":"VIDEO","count":1,"minSeconds":15,"maxSeconds":30}]'
  WHEN 'brand-ambassador'  THEN '[{"format":"VIDEO","count":12,"minSeconds":30,"maxSeconds":60}]'
  ELSE '[{"format":"VIDEO","count":1,"minSeconds":30,"maxSeconds":60}]'
END::jsonb,
"updated_at" = CURRENT_TIMESTAMP;

-- A brand ambassador runs for months, not weeks.
UPDATE "content_types" SET "default_duration_days" = 90 WHERE "slug" = 'brand-ambassador';
