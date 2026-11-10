-- AlterTable
ALTER TABLE "content_types" ADD COLUMN     "default_payment" TEXT NOT NULL DEFAULT 'FIXED';

-- How creators are usually paid for each starting type.
UPDATE "content_types" SET "default_payment" = 'PRODUCT' WHERE "slug" = 'product-review';
UPDATE "content_types" SET "default_payment" = 'COMMISSION' WHERE "slug" = 'affiliate';
UPDATE "content_types" SET "default_payment" = 'HYBRID' WHERE "slug" = 'store-visit';
