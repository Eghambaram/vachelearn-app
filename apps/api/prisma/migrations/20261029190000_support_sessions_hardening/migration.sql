-- Support sessions hardening (isolation audit 2.4c): an audit row can only reference a support session of its own
-- tenant; a support session can only be bound to its own staff member's browser session.
-- DropForeignKey
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_support_session_id_fkey";

-- DropForeignKey
ALTER TABLE "platform_support_sessions" DROP CONSTRAINT "platform_support_sessions_auth_session_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_user_id_id_key" ON "auth_sessions"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_support_sessions_tenant_id_id_key" ON "platform_support_sessions"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_support_session_id_fkey" FOREIGN KEY ("tenant_id", "support_session_id") REFERENCES "platform_support_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_staff_user_id_auth_session_id_fkey" FOREIGN KEY ("staff_user_id", "auth_session_id") REFERENCES "auth_sessions"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written invariants ───────────────────────────────────────────────────────────────────────────────────

-- A support audit row always names its tenant (otherwise the composite reference above would not be checked).
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_support_needs_tenant" CHECK ("support_session_id" IS NULL OR "tenant_id" IS NOT NULL);
