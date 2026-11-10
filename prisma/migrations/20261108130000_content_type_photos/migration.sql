-- Real photos replace the drawn previews (public/content-types/*.jpg).
UPDATE "content_types"
SET "image_url" = '/static/content-types/' || "slug" || '.jpg', "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" IN ('sponsored-content', 'product-review', 'ugc', 'affiliate', 'store-visit', 'trend-challenge', 'brand-ambassador')
  AND "image_url" = '/static/content-types/' || "slug" || '.png';
