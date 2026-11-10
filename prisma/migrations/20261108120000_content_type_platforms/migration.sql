-- AlterTable
ALTER TABLE "content_types" ADD COLUMN     "platforms" "SocialPlatform"[] DEFAULT ARRAY['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK']::"SocialPlatform"[];

-- Businesses now pick the platforms first, so the starting types talk about
-- "video" instead of naming TikTok.
UPDATE "content_types" SET
  "description" = 'Creator posts a promotional video featuring your business, product or service, in exchange for payment.',
  "deliverables" = '[{"label":"Video","detail":"30 to 60s, featuring your business","count":1}]',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'sponsored-content';

UPDATE "content_types" SET
  "deliverables" = '[{"label":"Video with product link","detail":"Link on the video or in bio","count":1}]',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'affiliate';

UPDATE "content_types" SET
  "deliverables" = '[{"label":"Video","detail":"Shot at your location, 30 to 60s","count":1}]',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'store-visit';
