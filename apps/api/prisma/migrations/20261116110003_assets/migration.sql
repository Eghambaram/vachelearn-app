-- CreateEnum
CREATE TYPE "asset_kind" AS ENUM ('image', 'document', 'video');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "asset_scan_status" AS ENUM ('not_scanned', 'clean');

-- CreateEnum
CREATE TYPE "asset_provider" AS ENUM ('storage', 'mock_video');

-- AlterTable
ALTER TABLE "course_versions" ADD COLUMN     "cover_asset_id" UUID;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "kind" "asset_kind" NOT NULL,
    "status" "asset_status" NOT NULL,
    "storage_key" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "provider" "asset_provider" NOT NULL,
    "provider_ref" VARCHAR(200),
    "scan_status" "asset_scan_status" NOT NULL,
    "failure_reason" VARCHAR(200),
    "ready_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE INDEX "assets_tenant_id_kind_created_at_idx" ON "assets"("tenant_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenant_id_id_key" ON "assets"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "course_versions_tenant_id_cover_asset_id_idx" ON "course_versions"("tenant_id", "cover_asset_id");

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_tenant_id_cover_asset_id_fkey" FOREIGN KEY ("tenant_id", "cover_asset_id") REFERENCES "assets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written rules (slice 3.4, D-131–D-135) ────────────────────────────────────────────────────────────────────

-- D-132: allowed types and size limits per kind; the key always names the asset's own tenant and kind (D-131).
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_type_allowed" CHECK (
    ("kind" = 'image' AND "content_type" IN ('image/png', 'image/jpeg', 'image/webp') AND "size_bytes" <= 5242880)
    OR ("kind" = 'document' AND "content_type" = 'application/pdf' AND "size_bytes" <= 26214400)
    OR ("kind" = 'video' AND "content_type" IN ('video/mp4', 'video/webm') AND "size_bytes" <= 524288000)),
  ADD CONSTRAINT "assets_size_positive" CHECK ("size_bytes" > 0),
  ADD CONSTRAINT "assets_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "assets_key_shape" CHECK (
    "storage_key" = 'tenants/' || "tenant_id"::text || '/' || "kind"::text || '/' || substring("storage_key" from '[^/]+$')
    AND substring("storage_key" from '[^/]+$') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  ADD CONSTRAINT "assets_file_name_present" CHECK (char_length(btrim("file_name")) BETWEEN 1 AND 200),
  -- Videos go through the video provider; images and documents live in our storage.
  ADD CONSTRAINT "assets_provider_fits_kind" CHECK (("kind" = 'video') = ("provider" <> 'storage')),
  ADD CONSTRAINT "assets_status_recorded" CHECK (
    ("status" = 'processing' AND "ready_at" IS NULL AND "failed_at" IS NULL)
    OR ("status" = 'ready' AND "ready_at" IS NOT NULL AND "failed_at" IS NULL)
    OR ("status" = 'failed' AND "failed_at" IS NOT NULL AND "ready_at" IS NULL AND "failure_reason" IS NOT NULL));

-- D-135: a stored file never changes and is never deleted. Only a video's processing outcome is written later
-- (processing → ready | failed, once).
CREATE FUNCTION assets_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'assets_immutable: an asset is never deleted';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.content_type IS DISTINCT FROM OLD.content_type
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.file_name IS DISTINCT FROM OLD.file_name OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.scan_status IS DISTINCT FROM OLD.scan_status OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id THEN
    RAISE EXCEPTION 'assets_immutable: a stored file never changes';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status <> 'processing' THEN
    RAISE EXCEPTION 'assets_immutable: only a processing asset becomes ready or failed';
  END IF;
  IF OLD.status <> 'processing' AND (NEW.provider_ref IS DISTINCT FROM OLD.provider_ref
     OR NEW.failure_reason IS DISTINCT FROM OLD.failure_reason) THEN
    RAISE EXCEPTION 'assets_immutable: a finished asset never changes';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assets_immutable BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_immutable();

-- D-133: a course cover is a ready image (the composite FK already keeps it in the same tenant).
CREATE FUNCTION course_versions_cover_is_image() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  a_kind asset_kind;
  a_status asset_status;
BEGIN
  IF NEW.cover_asset_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.cover_asset_id IS NOT DISTINCT FROM OLD.cover_asset_id) THEN
    RETURN NEW;
  END IF;
  SELECT kind, status INTO a_kind, a_status FROM assets WHERE id = NEW.cover_asset_id AND tenant_id = NEW.tenant_id;
  IF a_kind IS DISTINCT FROM 'image' OR a_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'course_versions_cover_is_image: a course cover is a ready image';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER course_versions_cover_is_image BEFORE INSERT OR UPDATE OF cover_asset_id ON course_versions
  FOR EACH ROW EXECUTE FUNCTION course_versions_cover_is_image();
