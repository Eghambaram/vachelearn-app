-- CreateEnum
CREATE TYPE "PasswordLinkPurpose" AS ENUM ('set_password', 'reset_password');

-- CreateTable
CREATE TABLE "password_links" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "purpose" "PasswordLinkPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "job_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "password_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_links_token_hash_key" ON "password_links"("token_hash");

-- CreateIndex
CREATE INDEX "password_links_user_id_purpose_idx" ON "password_links"("user_id", "purpose");

-- AddForeignKey
ALTER TABLE "password_links" ADD CONSTRAINT "password_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written invariants (.claude/rules/database.md) ───────────────────────────────────────────────────────────

ALTER TABLE "password_links"
  ADD CONSTRAINT "password_links_token_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "password_links_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "password_links_used_or_revoked" CHECK ("used_at" IS NULL OR "revoked_at" IS NULL);

-- At most one live link per user and purpose: minting a new one must revoke the old one first (D-081).
CREATE UNIQUE INDEX "password_links_one_live_per_purpose"
  ON "password_links" ("user_id", "purpose")
  WHERE "used_at" IS NULL AND "revoked_at" IS NULL;
