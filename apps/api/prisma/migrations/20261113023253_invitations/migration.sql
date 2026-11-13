-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "invitation_expiry_days" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "branch_id" UUID,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "token_hash" CHAR(64),
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_user_id" UUID,
    "accepted_membership_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoked_reason" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_created_at_id_idx" ON "invitations"("tenant_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "invitations_tenant_id_branch_id_created_at_idx" ON "invitations"("tenant_id", "branch_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tenant_id_id_key" ON "invitations"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_accepted_membership_id_fkey" FOREIGN KEY ("tenant_id", "accepted_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written (Prisma's diff cannot express these) ──────────────────────────────────────────────────────────

-- D-050: an invitation is valid for 1–30 days (tenant setting, default 7).
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_invitation_expiry_days_bounds" CHECK ("invitation_expiry_days" BETWEEN 1 AND 30);

ALTER TABLE "invitations"
  -- The address is stored lower-cased, as accounts are (users_email_*), and looks like an address.
  ADD CONSTRAINT "invitations_email_format" CHECK ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+$' AND char_length("email") <= 254),
  -- Only a SHA-256 of the token, and only while the invitation can still be accepted (D-081 pattern).
  ADD CONSTRAINT "invitations_token_hash_hex" CHECK ("token_hash" IS NULL OR "token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "invitations_token_only_while_pending" CHECK ("status" = 'pending' OR "token_hash" IS NULL),
  ADD CONSTRAINT "invitations_send_count_positive" CHECK ("send_count" >= 1),
  ADD CONSTRAINT "invitations_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  -- The same role/branch shape as role_assignments (D-053): a Branch Admin needs a branch, a Tenant Admin has none.
  ADD CONSTRAINT "invitations_branch_admin_has_branch" CHECK ("role" <> 'branch_admin' OR "branch_id" IS NOT NULL),
  ADD CONSTRAINT "invitations_tenant_admin_no_branch" CHECK ("role" <> 'tenant_admin' OR "branch_id" IS NULL),
  -- Every closed state records when, who and (for a cancellation) why.
  ADD CONSTRAINT "invitations_acceptance_recorded" CHECK (
    ("status" = 'accepted') = ("accepted_at" IS NOT NULL)
    AND ("status" <> 'accepted' OR ("accepted_user_id" IS NOT NULL AND "accepted_membership_id" IS NOT NULL))),
  ADD CONSTRAINT "invitations_revocation_recorded" CHECK (
    ("status" = 'revoked') = ("revoked_at" IS NOT NULL)
    AND ("status" <> 'revoked' OR ("revoked_by_id" IS NOT NULL AND char_length(btrim(coalesce("revoked_reason", ''))) >= 1)));

-- At most one live (pending) invitation per tenant and address: a second is a resend, not a new row.
CREATE UNIQUE INDEX "invitations_one_pending_per_email" ON "invitations" ("tenant_id", "email") WHERE "status" = 'pending';

-- Accepted and cancelled invitations are history: never changed again, and no invitation is ever deleted.
CREATE FUNCTION invitations_closed_are_history() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invitations_closed_are_history: invitations are never deleted';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'invitations_closed_are_history: an accepted or cancelled invitation cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invitations_closed_are_history
  BEFORE UPDATE OR DELETE ON invitations
  FOR EACH ROW EXECUTE FUNCTION invitations_closed_are_history();
