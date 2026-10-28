# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
**Phase 2 · Platform foundation (R1) — Slice 2.3d done, awaiting commit approval** (web sign-in, proxy, headers).
Slice 2.3 = 2.3a–d (owner, 2026-10-28): 353a2e2, 360f8f6, 68f5930 (CI success each). Phase 1 approved (a51d042).

## Last verified
2026-10-28, Node v24.21.0, pnpm 12.8.1, Postgres 18 + Mailpit (Docker), on the final 2.3d tree:
- `pnpm verify` → exit 0 · contracts 53, web 574 (38 files), api 194 (17 files) · build OK
- `pnpm --filter api test:isolation` → 79 passed
- `pnpm test:e2e` → exit 0 · 244 passed (5.8 min; API on :4100 + web on :3100, auth through Mailpit)

## Done in this phase
Phase 1 (1.1–1.5.8 + exit gate): `docs/progress-log/2026-10.md`; approved by the owner 2026-10-26 (a51d042).
- 2.1 API scaffold (cd9d922) · 2.2 tenancy + isolation suite (a2ae10b) · 2.3a jobs + email (353a2e2) · 2.3b sign-in +
  sessions (360f8f6) · 2.3c password links + `user:create` (68f5930).
- 2.3d web: `/api/v1` proxy (D-085; Next forwards client XFF unchanged → hops = appending proxies in front of the web,
  ≥ 1 in production), headers (frame/base/form/object CSP, XFO DENY, COOP, nosniff, no-referrer + no-store on link
  pages), `/login` `/forgot-password` `/set-password` `/reset-password` `/welcome` + sign-out · e2e drives the real
  API + Mailpit · security + UX reviews: no Critical/High open; fixes applied (uncommitted).

## In progress / uncommitted
- Slice 2.3d — awaiting the owner's go-ahead to commit and push.

## Next step
Commit 2.3d on approval, then plan Slice 2.4 (memberships, fixed roles D-053, platform roles, support access D-037;
decide D-053 and D-037 first). 2.4 resolver must: load the membership from the session only, refuse suspended or
archived tenants (403 `TENANT_SUSPENDED`), derive branch scope from role assignments, never trust a header; user
deactivation must end sessions and revoke live password links; `user:create` gains a platform role option.

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened); decide D-076 (verifying suspended tenants'
  certificates).
- Phase 2: D-053, D-037 (before 2.4) · D-047 (2.5) · review D-080, D-086, D-088 · D-082 production email provider (launch).

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
- 2.3b review, logged: no load test of sign-in floods (the `HashGate` caps work; `UV_THREADPOOL_SIZE` untuned);
  trust-proxy hops untested end to end until the 2.3d proxy; raising the Argon2 cost later needs rehash-on-sign-in.
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
