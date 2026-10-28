# VacheLearn — Claude Code project instructions

VacheLearn is a multi-tenant industrial learning and workforce-readiness SaaS (LMS): tenants → branches → people →
courses → assignments → learning → assessments → certificates → compliance → reports. Journey: **Learn → Practice →
Prove → Certify → Improve**. This is a **greenfield build**. Nothing exists until it is in this repository and its
tests pass.

## Session start (every session)

1. Read the current state below (imported from `docs/PROGRESS.md`). Continue from "Next step"; do not restart a phase.
2. Run `git status` and skim recent commits. Trust the repository over memory or earlier summaries.
3. Before coding a slice, open the phase prompt in `prompts/` and the docs it names. Do not read every doc every time.

@docs/PROGRESS.md

## Where things live

| Need | File |
|---|---|
| Full product brief, scope, phases (canonical) | `MASTER_PROMPT.md` |
| Phase-by-phase work instructions | `prompts/phase-N-*.md` |
| Detailed functional spec + acceptance criteria | `docs/VacheLearn_MVP_Implementation_Specification.docx` (Markdown copy: `docs/MVP_SPEC.md`) |
| Decisions (Confirmed / Proposed / Needs decision) | `docs/DECISIONS.md` |
| Roles, permissions, scopes | `docs/ROLE_PERMISSION_MATRIX.md` |
| API conventions (errors, request IDs, probes; endpoints are in OpenAPI at `/api/docs`) | `docs/API_SPECIFICATION.md` |
| Entities and integrity rules | `docs/DOMAIN_MODEL.md` |
| Screens, layout, design tokens | `docs/UI_UX_SPECIFICATION.md` + `assets/ui-ux/*.png` |
| Release-gate tests | `docs/ACCEPTANCE_TESTS.md` |
| What the legacy system did (already extracted from the image-only PDFs) | `docs/LEGACY_CAPABILITY_INVENTORY.md` |

`docs/Supplementary_Master_Prompt.md` is superseded by `MASTER_PROMPT.md` v2; use it only as background.

## Non-negotiables (release blockers — never trade these for speed)

- **Tenant context comes from the authenticated session + membership**, never from a client-supplied `tenantId`,
  header, slug, query param or body field. Every tenant-owned read/write is scoped in the service layer.
- **Branch scope is enforced on every read, write, list, export, cursor and background job.** Changing an ID, filter,
  cursor or export ID must never widen access. Return 404 (not 403) when existence would leak.
- **Deny by default.** Authorization is checked in the API/domain layer; hiding a button is not authorization.
- **Published course versions and assessment versions are immutable.** Edits create a new draft version.
- **Learning evidence is append-only history**: progress, attempts, answers, certificates, attendance, payments, audit
  events. Revoke/supersede/cancel with reason and actor; never delete or rewrite.
- **The server computes** scores, pass/fail, completion, compliance status, prices, currency and totals.
- **Idempotency** for assignment fan-out, certificate award, order creation, webhooks and every background job.
- **Payment grants access only after a verified, deduplicated provider event.** A browser redirect proves nothing.
  Never store card numbers or CVV.
- **Secrets never enter Git, logs, prompts or client bundles.** Never log passwords, tokens, invite links, signed URLs,
  payment payloads or learner answers. Only `.env.example` (placeholders) is committed.
- **UTC in storage**, tenant/user timezone on display. Money as integer minor units + ISO 4217 currency, never float.

## Honesty rules (how work is reported)

- Never say a test, lint, type-check or build passed unless you ran it in this session and saw it pass. Paste the
  command and the summary line. If you could not run it, say so and why.
- Never mark a feature done if its main action is mocked, not persisted, or not authorization-checked.
- No dead buttons, fake success toasts, or hardcoded metrics presented as live. Demo data is visibly labelled "Demo".
- Unknown business rule → do **not** invent it. Add/update a row in `docs/DECISIONS.md` as **Needs decision**,
  implement the documented default only if one exists (marked **Proposed**), and tell the user.
