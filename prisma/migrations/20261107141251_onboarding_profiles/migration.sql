-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboarded_at" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "creator_profiles" (
    "user_id" UUID NOT NULL,
    "handle" TEXT,
    "city" TEXT,
    "platforms" "SocialPlatform"[],
    "niches" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "business_profiles" (
    "user_id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_profiles_handle_key" ON "creator_profiles"("handle");

-- CreateIndex
CREATE INDEX "business_profiles_city_idx" ON "business_profiles"("city");

-- CreateIndex
CREATE INDEX "business_profiles_category_idx" ON "business_profiles"("category");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only cebi-api reads these tables (through Prisma, as the table owner).
-- Row level security with no policies blocks Supabase's public Data API.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_profiles" ENABLE ROW LEVEL SECURITY;
