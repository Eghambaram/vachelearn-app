# VacheLearn Implementation Plan — Phase 0

Status: **Proposed** (Phase 0, 2026-10-20), awaiting owner review. Canonical phase numbering is MASTER_PROMPT §9.
Each phase has a prompt in `prompts/` with full slice text; this file is the overview, with dependencies and sizes.
Size: **S** ≈ one focused session · **M** ≈ 2–3 sessions · **L** ≈ 4+ sessions (split further when planned).
`REQ-*` IDs refer to `docs/PRODUCT_REQUIREMENTS.md`; `D-*` to `docs/DECISIONS.md`.

Every slice follows the work protocol in `CLAUDE.md` (plan → schema → domain + authorization → API → UI → tests incl.
isolation → `pnpm verify` → docs → report → `/handoff`). One slice per change set.

## Phase summary

| Phase | Name | Release | Slices | Exit gate (short) |
|---|---|---|---|---|
| 0 | Discovery & plan | — | (this document) | Owner reviews plan; answers queue items 1–7 in DECISIONS |
| 1 | Design system & UI foundations | — | 5 (1.5 has 8 sub-slices) | Shell, tokens, components, 8 screens on labelled demo data; a11y review |
| 2 | Platform foundation | R1 | 7 | Two-tenant/branch isolation proven; auth, roles, audit, CI |
| 3 | People & course content | R2 | 8 | Admin invites, groups, publishes v1; learner discovers it |
| 4 | Core learning lifecycle | R2 (MVP) | 7 | Assign → learn → assess → complete → certificate → report, E2E |
| 5 | Training operations | R3 | 7 | Compliance, exports, surveys, classroom, notifications reconcile |
| 6 | Commerce & analytics | R4 | 6 | Verified payments, refunds, governed analytics |
| 7 | Production readiness | Launch | 6 | Go/no-go signed with evidence |

## Phase 1 — Design system & UI foundations

| Slice | Goal | Key acceptance criteria | Depends on | Size |
|---|---|---|---|---|
| **1.1** Workspace + web scaffold + tooling | Reproducible monorepo with every gate wired, before any UI | See detailed definition below | D-024, D-052, D-056 | M |
| 1.2 Design tokens + theme | Tokens as the single colour/type/space source; contrast verified | `/design` token sheet; contrast table committed; no raw hex outside tokens (lint/grep) | 1.1 | S |
| 1.3 Core components | Accessible component kit with all states | Gallery with states; axe clean; unit tests for StatusBadge, DataTable, ConfirmDialog focus return — REQ-X-UX-1, 2, 5, 6 | 1.2 | L |
| 1.4 App shells + navigation | Public, auth and workspace shells; role-based nav; tenant switcher (screen 47); system states (56) | Nav per demo role; 360 px + 1440 px; keyboard path in Playwright | 1.3, D-028, D-038 | M |
| 1.5 Key screens on demo data | Screens 7, 15, 21–22, 39, 41, 42, 43, 29 via typed client → `mocks/` | Each: states via fixture toggles, responsive, axe clean, smoke test, "Demo data" badge | 1.4, D-034 (formatting), D-035 (contracts) | L |

## Phase 2 — Platform foundation (R1)

