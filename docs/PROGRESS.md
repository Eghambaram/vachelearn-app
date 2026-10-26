# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
**Phase 1 complete — approved by the product owner 2026-10-26** (review page
https://claude.ai/artifact/C4Aw93XyVrmhgBQYL8qTaf). Next: Phase 2 · Foundation (API, auth, tenancy, isolation suite).

## Last verified
2026-10-26, Node v24.21.0, pnpm 12.8.1, on the final Phase 1 tree:
- `pnpm verify` → exit 0 · unit: contracts 53, web 541 passed (34 files), 0 failed · build OK
- `pnpm test:e2e` → exit 0 · 236 passed, 0 failed (9.3 min); QA verifier independently: 232 passed before its fixes
- CI: 1.5.7 push success (run 40276107040); 1.5.8 push (d0b12f4) not checked

## Done in this phase
Detail per slice: `docs/progress-log/2026-10.md`.
- 1.1 workspace, Next 16 / React 19 / TS 6 strict, ESLint, Prettier, Vitest, Playwright + axe, CI (cb23f12).
- 1.2 tokens as the single style source, Tailwind 4 theme, shadcn/ui, Inter (D-059), contrast tests (ca61cf9).
- 1.3a/b primitives + composites (FormField, StatusBadge, DataTable, ChartCard, Stepper, states…) (939e9a4, 101740e).
- 1.4 logo (D-064), i18n helper, `SessionView`, permission-driven nav, AppShell, system pages, D-061/D-063 (83bd1ef).
- 1.5.1 `packages/contracts` (Zod 4, D-035), `docs/METRICS.md`, contract-parsed demo client, `/platform` (88e9422).
- 1.5.2 `TenantDashboard` (scope in the response), branch-scoped fixture (D-026), `/admin` dashboard (1819242).
- 1.5.3a/b course list (opaque query-bound cursors) and 5-step builder with local edits (D-067) (c6f1220, bfbeb43).
- 1.5.4 `LearnerDashboard`, shared `enrollmentDisplayStatus` (D-054), `/learn` own records only (1a09fcd).
- 1.5.5 course player: `CoursePlayer`/`LessonView`, `courseProgress`/`resumeLesson` (D-070), D-069 (108952f).
- 1.5.6 assessments: `AttemptView` (no answer key), `scoreAttempt` (D-042/D-072), D-071/D-073, timer (cb5a4d8).
- 1.5.7 certificates + public `/verify` (D-017 masked name, D-074 flag, D-075 ids), reviews applied (bea85cf).
- 1.5.8 contracts `complianceStatus` (D-018 Confirmed: 30-day window, renewal, in-progress = Not started),
  `ComplianceReport` (scope + applied filters echoed, totals) · shared `lib/api/cursor.ts` (courses refactored) ·
  `mocks/compliance.ts` (30 learners, multi-branch, 4 requirements) · `/admin/reports` + `/admin/reports/compliance`
  (scope banner, totals, server-driven filters/sort/pages, CSV disabled with visible reason) · D-026 Confirmed ·
  isolation audit: no High; fixes applied (350ef00).

## In progress / uncommitted
- Nothing.

## Next step
`/start-phase 2` (`prompts/phase-2-foundation.md`): read the prompt, then settle the Phase 2 decisions below with the
owner before scaffolding `apps/api` (NestJS, Prisma, Postgres via Docker Compose, Zod contracts, isolation suite).

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened); decide D-076 (verifying suspended tenants'
  certificates).
- Before Phase 2: D-010 · D-049 · D-051 · D-053 (confirm) · D-047 · D-048 (decide).

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
- Phase 5 rules from the 1.5.8 audit: signed keyset cursors without personal data (+ as-of date), export request
  without cursor/limit, scope snapshot + re-check, CSV formula escaping — in `lib/api/cursor.ts` and
  `contracts/src/compliance.ts` comments.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages, file
  content written via heredoc, or code such as `r.key`) — use the Write tool or reword; don't weaken the hook.
