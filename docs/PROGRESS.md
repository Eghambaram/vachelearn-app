# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
**Phase 2 · Platform foundation (R1) — Slice 2.3a done, awaiting commit approval** (Postgres job runner + email
adapter). 2.2 committed a2ae10b; 2.1 cd9d922 (CI 40462313968 success). Phase 1 approved 2026-10-26 (a51d042).

## Last verified
2026-10-28, Node v24.21.0, pnpm 12.8.1, Postgres 18 + Mailpit (Docker), on the final 2.3a tree:
- `pnpm verify` → exit 0 · contracts 53, web 541, api 138 (14 files: real Postgres + Mailpit) · build OK
- `pnpm --filter api test:isolation` → 69 passed · `pnpm audit --prod` → no known vulnerabilities
- `pnpm test:e2e` not rerun (web unchanged since 236 passed on the 2.2 tree)

## Done in this phase
Phase 1 (1.1–1.5.8 + exit gate): `docs/progress-log/2026-10.md`; approved by the owner 2026-10-26 (a51d042).
- 2.1 API scaffold: NestJS 12, Prisma 7, Zod config, request IDs, error envelope, pino redaction, probes, compose (cd9d922).
- 2.2 tenants, settings, branches, insert-only audit, deny-by-default guard, signed cursors, isolation suite (a2ae10b).
- 2.3a `jobs` outbox (D-040: unique type+key, SKIP LOCKED claims, 5 attempts 30 s→1 h, 5-min lease + heartbeat,
  sanitised `last_error`) · in-process `JobWorker` (`JOBS_WORKER`) · `EmailProvider` console/SMTP (nodemailer 10.2.1)
  · email jobs send once (`email_deliveries`), tokens minted at send (D-081) · TLS required in production · shared
  `scrubSecrets` for all logged errors · empty env values = unset · CI Mailpit · security review: no Critical; High +
  Mediums + most Lows fixed (uncommitted).

## In progress / uncommitted
- Slice 2.3a — awaiting the owner's go-ahead to commit and push.

## Next step
Commit 2.3a on approval, then plan Slice 2.3 (users, sessions, login/logout, verification, reset; D-010/D-049/D-051
Confirmed 2026-10-28): apply the 2.1 security-review list below and the D-081 token rules. 2.4 resolver must: load the membership from the session only, refuse
suspended/archived tenants (403 `TENANT_SUSPENDED`), derive branch scope from role assignments, never trust a header.

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened); decide D-076 (verifying suspended tenants'
  certificates).
- Phase 2: D-053, D-037 (before 2.4) · D-047 (2.5) · review D-080 · D-082 production email provider (before launch).

## Known issues
- Node 26 not yet LTS (nodejs.org, 2026-10-20); bump `.nvmrc`/`engines` once it is (reported 2026-10-28).
- `engineStrict` is enforced on fresh installs only; an existing `node_modules` skips the check ("Already up to date").
- D-058: TypeScript pinned ~6.0 and ESLint plugin peer exception — revisit when typescript-eslint supports TS 7.
- `src/styles/vendor/shadcn-variants.css` is vendored (shadcn@4.22.1, MIT); `shadcn add` / `prettier --write` run from
  `apps/web` reformat it — restore with `git checkout` after adding components.
- Proposed status tones (UI spec §Status tones) await owner review in the gallery.
- E2E is load-sensitive on WSL (8 cores, 7 GB RAM): local workers capped at 2 (CI default); full suite ~6 min locally,
  < 1 min on CI. Per-test timeout 60 s; `components.spec.ts` and `course-builder.spec.ts` 90 s (axe on very large
  pages). Builder: drag-and-drop and moving lessons between modules not built (buttons only). Unit tests too: with api
  + web in parallel, two web component tests once hit the 15 s timeout (2026-10-27); green on rerun — watch for repeats.
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
- Exit-gate review Lows (stepper "(completed)", catalog/enrol spelling drift, donut colours, < 24 px targets, Select
  blank before hydration) and untested surfaces (screen readers, Safari, Firefox, touch, zoom, High Contrast): log.
- Certificate preview builds its printed verification address from request headers (`siteOrigin`); Phase 2 should
  use a configured public base URL (QA note, exit gate).
- Slice 2.3 must add (security review of 2.1): helmet/security headers on the API (+ web `next.config.ts`), CSRF
  (Origin/`Sec-Fetch-Site` check + token on every mutation; no-Origin mutations refused), `__Host-` session cookie,
  exact `trust proxy` hops (never `true`) before IP rate limits, Postgres-backed rate limits (login, reset, invite,
  `/ready`, `/verify`), small body limits on auth routes, `AUTH_SECRET`/`SESSION_SECRET` in `EnvSchema` refusing
  placeholders in production, uniform auth errors with Argon2id dummy hashing, a test that a login password never
  reaches the logs.
- Container images and GitHub actions are tag-pinned, not digest-pinned (security review 2.1, F8, Low).
- 2.3a review, logged: job lease heartbeat (60 s) has no automated test; jobs rows are never pruned (add a cleanup
  job later); the console email provider logs the subject, so subjects must carry no personal data.
- Phase 7 (isolation audit 2.2): the app connects as the table owner, so the `audit_events` trigger is the only guard
  (an owner can TRUNCATE or disable it) — add a separate runtime role with `REVOKE UPDATE, DELETE, TRUNCATE`.
- Phase 5 rules from the 1.5.8 audit: signed keyset cursors without personal data (+ as-of date), export request
  without cursor/limit, scope snapshot + re-check, CSV formula escaping — in `lib/api/cursor.ts` and
  `contracts/src/compliance.ts` comments.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages, file
  content written via heredoc, or code such as `r.key`) — use the Write tool or reword; don't weaken the hook.
