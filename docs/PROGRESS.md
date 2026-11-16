# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
**Phase 3 · People and content — slice 3.2 (groups) done and committed; next: plan slice 3.3.**
Phase 2 approved by the owner 2026-11-13 (exit gate be2af4e…462ba53, CI green); Phase 1 approved (a51d042).

## Last verified
2026-11-13, Node v24.21.0, pnpm 12.8.1, Postgres 18 + Mailpit (Docker), slice 3.2 with D-125 built:
- `pnpm verify` exit 0 (contracts 56, web 745, api 490 incl. isolation; lint 0 errors, 2 old warnings; build OK) ·
  `pnpm test:e2e` 279 passed, 0 failed (10.2 min, desktop + 360 px, axe).

## Done in this phase
Phase 1 (1.1–1.5.8 + exit gate): `docs/progress-log/2026-10.md`; approved by the owner 2026-10-26 (a51d042).
- 2.1 API scaffold (cd9d922) · 2.2 tenancy + isolation suite (a2ae10b) · 2.3a–d jobs + email, sign-in + sessions,
  password links + `user:create`, web sign-in + proxy (353a2e2…53135bf) · 2.4a memberships, roles, `user:grant`
  (97ef679) · 2.4b role assignment + first Tenant Admin (37e9a3b) · 2.4c support sessions (D-037, D-098) · 2.4d real
  session in the shell (b66e997) · 2.5a people API (e3e53e7) · 2.5b users/roles screens (7fb2164) · 2.5c branches,
  settings, job roles (1ef1c25) · 2.6a audit log (d566646) · 2.6b two-tenant fixture, R1 matrix, `db:seed` (8fb01dc)
  · 2.6c per-role Playwright smoke on the seed (28da977) · client demo (D-110, D-111; RUNBOOK "Client demo") · exit
  gate: isolation demo, reviews + fixes (D-106, D-112, D-113, D-037), QA (be2af4e, 408c50c). Detail:
  `docs/progress-log/2026-11.md`.
- 3.1 invitations: API, email job, web list/invite/accept, Settings validity, reviews fixed (5d88451, 608a9a0).
- 3.2 groups: schema + triggers, API, D-120 branch hook, invitation group (D-122), web screens, reviews fixed,
  D-123–D-126 Confirmed (D-125 D-101 reach on add/remove). Detail: `docs/progress-log/2026-11.md`.

## In progress / uncommitted
- Nothing.

## Next step
Plan slice 3.3 from `prompts/phase-3-*.md` (show the plan; wait for approval). Phase 4 must still re-check each
member's reach on group assignment fan-out (D-125).

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened); decide D-076 (verifying suspended tenants'
  certificates).
- Phase 2: review D-080, D-088, D-090, D-095, decide D-099, and the matrix split note (PSA `saved_report.manage`) ·
  D-082 production email provider (launch) · D-114 demo video source and licence.

## Known issues
- Older review Lows logged, not fixed (Phase 2 gate, exit gate, 2.3d, misc): `docs/progress-log/2026-11.md`
  "Logged review Lows (moved from PROGRESS)".
- 3.2 reviews, logged: bulk add holds the tenant lock across up to 100 audit inserts (batch them; per-user write rate
  limit before public deployment); the D-123 `inviter_cannot_manage` path has no test (no fixture role holds
  `invitation.create` without `group.member.manage`); invite page reads at most 100 groups.
- Screen-reader-only name suffix written as `<span className="sr-only"> {name}</span>` loses the space in name
  computation ("AddAsha"): fixed in groups; ~10 earlier components (invitation-list, person-branches, learner
  dashboard, my-learning, player, site chrome, layouts) still use it — small follow-up.
- Node 26 not yet LTS (nodejs.org, 2026-10-20); bump `.nvmrc`/`engines` once it is (reported 2026-10-28).
- `engineStrict` is enforced on fresh installs only; an existing `node_modules` skips the check ("Already up to date").
- D-058: TypeScript pinned ~6.0 and ESLint plugin peer exception — revisit when typescript-eslint supports TS 7.
- `src/styles/vendor/shadcn-variants.css` is vendored (shadcn@4.22.1, MIT); `shadcn add` / `prettier --write` run from
  `apps/web` reformat it — restore with `git checkout` after adding components.
- Proposed status tones (UI spec §Status tones) await owner review in the gallery.
- Next briefly re-renders `<head>` without `<title>` after a server action refresh (axe caught it once); the real-session
  axe helper waits for the title. Lint: unused `_modules` in `learn/catalog/page.tsx` and `t/[slug]/page.tsx` (warnings).
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
- Before any public deployment (security reviews 1.5.7, 2.3d, demo): nonce-based `script-src` CSP for the web, HSTS at
  the edge (checked), `API_INTERNAL_URL` set (the build only warns), the web→API hop private or https,
  `ENABLE_DEMO_CONTENT` unset (nothing enforces it — `next start` always runs as production, so a NODE_ENV guard cannot
  tell a local demo apart; since the Phase 2 gate it shows samples only in the two seeded `demo-*` tenants), no
  `.dockerignore` yet (add one excluding env files, `public/demo-media`, `.next/cache` before Phase 7 images).
- Certificate preview builds its printed verification address from request headers (`siteOrigin`); Phase 2 should
  use a configured public base URL (QA note, exit gate).
- Still open from the 2.1 review list: rate limits on `/ready` and `/verify` (before any public deployment); invites
  done in 3.1 (D-117).
- E2E resets the test database's rate-limit counters before each sign-in/set-password (`e2e-reset-limits`, `*_test`
  only); never run the API tests and e2e at the same time (shared `vachelearn_test`).
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
