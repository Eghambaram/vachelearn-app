# Architecture Proposal

> **Pre-Phase-0 draft (kit v1.0), not yet reconciled.** Phase 0 rewrites this file. Until then `MASTER_PROMPT.md`
> and `docs/DECISIONS.md` win on conflicts — notably, background jobs start on a Postgres-backed job/outbox table
> (D-040), not a separate queue, and the repo may add `packages/contracts` (D-035).

## Recommended baseline
- Frontend: Next.js + TypeScript.
- UI: Tailwind CSS + shadcn/ui with a VacheLearn design system.
- Backend: NestJS + TypeScript.
- Database: PostgreSQL.
- ORM: Prisma by default for greenfield; choose once and use consistently.
- API: REST `/api/v1` with OpenAPI.
- Storage: `StorageService` abstraction; MinIO for local development and S3-compatible production.
- Video: `VideoProvider` abstraction; Cloudflare Stream is a candidate provider, pending account/cost verification.
- Jobs: add a reliable queue when asynchronous email, exports, imports, certificates or webhook processing requires it.
- Deployment: Docker-compatible with separate staging and production environments.
- Operations: structured logs, request IDs, error monitoring, health checks, backups and restore tests.

## Architecture style
Use a modular monolith with explicit domain boundaries. Do not begin with microservices.

## Proposed modules
Auth & Sessions; Tenants & Branches; People & Memberships; Roles & Permissions; Groups; Courses & Versions; Assets & Video; Catalog; Assignments & Enrollments; Learning Progress; Assessments; Certificates; Compliance; Surveys; Classroom; Commerce; Reporting & Analytics; Notifications; Audit; Platform Administration.

## Trust boundaries
- Platform-wide access is reserved for explicit platform permissions.
- Tenant context derives from authenticated membership, not a client-provided tenant ID.
- Branch restrictions apply to all reads, writes, exports and background jobs.
- Public catalog and certificate verification endpoints expose minimal information.
- Payment webhooks are verified and deduplicated.

## Repository structure suggestion
```text
apps/
  web/             # Next.js
  api/             # NestJS
packages/
  ui/              # shared UI components if justified
docs/
assets/
reference/
infra/
.env.example
README.md
MASTER_PROMPT.md
```
A simpler structure is acceptable if it improves maintainability; decide after inspecting the chosen environment and package manager.
