-- CreateEnum
CREATE TYPE "job_role_status" AS ENUM ('active', 'inactive');

-- AlterEnum
ALTER TYPE "SessionEndReason" ADD VALUE 'membership_deactivated';

-- DropForeignKey
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_membership_id_branch_id_fkey";

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "department" VARCHAR(100),
ADD COLUMN     "employee_id" CITEXT,
ADD COLUMN     "job_role_id" UUID;

-- CreateTable
CREATE TABLE "job_roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "status" "job_role_status" NOT NULL DEFAULT 'active',
    "deactivated_at" TIMESTAMPTZ(3),
    "deactivated_reason" VARCHAR(500),
    "deactivated_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_roles_tenant_id_status_name_idx" ON "job_roles"("tenant_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_tenant_id_id_key" ON "job_roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_tenant_id_name_key" ON "job_roles"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_job_role_id_idx" ON "memberships"("tenant_id", "job_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_employee_id_key" ON "memberships"("tenant_id", "employee_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_job_role_id_fkey" FOREIGN KEY ("tenant_id", "job_role_id") REFERENCES "job_roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written (Prisma's diff cannot express these) ──────────────────────────────────────────────────────────

-- D-047 field bounds: an employee id is short and never blank; a job role name is 2–80 characters.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_employee_id_bounds" CHECK ("employee_id" IS NULL OR char_length(btrim("employee_id")) BETWEEN 1 AND 40);
ALTER TABLE "job_roles"
  ADD CONSTRAINT "job_roles_name_bounds" CHECK (char_length(btrim("name")) BETWEEN 2 AND 80),
  ADD CONSTRAINT "job_roles_deactivation_consistent" CHECK (("status" = 'inactive') = ("deactivated_at" IS NOT NULL));

-- D-104 replaces the 2.4a foreign key role_assignments(membership_id, branch_id) → membership_branches: a branch role
-- is still created only on one of the member's own branches, but a revoked role (history) no longer stops the member
-- leaving that branch; a live one does.
-- Both triggers first lock the member's row: a branch removal and a role grant on that branch for the same member then
-- run one after the other, so neither can pass its check against the other's uncommitted state (reviews 2.5a; the
-- 2.4a foreign key gave this through its key-share lock). Fixed search_path: the functions never resolve other schemas.
CREATE FUNCTION role_assignments_on_member_branch() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NEW.revoked_at IS NULL THEN
    PERFORM 1 FROM memberships WHERE id = NEW.membership_id FOR UPDATE;
    IF NOT EXISTS (
         SELECT 1 FROM membership_branches WHERE membership_id = NEW.membership_id AND branch_id = NEW.branch_id) THEN
      RAISE EXCEPTION 'role_assignments_on_member_branch: a branch role needs the member to belong to that branch';
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- Deferred, like the primary-branch rule: a branch membership and its role can be written in either order.
CREATE CONSTRAINT TRIGGER role_assignments_on_member_branch
  AFTER INSERT OR UPDATE OF membership_id, branch_id, revoked_at ON role_assignments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION role_assignments_on_member_branch();

-- UPDATE of membership_branches is already refused (membership_branches_no_update, 2.4a); deletes are checked here.
CREATE FUNCTION membership_branches_no_live_role() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM memberships WHERE id = OLD.membership_id FOR UPDATE;
  IF EXISTS (
       SELECT 1 FROM role_assignments
       WHERE membership_id = OLD.membership_id AND branch_id = OLD.branch_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'membership_branches_no_live_role: revoke the member''s roles on this branch first';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER membership_branches_no_live_role
  BEFORE DELETE ON membership_branches
  FOR EACH ROW EXECUTE FUNCTION membership_branches_no_live_role();