- Label assumptions **Confirmed**, **Proposed** or **Needs decision**. Only the product owner can make one Confirmed.

## Stack (Proposed defaults — confirm in Phase 0, record changes in DECISIONS.md)

- Monorepo with **pnpm workspaces**: `apps/web` (Next.js App Router + TypeScript), `apps/api` (NestJS + TypeScript),
  `packages/ui` (design system, only once ≥2 consumers or clear benefit), `packages/contracts` (shared Zod schemas /
  API types, if it removes duplication). `infra/` for Docker Compose and deploy assets.
- **PostgreSQL** + **Prisma** (one ORM only). Docker Compose for local Postgres, MinIO and Mailpit.
- Tailwind CSS + shadcn/ui with VacheLearn tokens. React Hook Form + Zod on the web. **Zod** schemas in
  `packages/contracts` for API validation too (D-035 Confirmed) — use it everywhere.
- REST under `/api/v1`, OpenAPI generated from code. Auth owned by the API (see D-010 in DECISIONS.md).
- Adapters for everything external: `StorageService`, `VideoProvider`, `EmailProvider`, `PaymentProvider`,
  `PdfRenderer`. Local implementations first (an S3-compatible server chosen in Phase 3 — MinIO no longer publishes
  images, D-078 —, mock video, console/Mailpit email, disabled payments).
- Modular monolith. No microservices, no Redis/queue until a job genuinely needs it (start with a Postgres-backed
  job/outbox table).
- Before adding any dependency: check it is maintained, check the installed major version's docs, and state why.
  Use the current Active LTS Node and current stable majors; verify with the tool rather than assuming versions.

## Commands

> Verified in Phase 1 Slice 1.1 (2026-10-20) and Phase 2 Slice 2.1 (2026-10-27). Rows marked *Phase 2.x* do not
> exist yet — do not run them. Keep this table true; a wrong command here wastes every future session.

| Purpose | Command |
|---|---|
| Install | `pnpm install` (Node 24 LTS per `.nvmrc`, pnpm 12.8.1 per `packageManager`) |
| Local services (Postgres 18 :55432, Mailpit :51025/:58025) | `pnpm services:up` · `pnpm services:down` (`infra/docker-compose.yml`; no object storage until Phase 3, D-078) |
| Dev servers | `pnpm dev` (web :3000, api :4000; needs a root `.env` copied from `.env.example`) |
| Lint / format check / format | `pnpm lint` · `pnpm format:check` · `pnpm format` (run Prettier from the root only: from `apps/web` it reformats the vendored CSS) |
| Type-check | `pnpm typecheck` (web runs `next typegen`; api builds contracts + `prisma generate` first) |
| Unit + integration tests | `pnpm test` (contracts, web, api; api needs `pnpm services:up` — real Postgres test DB `vachelearn_test` and Mailpit for the email tests). Single: `pnpm --filter web test -- <pattern>`, `pnpm --filter api test -- <pattern>` |
| Tenant/branch isolation suite | `pnpm --filter api test:isolation` (also part of `pnpm test`; full two-tenant fixture in 2.6) |
| E2E (Playwright + axe) | `pnpm test:e2e` (needs `pnpm services:up`; starts the API on :4100 and the web on :3100; first time: `pnpm --filter web exec playwright install chromium`) |
| Build | `pnpm build` |
| DB migrate (dev) / deploy / reset | `pnpm --filter api db:migrate` · `db:deploy` · `db:reset` (localhost only); *Phase 2.6:* `db:seed` |
| Create an account (operator) | `pnpm --filter api user:create --email <address> --name "<name>" --reason "<why>"` (sends a set-password email; D-083) |
| All gates (run before reporting a slice done) | `pnpm verify` = ignored-source check + format:check + lint + typecheck + test + build (needs local services for api tests) |

## How to work (every slice)

1. **Plan** — state the slice goal, acceptance criteria (copied or derived from the spec), files/modules to touch, and
   open decisions. For anything larger than a small fix, show the plan before writing code.
