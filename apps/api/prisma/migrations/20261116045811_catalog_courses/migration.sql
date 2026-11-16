-- CreateEnum
CREATE TYPE "catalog_item_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "course_version_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "course_level" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "delivery_mode" AS ENUM ('online', 'classroom', 'blended');

-- CreateEnum
CREATE TYPE "course_visibility" AS ENUM ('assigned_only', 'catalog');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "status" "catalog_item_status" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "archived_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "status" "catalog_item_status" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "archived_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "slug" CITEXT NOT NULL,
    "owner_membership_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "status" "course_status" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "archived_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_versions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "version_number" INTEGER,
    "status" "course_version_status" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(300),
    "description" VARCHAR(5000),
    "category_id" UUID,
    "level" "course_level",
    "delivery_mode" "delivery_mode",
    "language" VARCHAR(35) NOT NULL DEFAULT 'en',
    "duration_minutes" INTEGER,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience" VARCHAR(500),
    "prerequisites" VARCHAR(500),
    "visibility" "course_visibility" NOT NULL DEFAULT 'assigned_only',
    "published_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "course_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_version_tags" (
    "tenant_id" UUID NOT NULL,
    "course_version_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "course_version_tags_pkey" PRIMARY KEY ("course_version_id","tag_id")
);

-- CreateIndex
CREATE INDEX "categories_tenant_id_status_name_idx" ON "categories"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_id_key" ON "categories"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "tags_tenant_id_status_name_idx" ON "tags"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tenant_id_id_key" ON "tags"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tenant_id_name_key" ON "tags"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "courses_tenant_id_status_updated_at_idx" ON "courses"("tenant_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "courses_tenant_id_title_idx" ON "courses"("tenant_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_id_key" ON "courses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_slug_key" ON "courses"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "course_versions_tenant_id_course_id_status_idx" ON "course_versions"("tenant_id", "course_id", "status");

-- CreateIndex
CREATE INDEX "course_versions_tenant_id_category_id_idx" ON "course_versions"("tenant_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_versions_tenant_id_id_key" ON "course_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "course_versions_tenant_id_course_id_version_number_key" ON "course_versions"("tenant_id", "course_id", "version_number");

-- CreateIndex
CREATE INDEX "course_version_tags_tenant_id_tag_id_idx" ON "course_version_tags"("tenant_id", "tag_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_owner_membership_id_fkey" FOREIGN KEY ("tenant_id", "owner_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_tenant_id_course_id_fkey" FOREIGN KEY ("tenant_id", "course_id") REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_version_tags" ADD CONSTRAINT "course_version_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_version_tags" ADD CONSTRAINT "course_version_tags_tenant_id_course_version_id_fkey" FOREIGN KEY ("tenant_id", "course_version_id") REFERENCES "course_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_version_tags" ADD CONSTRAINT "course_version_tags_tenant_id_tag_id_fkey" FOREIGN KEY ("tenant_id", "tag_id") REFERENCES "tags"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written (Slice 3.3; D-127–D-130) ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_bounds" CHECK (char_length(btrim("name")) BETWEEN 2 AND 60),
  ADD CONSTRAINT "categories_archive_recorded" CHECK (
    ("status" = 'archived') = ("archived_at" IS NOT NULL)
    AND ("status" <> 'archived' OR ("archived_by_id" IS NOT NULL AND char_length(btrim(coalesce("archived_reason", ''))) >= 1)));

ALTER TABLE "tags"
  ADD CONSTRAINT "tags_name_bounds" CHECK (char_length(btrim("name")) BETWEEN 2 AND 40),
  ADD CONSTRAINT "tags_archive_recorded" CHECK (
    ("status" = 'archived') = ("archived_at" IS NOT NULL)
    AND ("status" <> 'archived' OR ("archived_by_id" IS NOT NULL AND char_length(btrim(coalesce("archived_reason", ''))) >= 1)));

-- D-128: categories and tags are archived, never deleted, and never move tenant.
CREATE FUNCTION catalog_items_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'catalog_items_kept: categories and tags are archived, never deleted';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'catalog_items_kept: a category or tag never changes tenant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER categories_kept BEFORE UPDATE OR DELETE ON categories
  FOR EACH ROW EXECUTE FUNCTION catalog_items_kept();
CREATE TRIGGER tags_kept BEFORE UPDATE OR DELETE ON tags
  FOR EACH ROW EXECUTE FUNCTION catalog_items_kept();

ALTER TABLE "courses"
  ADD CONSTRAINT "courses_title_bounds" CHECK (char_length(btrim("title")) BETWEEN 3 AND 120),
  ADD CONSTRAINT "courses_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 80),
  ADD CONSTRAINT "courses_archive_recorded" CHECK (
    ("status" = 'archived') = ("archived_at" IS NOT NULL)
    AND ("status" <> 'archived' OR ("archived_by_id" IS NOT NULL AND char_length(btrim(coalesce("archived_reason", ''))) >= 1)));

-- D-130: a course never moves tenant and its slug is fixed.
CREATE FUNCTION courses_identity_fixed() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'courses_identity_fixed: a course''s tenant and slug never change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER courses_identity_fixed BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION courses_identity_fixed();

ALTER TABLE "course_versions"
  ADD CONSTRAINT "course_versions_title_bounds" CHECK (char_length(btrim("title")) BETWEEN 3 AND 120),
  ADD CONSTRAINT "course_versions_language_listed" CHECK ("language" IN ('en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa')),
  ADD CONSTRAINT "course_versions_duration_bounds" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "course_versions_objectives_bounds" CHECK (cardinality("objectives") <= 20),
  ADD CONSTRAINT "course_versions_published_recorded" CHECK (
    ("status" = 'published') = ("version_number" IS NOT NULL)
    AND ("status" = 'published') = ("published_at" IS NOT NULL)
    AND ("status" = 'published') = ("published_by_id" IS NOT NULL)
    AND ("version_number" IS NULL OR "version_number" >= 1)),
  ADD CONSTRAINT "course_versions_objectives_present" CHECK ("objectives" IS NOT NULL);

-- At most one draft per course (domain model).
CREATE UNIQUE INDEX "course_versions_one_draft" ON "course_versions" ("course_id") WHERE "status" = 'draft';

-- Published versions are immutable and never deleted; a version never moves course or tenant. Publishing (3.6) is the
-- one allowed change of a draft's status.
CREATE FUNCTION course_versions_published_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'course_versions_published_immutable: a published course version cannot change';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'course_versions_published_immutable: a version never moves course or tenant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER course_versions_published_immutable BEFORE UPDATE OR DELETE ON course_versions
  FOR EACH ROW EXECUTE FUNCTION course_versions_published_immutable();

-- A published version's tags are frozen with it (D-128); at most 10 tags per version.
CREATE FUNCTION course_version_tags_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_version_id ELSE NEW.course_version_id END;
  v_status course_version_status;
BEGIN
  SELECT status INTO v_status FROM course_versions WHERE id = v_id FOR UPDATE;
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'course_version_tags_frozen: a published version''s tags cannot change';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM course_version_tags WHERE course_version_id = v_id) >= 10 THEN
    RAISE EXCEPTION 'course_version_tags_frozen: at most 10 tags per version';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'course_version_tags_frozen: tag links are added or removed, not changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER course_version_tags_frozen BEFORE INSERT OR UPDATE OR DELETE ON course_version_tags
  FOR EACH ROW EXECUTE FUNCTION course_version_tags_frozen();

-- A version starts as a draft; publishing (3.6) is an update of that draft, never an insert (isolation audit 3.3).
CREATE FUNCTION course_versions_start_as_draft() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'course_versions_start_as_draft: a course version is created as a draft';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER course_versions_start_as_draft BEFORE INSERT ON course_versions
  FOR EACH ROW EXECUTE FUNCTION course_versions_start_as_draft();
