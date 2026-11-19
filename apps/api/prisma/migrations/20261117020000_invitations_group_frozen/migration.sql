-- Fix forward (CI on 491ac80): `20261113120000_invitations_frozen_grant` sorts after `20261113084042_groups` and
-- replaced this function without the group check, so a database built from scratch lost D-122's rule that a pending
-- invitation's group never changes. Databases that applied the two in creation order kept it. This restores the
-- complete function everywhere; it is idempotent.
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
