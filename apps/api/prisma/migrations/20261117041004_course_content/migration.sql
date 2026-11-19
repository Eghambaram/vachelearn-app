-- CreateEnum
CREATE TYPE "lesson_type" AS ENUM ('text', 'video', 'document', 'link', 'assessment');

-- CreateEnum
CREATE TYPE "lesson_completion_rule" AS ENUM ('manual', 'watched_90', 'acknowledged', 'passed');

-- CreateTable
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "course_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "course_version_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "type" "lesson_type" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "duration_minutes" INTEGER,
    "completion_rule" "lesson_completion_rule" NOT NULL,
    "body" VARCHAR(20000),
    "url" VARCHAR(2000),
    "asset_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_modules_tenant_id_course_version_id_idx" ON "course_modules"("tenant_id", "course_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_tenant_id_id_key" ON "course_modules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_tenant_id_course_version_id_id_key" ON "course_modules"("tenant_id", "course_version_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_course_version_id_position_key" ON "course_modules"("course_version_id", "position");

-- CreateIndex
CREATE INDEX "lessons_tenant_id_course_version_id_idx" ON "lessons"("tenant_id", "course_version_id");

-- CreateIndex
CREATE INDEX "lessons_tenant_id_asset_id_idx" ON "lessons"("tenant_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_tenant_id_id_key" ON "lessons"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_module_id_position_key" ON "lessons"("module_id", "position");

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_tenant_id_course_version_id_fkey" FOREIGN KEY ("tenant_id", "course_version_id") REFERENCES "course_versions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenant_id_course_version_id_module_id_fkey" FOREIGN KEY ("tenant_id", "course_version_id", "module_id") REFERENCES "course_modules"("tenant_id", "course_version_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "assets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Slice 3.5 rules (D-041, D-136, D-137) ─────────────────────────────────────────────────────────────────────────
-- Positions are 0-based; a reorder first moves a list out of the way (+100000), so the range allows that.
ALTER TABLE "course_modules"
  ADD CONSTRAINT "course_modules_title_present" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "course_modules_position_range" CHECK ("position" BETWEEN 0 AND 200000);

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_title_present" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "lessons_position_range" CHECK ("position" BETWEEN 0 AND 200000),
  ADD CONSTRAINT "lessons_duration_range" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 0 AND 600),
  -- D-041: each type has exactly one completion rule.
  ADD CONSTRAINT "lessons_rule_fits_type" CHECK (
    ("type" IN ('text', 'link') AND "completion_rule" = 'manual')
    OR ("type" = 'video' AND "completion_rule" = 'watched_90')
    OR ("type" = 'document' AND "completion_rule" = 'acknowledged')
    OR ("type" = 'assessment' AND "completion_rule" = 'passed')),
  -- D-136: each type uses only its own content column.
  ADD CONSTRAINT "lessons_content_fits_type" CHECK (
    ("body" IS NULL OR "type" = 'text')
    AND ("url" IS NULL OR "type" = 'link')
    AND ("asset_id" IS NULL OR "type" IN ('video', 'document'))),
  -- https only, and no `user:password@` before the host (security review 3.5a: the API refuses both; this is the backstop).
  ADD CONSTRAINT "lessons_url_https" CHECK ("url" IS NULL OR ("url" ~ '^https://[^[:space:]]+$' AND "url" !~ '^https://[^/?#]*@'));

-- A version's outline changes only while it is a draft (published versions are immutable); a module or lesson never
-- moves version or tenant, and a lesson's type (so its rule) is fixed at creation (D-137). Bounded outlines (D-137).
CREATE FUNCTION course_content_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_version_id ELSE NEW.course_version_id END;
  v_status course_version_status;
BEGIN
  SELECT status INTO v_status FROM course_versions WHERE id = v_id FOR UPDATE;
  -- NULL: the draft itself is being deleted and this row goes with it.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'course_content_frozen: a published version''s outline cannot change';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.course_version_id IS DISTINCT FROM OLD.course_version_id THEN
      RAISE EXCEPTION 'course_content_frozen: content never moves version or tenant';
    END IF;
  END IF;
  -- Nested, not AND-ed: PL/pgSQL does not short-circuit, and each table's columns exist only on that table.
  IF TG_TABLE_NAME = 'course_modules' THEN
    IF TG_OP = 'INSERT' AND (SELECT count(*) FROM course_modules WHERE course_version_id = v_id) >= 50 THEN
      RAISE EXCEPTION 'course_content_frozen: at most 50 modules per version';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.type IS DISTINCT FROM OLD.type OR NEW.completion_rule IS DISTINCT FROM OLD.completion_rule THEN
      RAISE EXCEPTION 'course_content_frozen: a lesson''s type and completion rule never change';
    END IF;
    IF NEW.module_id IS NOT DISTINCT FROM OLD.module_id THEN
      RETURN NEW;
    END IF;
  END IF;
  -- A lesson inserted, or moved to another module.
  IF (SELECT count(*) FROM lessons WHERE module_id = NEW.module_id) >= 100 THEN
    RAISE EXCEPTION 'course_content_frozen: at most 100 lessons per module';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM lessons WHERE course_version_id = v_id) >= 500 THEN
    RAISE EXCEPTION 'course_content_frozen: at most 500 lessons per version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER course_modules_frozen BEFORE INSERT OR UPDATE OR DELETE ON course_modules
  FOR EACH ROW EXECUTE FUNCTION course_content_frozen();
CREATE TRIGGER lessons_frozen BEFORE INSERT OR UPDATE OR DELETE ON lessons
  FOR EACH ROW EXECUTE FUNCTION course_content_frozen();

-- D-136: a video lesson's file is a video, a document lesson's a document; a failed file is never attached.
CREATE FUNCTION lessons_asset_fits() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  a_kind asset_kind;
  a_status asset_status;
BEGIN
  IF NEW.asset_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.asset_id IS NOT DISTINCT FROM OLD.asset_id) THEN
    RETURN NEW;
  END IF;
  SELECT kind, status INTO a_kind, a_status FROM assets WHERE id = NEW.asset_id AND tenant_id = NEW.tenant_id;
  IF a_kind IS DISTINCT FROM (CASE NEW.type WHEN 'video' THEN 'video' ELSE 'document' END)::asset_kind THEN
    RAISE EXCEPTION 'lessons_asset_fits: the file kind does not match the lesson type';
  END IF;
  IF a_status = 'failed' THEN
    RAISE EXCEPTION 'lessons_asset_fits: a failed file cannot be attached';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lessons_asset_fits BEFORE INSERT OR UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION lessons_asset_fits();
