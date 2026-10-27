# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
**Phase 2 · Platform foundation (R1) — Slice 2.1 done** (API scaffold + local infrastructure, commit cd9d922). Next: Slice
2.2 (tenancy schema + platform tenant management). Phase 1 approved 2026-10-26 (a51d042).

## Last verified
2026-10-27, Node v24.21.0, pnpm 12.8.1, Docker 29.8, on the final 2.1 tree:
- `pnpm verify` → exit 0 · unit/integration: contracts 53, web 541, api 29 (6 files, real Postgres 18) · build OK
- Clean-clone run (copy of tracked files, `install --frozen-lockfile` → `services:up` → `db:migrate` → `verify`):
  install, services, migrate exit 0; verify exit 0 (first run: one contracts timezone test timed out at 6.4 s under
  parallel load → 15 s allowance, then green)
- `pnpm test:e2e` → exit 0 · 236 passed (web unchanged since); `pnpm audit --prod` → no known vulnerabilities
- Running server: `/ready` 503 `NOT_READY` with Postgres stopped, 200 after restart; missing `DATABASE_URL` exits 1

## Done in this phase
Phase 1 (1.1–1.5.8 + exit gate): `docs/progress-log/2026-10.md`; approved by the owner 2026-10-26 (a51d042).
- 2.1 `apps/api` NestJS 12 (D-003) + Prisma 7 stable (D-005 Confirmed) · Zod config (fail fast, nothing fails open) ·
  server-generated request IDs · error envelope filter · `ZodValidationPipe` + Zod→OpenAPI (D-077) · pino with header
  allowlist, deep redaction, scrubbed error serializer · CORS = web origin only · `/health` `/ready` · Postgres 18 +
  Mailpit compose on 55432/51025/58025 (no object storage, D-078) · contracts CommonJS build for the API · shared
  local-database guard (reset opt-in) · CI Postgres service + `pnpm audit --prod` · multer override (GHSA) (cd9d922).

## In progress / uncommitted
- Nothing.

## Next step
Plan Slice 2.2: Tenant, Branch (code unique per tenant), minimal TenantSetting,
AuditEvent; composite-key pattern; platform tenant CRUD + suspend/reactivate with reason; needs D-031 (feature flags)
and D-048 (tenant profile fields) confirmed first. Use the tenant-isolation-auditor on 2.2.

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened); decide D-076 (verifying suspended tenants'
  certificates).
- Phase 2: D-031, D-048 (before 2.2) · D-010, D-049, D-051 (before 2.3) · D-053, D-037 (before 2.4) · D-047 (2.5).

## Known issues
- Node 26 not yet LTS (nodejs.org, 2026-10-20); bump `.nvmrc`/`engines` once it is (reported 2026-10-28).
- `engineStrict` is enforced on fresh installs only; an existing `node_modules` skips the check ("Already up to date").
- D-058: TypeScript pinned ~6.0 and ESLint plugin peer exception — revisit when typescript-eslint supports TS 7.
- `src/styles/vendor/shadcn-variants.css` is a vendored copy (shadcn@4.22.1, MIT); `shadcn add` and `prettier --write`
  run from `apps/web` (root ignore file not applied) reformat it —
  restore with `git checkout` after adding components.
- Proposed status tones (UI spec §Status tones) await owner review in the gallery.
- E2E is load-sensitive on WSL (8 cores, 7 GB RAM): local workers capped at 2 (CI default); full suite ~6 min locally,
  < 1 min on CI. Per-test timeout 60 s; `components.spec.ts` and `course-builder.spec.ts` 90 s (axe on very large
  pages). Builder: drag-and-drop and moving lessons between modules not built (buttons only).
- recharts animation is JS and ignores `prefers-reduced-motion`: set `isAnimationActive={false}` on every series.
- Course list filters stack above the table on phones; a collapsible filter drawer is a candidate follow-up.
- Radix modal DropdownMenu aria-hides the page (axe `aria-hidden-focus`): every DropdownMenu uses `modal={false}`.
- Accessible names must contain the visible label (axe `label-content-name-mismatch`, WCAG 2.5.3): append screen-reader
  context instead of replacing the name with `aria-label`.
- Stopping a local `next start`: the process renames itself `next-server`, so `pkill -f "next start"` misses it (and a
  plain pattern kills the calling shell). Kill the PID from `ss -ltnp | grep :3100`. A stale server on 3100 is
  reused by Playwright (`reuseExistingServer`) and serves an old build.
- `.gitignore` patterns are anchored (`/build/`, `/apps/*/build/` …): a bare `build/` hid the builder route from git.
  `pnpm check:ignored-source` (first step of verify) fails if any source file under apps/ or packages/ is ignored.
- Radix radio groups select on arrow-key focus only while the key is held (focus moves in a `setTimeout`): Playwright
  tests use `keyboard.down`/`up`, not `press` (`e2e/attempts.spec.ts`).
- No app-wide security headers yet (CSP, `frame-ancestors`, `Referrer-Policy`, HSTS in `next.config.ts`): security
  review 1.5.7 — add before any public deployment (Phase 2 / 7).
- Exit-gate review, logged (Low): builder stepper says "(completed)" for any visited step even with open issues
  (`components/stepper.tsx`); spelling drift "catalog"/"catalogue", "enrol"/"enroll" (`messages/en.ts`); platform
  status donut uses chart colours, not status tones; some controls under the project's 24 px target (pass WCAG 2.5.8
  by spacing); Radix Select values are blank until hydration (server HTML). Not tested: real screen readers, Safari,
  Firefox, touch, 200–400 % zoom, Windows High Contrast (emulation only).
- Certificate preview builds its printed verification address from request headers (`siteOrigin`); Phase 2 should
  use a configured public base URL (QA note, exit gate).
- Slice 2.3 must add (security review of 2.1): helmet/security headers on the API (+ web `next.config.ts`), CSRF
  (Origin/`Sec-Fetch-Site` check + token on every mutation; no-Origin mutations refused), `__Host-` session cookie,
  exact `trust proxy` hops (never `true`) before IP rate limits, Postgres-backed rate limits (login, reset, invite,
  `/ready`, `/verify`), small body limits on auth routes, `AUTH_SECRET`/`SESSION_SECRET` in `EnvSchema` refusing
  placeholders in production, uniform auth errors with Argon2id dummy hashing, a test that a login password never
  reaches the logs.
- Container images and GitHub actions are tag-pinned, not digest-pinned (security review 2.1, F8, Low).
- Phase 5 rules from the 1.5.8 audit: signed keyset cursors without personal data (+ as-of date), export request
  without cursor/limit, scope snapshot + re-check, CSV formula escaping — in `lib/api/cursor.ts` and
  `contracts/src/compliance.ts` comments.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages, file
  content written via heredoc, or code such as `r.key`) — use the Write tool or reword; don't weaken the hook.
