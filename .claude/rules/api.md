---
paths:
  - "apps/api/**"
  - "packages/contracts/**"
---

# API rules (NestJS) — apply to everything under apps/api

## Module layout

One Nest module per bounded context, matching MASTER_PROMPT §Modules (auth, tenancy, people, access, groups, courses,
assets, catalog, enrollments, progress, assessments, certificates, compliance, surveys, classroom, commerce, reporting,
notifications, audit, platform). Inside each module:

```
<module>/
  <module>.module.ts
  <module>.controller.ts        # HTTP only: parse, call service, map result. No business rules.
  <module>.service.ts           # domain rules, transactions, authorization-aware queries
  <module>.repository.ts        # optional; every method takes an explicit TenantScope argument
  dto/                          # request/response DTOs with validation + OpenAPI decorators
  policies/                     # permission + scope checks for this module
  <module>.service.spec.ts      # unit tests
  test/<module>.isolation.spec.ts  # cross-tenant / cross-branch negative tests (mandatory)
```

Modules talk to each other through exported services or domain events, never by importing another module's
repository or reaching into its tables directly. No circular module imports.

## Request context and tenancy

- A global auth guard resolves the session → `User`. A tenancy guard resolves the **active membership** (the tenant
  the user selected at login/switch, stored in the session — never trusted from the request body/query/header) and
  builds a `RequestContext { userId, tenantId, membershipId, roleAssignments, branchIds, isPlatformAdmin, requestId }`.
- Services receive the context (or a narrowed `TenantScope { tenantId, branchIds | 'ALL' }`) as an explicit argument.
  Do not read tenant from AsyncLocalStorage inside repositories without also asserting it — explicit beats magic.
- Every Prisma query on a tenant-owned model includes `tenantId` in `where`/`data`. Every branch-scoped list adds the
  branch filter derived from the context, intersected with any user-supplied branch filter (never replaced by it).
- Lookups by ID use `findFirst({ where: { id, tenantId, ...branchFilter } })` → not found ⇒ `404`, never a 403 that
  reveals the record exists in another tenant.
- Platform-admin endpoints live under `/api/v1/platform/**`, require an explicit platform permission, and are audited.
  Platform staff "acting as" a tenant (support access) must be explicit, time-limited and audited — never implicit.
- Suspended tenant ⇒ tenant users get `403 TENANT_SUSPENDED` on the next request; history stays readable to platform
  staff only.

## Authorization

- `@RequirePermission('course.publish')` (or equivalent) on every non-public route, plus a scope check in the service
  for the specific resource (tenant + branch + ownership, e.g. instructor ⇒ only assigned sessions).
- Permission keys live in one registry file (`access/permissions.ts`) that mirrors `docs/ROLE_PERMISSION_MATRIX.md`.
  Adding a permission means updating both in the same change.
- Role assignment cannot grant a permission or scope the actor does not hold. Nobody can elevate their own role.
- Public endpoints (catalog, certificate verification, invitation preview, payment webhooks) are explicitly marked
  `@Public()` and return minimal data. Add rate limiting to auth, invitation and verification endpoints.

## DTOs, validation, errors

- Validate every input server-side (whitelist + forbid unknown properties). Never pass a raw request body to Prisma.
- Never accept server-owned fields from clients: `tenantId`, `score`, `passed`, `status` transitions outside an
  explicit action endpoint, `price`, `amount`, `currency`, `issuedAt`, `completedAt`, `createdBy`.
- State changes are explicit action endpoints (`POST /courses/:id/versions/:vid/publish`, `POST /certificates/:id/
  revoke`) — not a generic PATCH of `status`.
- Global exception filter emits the standard envelope with `requestId`; no stack traces outside development.
  Map Prisma unique violations to `409`/`422` with a field error, not `500`.
- Optimistic concurrency (`version` column or `updatedAt` precondition) on editable aggregates: course drafts,
  assessment drafts, tenant settings, templates.

## Transactions, idempotency, jobs

- Multi-row state changes run in one transaction (`prisma.$transaction`). Side effects (email, webhooks out, PDF
  generation) go through an outbox/job row written in the same transaction, processed after commit.
- Idempotency: unique constraints on business keys (e.g. one active enrollment per learner + course version + source
  rule; one certificate per enrollment + renewal cycle; unique `(provider, providerEventId)`), plus an
  `Idempotency-Key` header for create-order and assignment creation. Retries must be no-ops.
- Jobs record `queued | running | succeeded | failed | retrying`, attempt count, sanitized error; bounded backoff.
  A failed notification never rolls back a valid learning transaction.

## Logging and observability

- Structured JSON logs with `requestId`, `tenantId`, `userId`, route, status, latency. Propagate `x-request-id`.
- Redact: passwords, tokens, cookies, `Authorization`, invite tokens, signed URLs, payment payloads, assessment answers,
  free-text survey answers.
- `/health` (liveness) and `/ready` (DB + storage reachable). OpenAPI at `/api/docs` in non-production only, unless
  the product owner decides otherwise.

## Files, media, PDFs

- Uploads: validate size and type by content sniffing (not filename/content-type alone); object keys are
  `tenants/{tenantId}/{kind}/{uuid}` — never user-supplied names. Return short-lived signed URLs only after an
  authorization check. Never log signed URLs.
- Video: API owns entitlement and progress; the `VideoProvider` handles encoding/playback (Cloudflare Stream candidate,
  `mock` locally). Do not store video binaries in Postgres.
- Certificates: render PDF from an immutable snapshot (template version + data) at award time; store the artifact
  and its hash. Re-rendering after a template change requires an explicit, audited reissue.
