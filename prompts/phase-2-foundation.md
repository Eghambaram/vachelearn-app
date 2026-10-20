# Phase 2 — Platform foundation (Release R1)

**Exit:** two tenants and their branches cannot read or write each other's data through any route, filter, cursor or
export; auth, memberships, roles and audit work end-to-end; CI runs every gate.

## Message to send

```text
Start Phase 2 from prompts/phase-2-foundation.md. Confirm decisions D-005, D-010 and D-035 are recorded (ask me if
not). Plan Slice 2.1, show me the plan, then implement it. Use the tenant-isolation-auditor subagent on every slice
that touches data access.
```

## Read first

`.claude/rules/api.md`, `database.md`, `testing.md` · `docs/DOMAIN_MODEL.md` · `docs/ROLE_PERMISSION_MATRIX.md` ·
`docs/ARCHITECTURE.md` · spec §2, §3, §4, §5 (roles part), §17, §18 (audit), §19 · `docs/ACCEPTANCE_TESTS.md`
"Tenant isolation" + "Invitations and roles".

## Slices

### 2.1 API scaffold + local infrastructure
`apps/api` NestJS (strict TS), config module with schema-validated env (fail fast on missing vars), Prisma, Docker
Compose (`infra/docker-compose.yml`: Postgres, MinIO, Mailpit) with healthchecks, `/health` + `/ready`, request-ID
middleware, structured logger with redaction, global exception filter (error envelope), validation pipe, OpenAPI at
`/api/docs` (non-prod), test setup against real Postgres (separate test DB), root scripts extended.
**AC:** `docker compose up -d && pnpm --filter api db:migrate && pnpm verify` pass from a clean clone; `/ready` fails
when Postgres is down; error responses match the envelope; logs redact an `Authorization` header in a test.

### 2.2 Tenancy schema + platform tenant management
Models: Tenant, Branch, Department (optional now), TenantSetting/Branding (minimal), AuditEvent. Composite-key
pattern established. Platform endpoints: create/list/get/update tenant, suspend/reactivate (with reason), branch
CRUD + deactivate. Unique slug (global) and branch code (per tenant).
**AC:** duplicate slug → 422 field error; branch code unique within tenant only; suspend/reactivate audited with actor
+ reason; DB rejects a branch row whose tenant does not match its parent link (integration test).

### 2.3 Identity + authentication (per D-010)
User, AuthSession, password hashing (Argon2id), login/logout, session cookie (httpOnly, Secure, SameSite=Lax), CSRF
strategy, email verification, password reset (hashed single-use tokens, expiry), rate limiting, session revocation,
"current user" endpoint. Web: login, logout, reset screens wired to real API.
**AC:** wrong password and unknown email give the same response + timing class; reset token single-use and expiring;
deactivated user's sessions stop working on next request; no token appears in logs (test).

### 2.4 Memberships, roles, permissions, request context
Membership, BranchMembership, Role (system templates + tenant copies if needed), Permission registry, RoleAssignment
(scope platform/tenant/branch), tenant switcher for multi-tenant users, RequestContext guard, `@RequirePermission`,
scope helpers for branch filtering, "no elevation beyond own grants" rule, audit of every change.
**AC:** a user with roles in two tenants sees only the active tenant's data; branch admin of A1 cannot assign roles in
A2; nobody can grant themselves a higher role; permission registry matches `docs/ROLE_PERMISSION_MATRIX.md` (test
compares them).

### 2.5 Tenant admin people basics
Tenant users list (scoped), user detail, deactivate/reactivate, branch membership management, tenant settings
(name, timezone, locale) — replacing the Phase 1 demo screens for these routes.
**AC:** branch admin lists only users in their branches (by default, by `branchId` filter, by cursor); actions
audited; demo fixtures for these screens removed.

### 2.6 Isolation suite + seed + CI hardening
Two-tenant fixture helper, isolation specs for every R1 resource, `db:seed` demo data per `.claude/rules/database.md`,
CI: Postgres service, `pnpm verify`, isolation suite, Playwright smoke (login → dashboard per role).
**AC:** isolation suite covers tenants, branches, users, memberships, role assignments, audit log, settings; CI green;
seed is idempotent and refuses production.

## Exit gate

- [ ] Demonstration script in `docs/RUNBOOK.md` reproduces the two-tenant isolation demo
- [ ] `tenant-isolation-auditor` and `security-reviewer` findings resolved or logged as decisions/issues
- [ ] `qa-verifier` re-ran all gates from a clean clone and confirms results
- [ ] Docs updated: DOMAIN_MODEL (physical), ROLE_PERMISSION_MATRIX, API_SPECIFICATION, RUNBOOK, `.env.example`

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 2 / spec sprint 1; split into six slices; auth made explicit.
