-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('tenant_admin', 'branch_admin', 'learning_manager', 'instructor', 'learner', 'compliance_viewer');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('platform_super_admin');

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "active_membership_id" UUID;

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "primary_branch_id" UUID,
    "deactivated_at" TIMESTAMPTZ(3),
    "deactivated_reason" VARCHAR(500),
    "deactivated_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_branches" (
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "membership_branches_pkey" PRIMARY KEY ("membership_id","branch_id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role" "TenantRole" NOT NULL,
    "branch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoked_reason" VARCHAR(500),

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_role_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoked_reason" VARCHAR(500),

    CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_id_key" ON "memberships"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_id_key" ON "memberships"("user_id", "id");

-- CreateIndex
CREATE INDEX "membership_branches_tenant_id_branch_id_idx" ON "membership_branches"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "role_assignments_tenant_id_membership_id_idx" ON "role_assignments"("tenant_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignments_tenant_id_id_key" ON "role_assignments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "platform_role_assignments_user_id_idx" ON "platform_role_assignments"("user_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_active_membership_id_fkey" FOREIGN KEY ("user_id", "active_membership_id") REFERENCES "memberships"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_primary_branch_id_fkey" FOREIGN KEY ("tenant_id", "primary_branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written invariants (.claude/rules/database.md) ───────────────────────────────────────────────────────────

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "memberships_deactivation_recorded" CHECK (("status" = 'deactivated') = ("deactivated_at" IS NOT NULL)),
  -- The primary branch is one of the member's branches (D-026). Deferred: a membership and its branches are written
  -- in one transaction, in either order.
  ADD CONSTRAINT "memberships_primary_is_member" FOREIGN KEY ("id", "primary_branch_id")
    REFERENCES "membership_branches" ("membership_id", "branch_id") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "role_assignments"
  -- A Branch Admin is always branch-scoped (matrix scope code B).
  ADD CONSTRAINT "role_assignments_branch_admin_has_branch" CHECK ("role" <> 'branch_admin' OR "branch_id" IS NOT NULL),
  ADD CONSTRAINT "role_assignments_revocation_recorded" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL));

-- One live assignment per member, role and scope (tenant-wide counts as one scope).
CREATE UNIQUE INDEX "role_assignments_one_live"
  ON "role_assignments" ("membership_id", "role", "branch_id") NULLS NOT DISTINCT
  WHERE "revoked_at" IS NULL;

ALTER TABLE "platform_role_assignments"
  ADD CONSTRAINT "platform_role_assignments_revocation_recorded" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL));

CREATE UNIQUE INDEX "platform_role_assignments_one_live"
  ON "platform_role_assignments" ("user_id", "role")
  WHERE "revoked_at" IS NULL;
