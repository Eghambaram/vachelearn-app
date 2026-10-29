-- CreateEnum
CREATE TYPE "SupportSessionEndReason" AS ENUM ('ended', 'expired', 'signed_out', 'tenant_archived', 'staff_role_revoked');

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "support_session_id" UUID;

-- CreateTable
CREATE TABLE "platform_support_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "staff_user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" "SupportSessionEndReason",

    CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_support_sessions_tenant_id_started_at_idx" ON "platform_support_sessions"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "platform_support_sessions_staff_user_id_ended_at_idx" ON "platform_support_sessions"("staff_user_id", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_support_sessions_staff_user_id_id_key" ON "platform_support_sessions"("staff_user_id", "id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_support_session_id_fkey" FOREIGN KEY ("support_session_id") REFERENCES "platform_support_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_support_session_id_fkey" FOREIGN KEY ("user_id", "support_session_id") REFERENCES "platform_support_sessions"("staff_user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_auth_session_id_fkey" FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written invariants (.claude/rules/database.md) ───────────────────────────────────────────────────────────

ALTER TABLE "platform_support_sessions"
  ADD CONSTRAINT "platform_support_sessions_reason_present" CHECK (length(btrim("reason")) >= 3),
  -- D-037: 60 minutes at most.
  ADD CONSTRAINT "platform_support_sessions_max_60_min" CHECK ("expires_at" > "started_at" AND "expires_at" <= "started_at" + interval '60 minutes'),
  ADD CONSTRAINT "platform_support_sessions_end_recorded" CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL));

-- One live support session per staff member.
CREATE UNIQUE INDEX "platform_support_sessions_one_live"
  ON "platform_support_sessions" ("staff_user_id") WHERE "ended_at" IS NULL;
