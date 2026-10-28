-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'retrying', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('sending', 'sent');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type" VARCHAR(80) NOT NULL,
    "business_key" VARCHAR(200) NOT NULL,
    "tenant_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(100),
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "job_id" UUID NOT NULL,
    "message_id" VARCHAR(200) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'sending',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_run_after_idx" ON "jobs"("status", "run_after");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_idx" ON "jobs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_type_business_key_key" ON "jobs"("type", "business_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_job_id_key" ON "email_deliveries"("job_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written invariants (.claude/rules/database.md: CHECKs Prisma cannot express) ─────────────────────────────

ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_max_attempts_range" CHECK ("max_attempts" BETWEEN 1 AND 20),
  ADD CONSTRAINT "jobs_attempts_range" CHECK ("attempts" BETWEEN 0 AND "max_attempts"),
  ADD CONSTRAINT "jobs_running_is_locked" CHECK (("status" = 'running') = ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)),
  ADD CONSTRAINT "jobs_finished_has_completed_at" CHECK (("status" IN ('succeeded', 'failed')) = ("completed_at" IS NOT NULL)),
  ADD CONSTRAINT "jobs_type_format" CHECK ("type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_sent_has_sent_at" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL)),
  ADD CONSTRAINT "email_deliveries_attempts_positive" CHECK ("attempts" >= 1);
