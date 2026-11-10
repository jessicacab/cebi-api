-- CreateTable
CREATE TABLE "content_types" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "image_url" TEXT,
    "deliverables" JSONB NOT NULL DEFAULT '[]',
    "requires_visit" BOOLEAN NOT NULL DEFAULT false,
    "posts_on_creator_account" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_types_slug_key" ON "content_types"("slug");

-- CreateIndex
CREATE INDEX "content_types_active_sort_order_idx" ON "content_types"("active", "sort_order");

-- Only cebi-api reads this table (see the onboarding migration).
ALTER TABLE "content_types" ENABLE ROW LEVEL SECURITY;

-- The starting set of content types. The Cebi team edits them from the admin.
INSERT INTO "content_types"
  ("id", "slug", "name", "description", "example", "image_url", "deliverables", "requires_visit", "posts_on_creator_account", "sort_order", "updated_at")
VALUES
  (gen_random_uuid(), 'sponsored-content', 'Sponsored Content',
   'Creator posts a promotional TikTok video featuring your business, product or service, in exchange for payment.',
   'A creator promotes a restaurant or cafe.',
   '/static/content-types/sponsored-content.png',
   '[{"label":"TikTok video","detail":"30 to 60s, featuring your business","count":1}]',
   false, true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'product-review', 'Product Review / Unboxing',
   'Creator opens, tries and reviews your product, and shares their experience with their audience.',
   'Unboxing skincare, gadgets or clothing.',
   '/static/content-types/product-review.png',
   '[{"label":"Unboxing or review video","detail":"30 to 90s, honest first impressions","count":1}]',
   false, true, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ugc', 'UGC (Content for Your Brand)',
   'Creator makes videos for you to use on your own social media accounts or in ads. They may not post it on their own account.',
   'A product demonstration video.',
   '/static/content-types/ugc.png',
   '[{"label":"Edited videos","detail":"Delivered to you as files","count":2}]',
   false, false, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'affiliate', 'Affiliate Marketing',
   'Creator promotes your product with an affiliate or product link and earns a commission on qualifying sales.',
   'Promoting a TikTok Shop product.',
   '/static/content-types/affiliate.png',
   '[{"label":"TikTok video with product link","detail":"Link on the video or in bio","count":1}]',
   false, true, 40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'store-visit', 'Store Visit / Experience',
   'Creator visits your place and makes content showing the location, products or experience.',
   'Visiting a cafe, resort, restaurant or salon for payment or free services.',
   '/static/content-types/store-visit.png',
   '[{"label":"TikTok video","detail":"Shot at your location, 30 to 60s","count":1}]',
   true, true, 50, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'trend-challenge', 'Trend / Challenge Campaign',
   'Creator joins your branded hashtag challenge, trend, dance or creative video idea.',
   'A video using your campaign hashtag or branded sound.',
   '/static/content-types/trend-challenge.png',
   '[{"label":"Trend video","detail":"Uses your hashtag or sound","count":1}]',
   false, true, 60, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'brand-ambassador', 'Brand Ambassador',
   'Creator represents your business with recurring content over a longer partnership, not a single campaign.',
   'Weekly videos for your brand over three months.',
   '/static/content-types/brand-ambassador.png',
   '[{"label":"Videos per month","detail":"Posted across the month","count":4}]',
   false, true, 70, CURRENT_TIMESTAMP);