2. **Schema first** — model + migration + constraints, then domain service + authorization, then API + DTOs +
   OpenAPI, then UI. Tests alongside each layer, including at least one negative cross-tenant and cross-branch test for
   every new tenant-owned resource.
3. **Verify** — run `pnpm verify` (or each gate) and the isolation suite. Fix failures before moving on.
4. **Document** — update `docs/` (domain model, permission matrix, API, decisions, runbook) and `.env.example` in the
   same change. Update the Commands table here if commands changed.
5. **Report** — files changed, behaviour delivered, commands run with real results, limitations, next step. Then update
   `docs/PROGRESS.md` (use the `/handoff` skill).
6. Keep changes reviewable: one vertical slice per change set; never a whole phase in one pass. Small, focused commits
   with conventional messages (`feat(courses): publish creates immutable version`). Do not push, force-push, rewrite
   history, or run destructive DB commands against anything but a local dev database without explicit approval.

## Conventions (summary — details in `.claude/rules/`, which load automatically for matching paths)

- **IDs**: UUID (v7 preferred) primary keys. Public/opaque IDs (certificate verification, invite tokens) are separate,
  random, and non-enumerable; store only hashes of secret tokens.
- **Tenant-owned tables** carry `tenant_id NOT NULL`, are indexed by it, and reference tenant-owned parents with a
  composite FK `(tenant_id, parent_id) → parent(tenant_id, id)` so cross-tenant links are impossible in the database.
- **Statuses** are explicit enums with timestamps (`publishedAt`, `revokedAt`, `revokedReason`), not booleans or
  overloaded custom fields. No generic `custom0..custom4` or `access JSON` columns — that is a legacy anti-pattern.
- **Errors**: `{ "error": { "code", "message", "requestId", "fieldErrors"?: [{ "field", "code", "message" }] } }`.
  401 unauthenticated · 403 forbidden · 404 hidden/not found · 409 state conflict · 422 validation.
- **Lists**: `{ "data": [...], "page": { "nextCursor", "limit" } }`; bounded `limit` (default 25, max 100),
  allowlisted sort fields, validated filters.
- **Naming**: DB `snake_case` (Prisma `@map`/`@@map`), TS `camelCase`, types/classes `PascalCase`, permission keys
  `resource.action` (e.g. `course.publish`, `report.export`), audit actions `resource.verb_past` (`course.published`).
- **Audit**: append-only `AuditEvent` (actor, tenant, branch?, action, entity type/id, requestId, safe before/after)
  for every sensitive change listed in MASTER_PROMPT §Security.
- TypeScript `strict`; no `any` without a comment explaining why. Controllers thin; rules live in domain services.

## UI rules (details: `docs/UI_UX_SPECIFICATION.md`, `.claude/rules/web.md`)

- Build tokens + shared components before screens. Every list/page has loading, empty, error and permission-denied
  states. Destructive actions confirm and state their impact.
- WCAG 2.2 AA target: keyboard operable, visible focus, labelled controls, status by text **and** colour, charts with a
  text/table equivalent. Learner flows must work at 360 px wide.
- Reference images in `assets/ui-ux/` are **visual direction only**. Their numbers, names and copy are fake. Never ship:
  third-party company logos ("Trusted by" strips), invented testimonials or customer quotes, invented statistics.
  Use clearly marked placeholders until the product owner supplies real, permitted content.
- The legacy product in `reference/legacy/` is a third-party LMS (ExpertusOne). Use it only as workflow evidence. Do
  not copy its branding, layout, wording or assets.

## Specialist helpers in `.claude/`

- Skills (type `/name`): `/start-phase N`, `/slice <name>`, `/verify`, `/decision <topic>`, `/isolation-tests
  <resource>`, `/handoff`.
- Subagents (delegate for independent review — they have not seen your reasoning): `tenant-isolation-auditor`,
  `security-reviewer`, `ux-accessibility-reviewer`, `qa-verifier`. Use the auditor on every change that touches data
  access, and `qa-verifier` before declaring a phase exit.
- Hooks block edits to real `.env` files and auto-format edited files when Prettier is installed.
