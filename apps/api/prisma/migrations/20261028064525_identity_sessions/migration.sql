-- Case-insensitive email (users.email). Available in the standard Postgres image; created once per database.
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('signed_out', 'idle_timeout', 'expired', 'user_deactivated', 'password_changed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" CITEXT NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "locale" VARCHAR(20),
    "timezone" VARCHAR(64),
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(3),
    "deactivated_at" TIMESTAMPTZ(3),
    "deactivated_reason" VARCHAR(500),
    "deactivated_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(200) NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" "SessionEndReason",

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(120) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_ended_at_idx" ON "auth_sessions"("user_id", "ended_at");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Hand-written invariants (.claude/rules/database.md) ───────────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_format" CHECK ("email" ~ '^[^@\s]+@[^@\s]+$' AND length("email") <= 254),
  ADD CONSTRAINT "users_display_name_present" CHECK (length(btrim("display_name")) > 0),
  ADD CONSTRAINT "users_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "users_deactivation_recorded" CHECK (("status" = 'deactivated') = ("deactivated_at" IS NOT NULL));

ALTER TABLE "user_credentials"
  ADD CONSTRAINT "user_credentials_phc_format" CHECK ("password_hash" LIKE '$argon2id$%');

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_token_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auth_sessions_expiry_after_start" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "auth_sessions_end_recorded" CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL));

ALTER TABLE "rate_limit_buckets"
  ADD CONSTRAINT "rate_limit_buckets_count_positive" CHECK ("count" >= 1);