| Slice | Goal | Key acceptance criteria | Depends on | Size |
|---|---|---|---|---|
| 2.1 API scaffold + local infra | NestJS, config schema, Prisma, Compose (Postgres, MinIO, Mailpit), health/ready, request id, redacting logger, error envelope, validation, OpenAPI, test DB | `/ready` fails when DB down; envelope shape; `Authorization` redacted (test) — REQ-X-UX-3, 4, REQ-X-DOD-6 | Phase 1 exit, D-005, D-035 | M |
| 2.2 Tenancy schema + platform tenant management | Tenant, Branch, Department/JobRole stubs, TenantSetting, AuditEvent; composite-FK pattern | REQ-A-1…5; DB rejects mismatched tenant link (integration test) | 2.1, D-048 | M |
| **2.3a** Outbox job runner + EmailProvider *(added in Phase 0)* | Postgres job table, worker loop, retries with backoff, `EmailProvider` (console + Mailpit) | Job business-key uniqueness; retry does not double-send; status lifecycle — REQ-X-JOB-1, 3 | 2.1, D-040 | S |
| 2.3 Identity + authentication | User, AuthSession, Argon2id, login/logout, CSRF, verification, reset, rate limits, revocation; web login/reset wired | Uniform login errors; reset single-use + expiring; deactivated sessions fail next request; no tokens in logs — REQ-B-4 | 2.2, 2.3a, D-010, D-049, D-051 | L |
| 2.4 Memberships, roles, permissions, request context | Membership, BranchMembership, fixed roles, permission registry, RoleAssignment, guards, scope helpers, tenant switch, support session | REQ-X-ISO-1, 3, REQ-B-3, 6; registry = matrix (test) | 2.3, D-026, D-037, D-053 | L |
| 2.5 Tenant admin people basics | Users list/detail, deactivate/reactivate, branch memberships, departments/job roles, general settings; replaces demo screens | Branch admin sees only own branches by default, filter and cursor — REQ-A-6 | 2.4, D-047 | M |
| 2.6 Isolation suite + seed + CI hardening | Two-tenant fixture, specs for every R1 resource, idempotent seed, CI with Postgres + Playwright smoke | REQ-X-ISO-2, 4, 5; seed refuses production | 2.5 | M |

## Phase 3 — People & course content (R2, part 1)

| Slice | Goal | Key acceptance criteria | Depends on | Size |
|---|---|---|---|---|
| 3.1 Invitations | Create/list/resend/revoke, accept (new + existing account) | REQ-B-1, 2; link never logged; audited | 2.6, D-050, D-033 | M |
| 3.2 Groups | CRUD, scope, manual membership | Branch admin limited to own branches; removal keeps history — REQ-B-5 | 2.6 | S |
| 3.3 Categories, tags, course drafts | Category/Tag, Course + draft version, builder step 1, optimistic concurrency | REQ-C-1; concurrent edit → 409 | 2.6 | M |
| 3.4 Storage + assets | StorageService (MinIO), sniffed uploads, signed URLs, mock VideoProvider | Cross-tenant signed URL denied; disallowed type rejected; URLs never logged | 3.3, D-006, D-009 | M |
| 3.5 Content builder | Modules, lessons (text, video, document, link, quiz placeholder), ordering, per-type completion rules | REQ-C-4, 5 | 3.4, D-041, D-012 | L |
| 3.6 Publish + versioning + archive | Validation, immutable version, edit-after-publish draft, archive | REQ-C-2, 7; no endpoint mutates a published version | 3.5, D-022, D-011 | M |
| 3.7 Catalog | Tenant catalog + course detail; public catalog only if D-021 | REQ-C-6; internal courses never public | 3.6, D-021, D-046 | M |
| **3.8** Tenant branding *(added in Phase 0)* | Logo upload + primary colour with contrast guard; used by shell, public catalog and certificates | Colour failing 4.5:1 for text use is rejected or mapped to an accessible variant; logo via StorageService | 3.4 | S |

## Phase 4 — Core learning lifecycle (R2 — the MVP)

| Slice | Goal | Key acceptance criteria | Depends on | Size |
|---|---|---|---|---|
| 4.1 Assignments + enrollment fan-out | Targets, idempotent fan-out job, sources, group changes, past-due rule, cancellation, "why" view | REQ-C-3, REQ-D-1, 2, 3, 4, 6, 7 | 3.6, 3.2, D-004, D-032, D-045, D-046, D-054 | L |
| 4.2 Learner dashboard + My Learning | Real data for screens 39–40; overdue derived in tenant timezone | REQ-D-5, REQ-E-1; boundary tests in two timezones | 4.1 | M |
| 4.3 Player + progress | Navigation, throttled idempotent progress, resume, per-type rules, media errors | REQ-E-2, 3, 4, 5, REQ-F-5 | 4.2, 3.5 | L |
| 4.4 Assessments | Question bank, builder, version freeze, attempts, server scoring, review | REQ-F-1, 2, 3, 4, 7 | 4.3, D-023, D-042, D-055 | L |
| 4.5 Completion policy | Server-evaluated policy, completion once, LearningEvent | REQ-F-6 (completion part) | 4.4, D-016 | M |
| 4.6 Certificates | Template versions, idempotent award job, PDF snapshot + hash, download, search, revoke/reissue, public verify | REQ-G-1…6, REQ-A-4 (evidence) | 4.5, 3.8, D-017 | L |
| 4.7 Basic reports | Learner progress, course completion, overdue — scoped, with scope banner | REQ-H-4 (basic) | 4.6 | M |

