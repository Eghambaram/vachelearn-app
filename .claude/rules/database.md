---
paths:
  - "**/*.prisma"
  - "**/prisma/**"
  - "**/migrations/**"
  - "**/seed*.ts"
---

# Database rules (PostgreSQL + Prisma)

## Modelling

- Primary keys: UUID (v7 preferred). Columns `created_at`, `updated_at` (timestamptz, UTC) on every table; `created_by`
  where an actor matters. Table/column names `snake_case` via `@@map`/`@map`; model/field names PascalCase/camelCase.
- **Tenant-owned model checklist** (all mandatory):
  1. `tenantId String @map("tenant_id")` NOT NULL, `@@index([tenantId, ...])` matching the main list queries.
  2. `@@unique([tenantId, id])` so children can reference it with a composite key.
  3. Every relation to another tenant-owned model uses composite fields:
     `@relation(fields: [tenantId, courseId], references: [tenantId, id])` — the database then rejects cross-tenant
     links even if the service has a bug.
  4. Business uniqueness is per tenant: `@@unique([tenantId, slug])`, `@@unique([tenantId, code])` (branch code).
- Global (not tenant-owned) models: `User`, `Tenant`, `Permission`, platform `Role` templates, `ProviderEvent`
  (keyed by provider + event id), public verification lookups. Say explicitly in `docs/DOMAIN_MODEL.md` which models
  are global, tenant-owned, or branch-scoped, and why.
- Status columns are Prisma enums. Lifecycle timestamps sit next to them (`publishedAt`, `archivedAt`, `revokedAt` +
  `revokedReason` + `revokedById`). Use `CHECK` constraints (raw SQL in the migration) for invariants Prisma cannot
  express: `end_at > start_at`, `capacity >= 0`, `pass_mark BETWEEN 0 AND 100`, `amount_minor >= 0`.
- Partial unique indexes (raw SQL) for "only one active X": e.g. one non-cancelled enrollment per
  `(tenant_id, user_id, course_version_id)`; one `draft` version per course.
- Money: `amount_minor BIGINT` + `currency CHAR(3)`. Percentages/scores: integers or `NUMERIC` with a documented
  rounding rule — never floats.
- Immutable evidence tables (`attempts`, `answers`, `certificate_awards`, `attendance_records` history, `audit_events`,
  `provider_events`, `learning_events`) are insert-only from the application. Corrections are new rows referencing
  the old one. Consider DB-level `REVOKE UPDATE, DELETE` for the app role on `audit_events` in Phase 7.
- No generic JSON blobs for things that are queried, filtered, or authorized on. JSON is acceptable only for opaque
  snapshots (e.g. rendered certificate data, provider payload digests) or validated settings with a schema.
- Soft-delete only where the domain needs it (`deactivatedAt`); never soft-delete evidence — it is never deleted.

## Migrations

- One migration per slice, named for intent (`20261021_add_course_versions`). Never edit a migration that has been
  applied anywhere shared; add a new one.
- Every migration must run on a clean database (`db:reset` then `db:migrate`) — verify before reporting done.
- Destructive changes (drop/rename column, type narrowing) use expand → migrate data → contract across separate
  releases, with a written rollback/forward-fix note in `docs/RUNBOOK.md`.
- Never run `migrate reset`, `db push --force-reset`, `DROP`, or `TRUNCATE` against anything except the local dev or
  test database. Ask first if unsure which database `DATABASE_URL` points to.

## Row-level security (defence in depth, optional)

- Application scoping is mandatory regardless. If RLS is added (target: Phase 7, or earlier if decided), set
  `app.tenant_id` with `SET LOCAL` inside each transaction so pooled connections cannot leak context, use a separate
  non-owner DB role for the app, and add tests proving a query without context returns zero rows.

## Seed data

- `db:seed` creates **demo-only** data: at least two tenants (e.g. "Demo Manufacturing Co" and "Demo Logistics Ltd"),
  two or more branches each with different timezones, one user per role per tenant, one user who belongs to both
  tenants with different roles, courses in draft/published/archived states, and enrollments in each status.
- Seeded names are obviously fictional. Never use real company names, real people, or real logos. Seeded passwords
  come from an env var or are printed once for local use; never committed as real-looking credentials.
- Seeds are idempotent (upsert on business keys) and refuse to run when `NODE_ENV=production`.
