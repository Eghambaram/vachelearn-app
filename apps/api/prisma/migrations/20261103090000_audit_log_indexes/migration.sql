-- DropIndex
DROP INDEX "audit_events_tenant_id_occurred_at_idx";

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_occurred_at_id_idx" ON "audit_events"("tenant_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_branch_id_occurred_at_id_idx" ON "audit_events"("tenant_id", "branch_id", "occurred_at" DESC, "id" DESC);