## Phase 5 — Training operations (R3)

| Slice | Goal | Key acceptance criteria | Depends on | Size |
|---|---|---|---|---|
| 5.1 Compliance requirements + status engine | Requirements, applicability, computed status, evidence, renewal | REQ-H-1, 2 | Phase 4, D-018, D-047 | L |
| 5.2 Compliance dashboards + reports | Tenant/branch views, expiring certificates, branch comparison (screen 58) | REQ-H-4; Compliance Viewer read-only | 5.1, D-026 | M |
| 5.3 CSV exports (async) | Export jobs reusing report queries, escaping, limits, retry, signed download, audit (screen 51) | REQ-H-3, 5, 6 | 5.2 | M |
| 5.4 Surveys | Builder, versions, audience/window, anonymity, results | REQ-I-1…6 | Phase 4, D-020 | L |
| 5.5 Classroom sessions | Venues, sessions, registration, roster, attendance, completion via policy | REQ-J-1…6 | Phase 4, D-016, D-019 | L |
| 5.6 Notifications | Events, minimal tenant templates, delivery state, reminders | Email outage never rolls back learning; no double-send | 2.3a, 5.5 | M |
| **5.7** Bulk user import *(added in Phase 0, per D-044)* | CSV upload, whole-file validation, preview, idempotent commit, error report | REQ-B-7 | 5.3, D-044 | M |

## Phase 6 — Commerce & analytics (R4)

Commerce slices (6.1–6.3) start only when D-007, D-008 and D-029 are **Confirmed**; otherwise build 6.4–6.5 only.

| Slice | Goal | Key acceptance criteria | Depends on | Size |
|---|---|---|---|---|
| 6.1 Offers, prices, orders | Minor-unit prices, server-side orders, state machine | REQ-K-3 | D-007, D-029 | M |
| 6.2 Provider adapter + checkout + webhooks | Hosted checkout (test mode), verified webhooks, dedup, entitlement | REQ-K-1, 2, 4, 5 | 6.1 | L |
| 6.3 Refunds + reconciliation | Refund flow, access policy, reconciliation (screens 48–49) | REQ-K-6 | 6.2, D-008 | M |
| 6.4 Metric dictionary + standard analytics | `docs/METRICS.md` complete; tested metric functions; dashboards | REQ-L-1, 2, 6 | Phase 5 | L |
| 6.5 Governed report builder + saved reports | Approved dimensions/metrics, save/share/rerun/export (screen 50) | REQ-L-2, 3, 4, 5 | 6.4, 5.3 | L |
| 6.6 Platform subscription overview | Plans, usage on platform dashboard | — | D-027 Confirmed | M |

## Phase 7 — Production readiness

| Slice | Goal | Depends on | Size |
|---|---|---|---|
| 7.1 Security review | Threat model, audit, headers, secret scanning, optional RLS — REQ-X-DOD-2, REQ-X-ISO-6 | Phase 6 (or 4 for an MVP launch) | L |
| 7.2 Accessibility | Keyboard + screen-reader passes, `docs/ACCESSIBILITY.md` — REQ-X-DOD-7 | 7.1 | M |
| 7.3 Performance | Targets (D-013), representative volume, load tests | D-013 | M |
| 7.4 Operations | Deploy pipeline, backups + executed restore, alerts, runbook — REQ-X-DOD-4, 5, 6 | D-015 | L |
| 7.5 Legacy migration rehearsal | Only if D-036 Confirmed | D-036 | L |
| 7.6 Release checklist | `docs/RELEASE_CHECKLIST.md` from spec §21 + Appendix A | 7.1–7.4 | S |

An MVP launch after Phase 4 (R1 + R2 only) is possible by running Phase 7 then; the owner decides (not yet recorded).

---

## Phase 1, Slice 1.1 — detailed definition

**Goal.** A pnpm monorepo containing a minimal `apps/web` (Next.js App Router, TypeScript strict) where every quality
gate is real and green, so later slices only add features. No screens, no components, no design tokens yet.

