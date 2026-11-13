-- Slice 3.1 isolation audit: a pending invitation's grant is fixed at creation. Only its lifecycle columns (status,
-- token, send count, dates, acceptance and cancellation records) may change; tenant, address, role, branch and
-- inviter never do (a tenant-wide invitation has no composite FK that would stop a tenant move).
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
     OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'invitations_closed_are_history: an invitation''s tenant, address, role, branch and inviter never change';
  END IF;
  RETURN NEW;
END $$;
