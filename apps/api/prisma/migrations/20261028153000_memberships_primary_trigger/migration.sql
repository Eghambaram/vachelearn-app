-- Follow-up to memberships_roles (same slice, 2.4a): Prisma's schema diff cannot express the foreign key from a
-- membership to one of its own branch rows and kept proposing to drop it. The same rule — the primary branch is one of
-- the member's branches (D-026) — moves to deferred constraint triggers (checked at commit, so a membership and its
-- branches can be written in either order), which the diff ignores.
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_primary_is_member";

CREATE FUNCTION memberships_primary_is_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  m RECORD;
  target uuid;
BEGIN
  -- NEW and OLD are different row types per table: read only the field that exists on this trigger's table.
  IF TG_TABLE_NAME = 'memberships' THEN
    target := NEW.id;
  ELSE
    target := OLD.membership_id;
  END IF;
  SELECT id, primary_branch_id INTO m FROM memberships WHERE id = target;
  IF m.primary_branch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM membership_branches WHERE membership_id = m.id AND branch_id = m.primary_branch_id) THEN
    RAISE EXCEPTION 'memberships_primary_is_member: the primary branch must be one of the member''s branches';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER memberships_primary_is_member
  AFTER INSERT OR UPDATE OF primary_branch_id ON memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION memberships_primary_is_member();

CREATE CONSTRAINT TRIGGER membership_branches_keep_primary
  AFTER DELETE ON membership_branches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION memberships_primary_is_member();

-- ── Tenant-isolation audit 2.4a ─────────────────────────────────────────────────────────────────────────────────

-- A branch role sits on one of the member's own branches (removing that branch is refused while a role references it).
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_membership_id_branch_id_fkey"
  FOREIGN KEY ("membership_id", "branch_id") REFERENCES "membership_branches"("membership_id", "branch_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant Admin is a whole-tenant role: on a branch its tenant-only grants (settings, branding, role.assign…) would
-- still apply tenant-wide.
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_tenant_admin_whole_tenant" CHECK ("role" <> 'tenant_admin' OR "branch_id" IS NULL);

-- Branch memberships are added and removed, never moved: an UPDATE could slide the primary branch out from under the
-- membership (the primary-branch trigger watches inserts and deletes).
CREATE FUNCTION membership_branches_insert_delete_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'membership_branches is insert/delete only';
END $$;

CREATE TRIGGER membership_branches_no_update
  BEFORE UPDATE ON membership_branches
  FOR EACH ROW EXECUTE FUNCTION membership_branches_insert_delete_only();
