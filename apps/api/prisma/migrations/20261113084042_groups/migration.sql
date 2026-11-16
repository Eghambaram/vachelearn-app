-- CreateEnum
CREATE TYPE "group_status" AS ENUM ('active', 'archived');

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "description" VARCHAR(500),
    "branch_id" UUID,
    "status" "group_status" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ(3),
    "archived_reason" VARCHAR(500),
    "archived_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by_id" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by_id" UUID,
    "removed_reason" VARCHAR(500),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "groups_tenant_id_status_name_idx" ON "groups"("tenant_id", "status", "name");

-- CreateIndex
CREATE INDEX "groups_tenant_id_branch_id_status_idx" ON "groups"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "groups_tenant_id_id_key" ON "groups"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "group_members_tenant_id_group_id_removed_at_idx" ON "group_members"("tenant_id", "group_id", "removed_at");

-- CreateIndex
CREATE INDEX "group_members_tenant_id_membership_id_removed_at_idx" ON "group_members"("tenant_id", "membership_id", "removed_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_tenant_id_id_key" ON "group_members"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id", "group_id") REFERENCES "groups"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id", "group_id") REFERENCES "groups"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written (Slice 3.2; D-119–D-122) ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_name_bounds" CHECK (char_length(btrim("name")) BETWEEN 2 AND 80),
  ADD CONSTRAINT "groups_description_not_blank" CHECK ("description" IS NULL OR char_length(btrim("description")) >= 1),
  ADD CONSTRAINT "groups_archive_recorded" CHECK (
    ("status" = 'archived') = ("archived_at" IS NOT NULL)
    AND ("status" <> 'archived' OR ("archived_by_id" IS NOT NULL AND char_length(btrim(coalesce("archived_reason", ''))) >= 1)));

-- D-121: names are unique among active groups, ignoring case (CITEXT); an archived name can be used again.
CREATE UNIQUE INDEX "groups_active_name_unique" ON "groups" ("tenant_id", "name") WHERE "status" = 'active';

-- A group never moves tenant or changes scope (its members were chosen for that scope), and is never deleted.
CREATE FUNCTION groups_scope_fixed() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'groups_scope_fixed: groups are archived, never deleted';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'groups_scope_fixed: a group''s tenant and branch never change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER groups_scope_fixed BEFORE UPDATE OR DELETE ON groups
  FOR EACH ROW EXECUTE FUNCTION groups_scope_fixed();

ALTER TABLE "group_members"
  ADD CONSTRAINT "group_members_removal_recorded" CHECK (
    ("removed_at" IS NULL) = ("removed_by_id" IS NULL)
    AND ("removed_at" IS NULL) = ("removed_reason" IS NULL)
    AND ("removed_reason" IS NULL OR char_length(btrim("removed_reason")) >= 1)
    AND ("removed_at" IS NULL OR "removed_at" >= "added_at"));

-- One current spell per member and group; history rows (removed) are unlimited.
CREATE UNIQUE INDEX "group_members_one_current" ON "group_members" ("group_id", "membership_id") WHERE "removed_at" IS NULL;

-- History (D-120): never deleted; a removal is recorded once and then final; who, where and when added never change.
CREATE FUNCTION group_members_history() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'group_members_history: group membership is history, never deleted';
  END IF;
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'group_members_history: a removal is final';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.membership_id IS DISTINCT FROM OLD.membership_id OR NEW.added_at IS DISTINCT FROM OLD.added_at
     OR NEW.added_by_id IS DISTINCT FROM OLD.added_by_id THEN
    RAISE EXCEPTION 'group_members_history: only the removal can be recorded';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_members_history BEFORE UPDATE OR DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_history();

-- D-120 / D-121: a member joins only an active group, and a branch group only if they belong to that branch. Locks the
-- member's row first, like the D-104 triggers, so a branch removal and an add for the same member run one after the
-- other.
CREATE FUNCTION group_members_on_member_branch() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  g_branch uuid;
  g_status group_status;
BEGIN
  PERFORM 1 FROM memberships WHERE id = NEW.membership_id FOR UPDATE;
  SELECT branch_id, status INTO g_branch, g_status FROM groups WHERE id = NEW.group_id FOR SHARE;
  IF g_status <> 'active' THEN
    RAISE EXCEPTION 'group_members_on_member_branch: an archived group takes no new members';
  END IF;
  IF g_branch IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM membership_branches WHERE membership_id = NEW.membership_id AND branch_id = g_branch) THEN
    RAISE EXCEPTION 'group_members_on_member_branch: a branch group holds only members of that branch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_members_on_member_branch BEFORE INSERT ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_on_member_branch();

-- D-120: leaving a branch ends the member's spells in that branch's groups first (the service records them with the
-- reason "Left the branch"); a branch membership is never removed while one is current.
CREATE FUNCTION membership_branches_no_current_group() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM memberships WHERE id = OLD.membership_id FOR UPDATE;
  IF EXISTS (
       SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.membership_id = OLD.membership_id AND gm.removed_at IS NULL AND g.branch_id = OLD.branch_id) THEN
    RAISE EXCEPTION 'membership_branches_no_current_group: remove the member from this branch''s groups first';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER membership_branches_no_current_group BEFORE DELETE ON membership_branches
  FOR EACH ROW EXECUTE FUNCTION membership_branches_no_current_group();

-- D-122: an invitation's group is part of its grant, frozen like the rest (3.1 isolation audit).
CREATE OR REPLACE FUNCTION invitations_closed_are_history() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invitations_closed_are_history: invitations are never deleted';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'invitations_closed_are_history: an accepted or cancelled invitation cannot change';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'invitations_closed_are_history: an invitation''s tenant, address, role, branch, group and inviter never change';
  END IF;
  RETURN NEW;
END $$;
