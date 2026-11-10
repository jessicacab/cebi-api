-- Business profile: owner, contact, exact location and social handles.
-- AlterTable
ALTER TABLE "business_profiles" ADD COLUMN     "barangay" TEXT,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_mobile" TEXT,
ADD COLUMN     "landline" TEXT,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "owner_first_name" TEXT,
ADD COLUMN     "owner_last_name" TEXT,
ADD COLUMN     "socials" JSONB,
ADD COLUMN     "street" TEXT;

