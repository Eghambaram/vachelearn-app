-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "industry" AS ENUM ('manufacturing', 'construction', 'oil_and_gas', 'logistics', 'utilities', 'other');

-- CreateEnum
CREATE TYPE "branch_status" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" VARCHAR(40) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "status" "tenant_status" NOT NULL DEFAULT 'active',
    "default_timezone" VARCHAR(64) NOT NULL,
    "default_locale" VARCHAR(35) NOT NULL DEFAULT 'en-IN',
    "primary_contact_email" VARCHAR(254),
    "industry" "industry",
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(500),
    "suspended_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "archived_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "classroom_enabled" BOOLEAN NOT NULL DEFAULT false,
    "surveys_enabled" BOOLEAN NOT NULL DEFAULT false,
    "commerce_enabled" BOOLEAN NOT NULL DEFAULT false,
    "public_catalog_enabled" BOOLEAN NOT NULL DEFAULT false,
    "analytics_enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "address_line" VARCHAR(200),
    "city" VARCHAR(100),
    "region" VARCHAR(100),
    "country_code" CHAR(2),
    "status" "branch_status" NOT NULL DEFAULT 'active',
    "deactivated_at" TIMESTAMPTZ(3),
    "deactivated_reason" VARCHAR(500),
    "deactivated_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "tenant_id" UUID,
    "branch_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID NOT NULL,
    "request_id" VARCHAR(64),
    "support_session_id" UUID,
    "reason" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_created_at_idx" ON "tenants"("status", "created_at");

-- CreateIndex
CREATE INDEX "branches_tenant_id_status_name_idx" ON "branches"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_id_key" ON "branches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_occurred_at_idx" ON "audit_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written: invariants Prisma cannot express (.claude/rules/database.md) ─────────────────────────────────────

-- D-079: lowercase letters, digits and single hyphens, 3–40 characters, not starting or ending with a hyphen.
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 40);
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_version_positive" CHECK ("version" >= 1);
-- Lifecycle columns agree with the status (who/when/why recorded for suspension and archiving).
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_suspension_recorded"
  CHECK ("status" <> 'suspended' OR ("suspended_at" IS NOT NULL AND "suspended_reason" IS NOT NULL));
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_archive_recorded"
  CHECK ("status" <> 'archived' OR ("archived_at" IS NOT NULL AND "archived_reason" IS NOT NULL));

-- Branch codes: uppercase letters, digits and hyphens, 2–20 characters; unique per tenant (unique index above).
ALTER TABLE "branches" ADD CONSTRAINT "branches_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{1,19}$');
ALTER TABLE "branches" ADD CONSTRAINT "branches_country_code_format"
  CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "branches" ADD CONSTRAINT "branches_version_positive" CHECK ("version" >= 1);
ALTER TABLE "branches" ADD CONSTRAINT "branches_deactivation_recorded"
  CHECK ("status" <> 'inactive' OR ("deactivated_at" IS NOT NULL AND "deactivated_reason" IS NOT NULL));

-- A composite foreign key is not checked when any of its columns is NULL (MATCH SIMPLE), so a branch reference
-- without a tenant would slip through: forbid it.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_branch_needs_tenant"
  CHECK ("branch_id" IS NULL OR "tenant_id" IS NOT NULL);

-- Audit events are evidence: insert-only for every role. (TRUNCATE stays possible for the local test database reset.)
CREATE FUNCTION "audit_events_are_insert_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is insert-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "audit_events_insert_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_are_insert_only"();
