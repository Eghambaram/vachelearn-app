# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
**Phase 2 · Platform foundation (R1) — Slice 2.4d done** (real sessions in the web shell). 2.4c
b6ecdfd + c5893db; 2.4b 37e9a3b; 2.4a 97ef679; Slice 2.3 done (53135bf). Phase 1 approved (a51d042). Next: 2.5.

## Last verified
2026-10-30, Node v24.21.0, pnpm 12.8.1, Postgres 18 + Mailpit (Docker), on the final 2.4d tree:
- `pnpm verify` → exit 0 · contracts 53, web 587, api 289 · build OK
- `pnpm --filter api test:isolation` → 174 passed (3 runs; one earlier run had 5 uncaptured failures, not reproduced)
- `pnpm test:e2e` → 250 passed

## Done in this phase
Phase 1 (1.1–1.5.8 + exit gate): `docs/progress-log/2026-10.md`; approved by the owner 2026-10-26 (a51d042).
- 2.1 API scaffold (cd9d922) · 2.2 tenancy + isolation suite (a2ae10b) · 2.3a jobs + email (353a2e2) · 2.3b sign-in +
  sessions (360f8f6) · 2.3c password links + `user:create` (68f5930) · 2.3d web sign-in + proxy + headers (53135bf).
- 2.4a memberships, fixed roles, real request context, `user:grant` (97ef679).
- 2.4b role-assignment API + first Tenant Admin (D-091–D-095) (37e9a3b).
- 2.4c support sessions: `/platform/support-sessions` start/current/end; read-only SS context, 60 min, bound to the
  opening browser session, every request audited with the session id; ends on end/expiry/sign-out/archive/role loss
  (D-037, D-098). Audit fixes (follow-up commit): denied attempts audited, read-only on every route, composite FKs
  for support audit rows, ended on every browser-session end + archive + sweep, D-099 Needs decision.
- 2.4d web: real session in the shell (`GET /auth/session`), workspace by most capable role + picker (D-096, D-089),
  "Not available yet" on demo screens for real sessions (D-097), real sign-out, `/platform/support` + banner (D-037).

## In progress / uncommitted
- Nothing.

## Next step
Plan 2.5: people basics (invite/create members in a tenant, deactivate with the same tenant lock +
D-095 predicate; D-047 first). Use the tenant-isolation-auditor on 2.5.

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened); decide D-076 (verifying suspended tenants'
  certificates).
- Phase 2: D-047 (2.5) · review D-080, D-086, D-088, D-090, D-095, decide D-099, and the matrix split note (PSA `saved_report.manage`) ·
  D-082 production email provider (launch).

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
- Radix: DropdownMenu `modal={false}` (axe `aria-hidden-focus`); radio groups need `keyboard.down`/`up` in tests.
  Accessible names must contain the visible label (WCAG 2.5.3): append screen-reader text, don't replace it.
- Stopping a local `next start`: the process renames itself `next-server`, so `pkill -f "next start"` misses it (and a
  plain pattern kills the calling shell). Kill the PID from `ss -ltnp | grep :3100`. A stale server on 3100 is
  reused by Playwright (`reuseExistingServer`) and serves an old build.
- `.gitignore` patterns are anchored (`/build/`, `/apps/*/build/` …): a bare `build/` hid the builder route from git.
  `pnpm check:ignored-source` (first step of verify) fails if any source file under apps/ or packages/ is ignored.
- Before any public deployment (security reviews 1.5.7, 2.3d): nonce-based `script-src` CSP for the web, HSTS at
  the edge (checked), `API_INTERNAL_URL` set (the build only warns), the web→API hop private or https.
- Exit-gate review Lows (stepper "(completed)", catalog/enrol spelling drift, donut colours, < 24 px targets, Select
  blank before hydration) and untested surfaces (screen readers, Safari, Firefox, touch, zoom, High Contrast): log.
- Certificate preview builds its printed verification address from request headers (`siteOrigin`); Phase 2 should
  use a configured public base URL (QA note, exit gate).
- Still open from the 2.1 review list: rate limits on invites (Phase 3) and on `/ready` and `/verify` (before any
  public deployment).
- 2.3d reviews, logged: a set-password link opened on a shared PC stays in that browser's global history (single use
  + expiry are the controls); password managers get no username on the set-password form (API could return the
  address for a valid token); e2e shares `vachelearn_test` with the API tests (never run both at once) and reuses a
  running API on :4100 locally.
- Logged review Lows (detail in the log): no sign-in load test; Argon2 cost rise needs rehash-on-sign-in; job lease
  heartbeat untested; job rows never pruned; email subjects carry no personal data; images/actions tag-pinned.
- Phase 7 (isolation audit 2.2): the app connects as the table owner, so the `audit_events` trigger is the only guard
  (an owner can TRUNCATE or disable it) — add a separate runtime role with `REVOKE UPDATE, DELETE, TRUNCATE`.
- Phase 5 rules from the 1.5.8 audit: signed keyset cursors without personal data (+ as-of date), export request
  without cursor/limit, scope snapshot + re-check, CSV formula escaping — in `lib/api/cursor.ts` and
  `contracts/src/compliance.ts` comments.
- 2.4a audit, for Phase 4: grants keep one kind per permission (own + branches → branches only; fails closed) — keep
  a union per key before services use `own`/`assigned` (4.1). Matrix qualifiers `B (LRN, INS only)`, `B (within own
  branches)`, `A (own learners)`, `A (own sessions: edit, not create)` are enforced by the owning services (2.4b, 2.5,
  5.5). Prisma's AI guard refuses `migrate reset` without the owner's explicit consent: fix local migrations forward.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages, file
  content written via heredoc, or code such as `r.key`) — use the Write tool or reword; don't weaken the hook.