**Preconditions (owner).** Confirm D-024 (pnpm monorepo), D-052 (Node version) and D-056 (GitHub Actions) — queue
items 1–3 in `docs/DECISIONS.md`. If D-052 is not confirmed, the slice uses Node 24 LTS and records that.

**Files to create**

| Path | Purpose |
|---|---|
| `package.json` (root) | Workspace scripts: `dev`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:e2e`, `build`, `verify`; `packageManager` pinned; `engines.node` |
| `pnpm-workspace.yaml` | `apps/*`, `packages/*` |
| `.nvmrc` | Node major per D-052 |
| `.editorconfig` | Consistent whitespace |
| `.prettierrc.json` + `.prettierignore` | Formatting; `proseWrap: "preserve"` so existing docs are not rewrapped; ignore `reference/`, `assets/`, lockfile, generated output |
| `eslint.config.mjs` | Flat config shared by workspaces (Next.js + TypeScript rules) |
| `tsconfig.base.json` | `strict: true`, shared compiler options; workspaces extend it |
| `apps/web/` | Next.js App Router app: one placeholder page (`/`) reading "VacheLearn — scaffold" with no claims or metrics; `tsconfig.json`; path alias `@/*` |
| `apps/web/vitest.config.ts` + one unit test | Proves the unit runner works (e.g. a trivial `cn()`/util test) |
| `apps/web/playwright.config.ts` + `apps/web/e2e/smoke.spec.ts` | Opens `/`, asserts heading, runs axe with zero violations |
| `.github/workflows/ci.yml` | On push/PR: install with frozen lockfile, `pnpm verify`, install Playwright browsers, `pnpm test:e2e` |
| `README.md` (update) | Prerequisites with versions, setup and run commands that were actually executed |
| `CLAUDE.md` (update) | Commands table reflects the real scripts; note Phase 1 has no API/DB commands yet |
| `docs/RUNBOOK.md` (update) | "Local development" section with the exact commands run |

**Commands to run (and paste results in the report).** `node -v`, `pnpm -v`; generate the Next.js app with the
current `create-next-app` (flags checked against its `--help` at the time, App Router + TypeScript + ESLint, no
Turbopack-only assumptions), then `pnpm install`, `pnpm verify`, `pnpm exec playwright install --with-deps chromium`
(WSL needs the system deps; may require the owner to run with sudo), `pnpm test:e2e`. Finally a clean-clone check:
`git clone` to a scratch directory → `pnpm install --frozen-lockfile && pnpm verify`.

**New dependencies (each justified in the plan step, current stable majors verified against official docs first).**
`next`, `react`, `react-dom` (D-002) · `typescript` (strict TS) · `eslint` + Next/TypeScript configs (lint gate) ·
`prettier` (format gate; also activates the existing format hook) · `vitest` + `@testing-library/react` + `jsdom`
(unit tests, web rule) · `@playwright/test` + `@axe-core/playwright` (E2E + accessibility checks, testing rule).
Tailwind and shadcn/ui are **not** added in 1.1 — they arrive with tokens in 1.2.

**Acceptance criteria**

1. `pnpm install && pnpm verify` passes on a clean clone (format check, lint, typecheck, unit test, build).
2. `pnpm test:e2e` passes locally: smoke test loads `/`, finds the heading, and axe reports zero violations.
3. `.github/workflows/ci.yml` exists and runs the same gates; first CI run result reported (or "not run — not pushed",
   since pushing needs owner approval).
4. `.nvmrc` and `packageManager` pin the versions in D-052; `engines` rejects older Node.
5. `pnpm format:check` does not report or rewrite any file under `docs/`, `prompts/`, `reference/` or `assets/`.
6. CLAUDE.md Commands table and README match the scripts that exist; no command listed that does not run.
7. No secrets, `.env` files or real credentials added; `.env.example` unchanged unless a variable is introduced.
8. No UI beyond the placeholder page; nothing presented as a working feature.

**What the owner can see.** `pnpm dev` → http://localhost:3000 shows the placeholder page; `pnpm verify` and
`pnpm test:e2e` print green summaries; the CI workflow file is ready (and green on GitHub once you approve a push).

**Out of scope for 1.1.** Tokens, Tailwind, shadcn/ui, components, shells, API, database, Docker.
