# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.5.3b done** (course builder); Slice 1.5.3 complete. Next: Slice
1.5.4 (Learner dashboard, ref 03).

## Last verified
2026-10-21, Node v24.21.0, pnpm 12.8.1, on the final 1.5.3b tree:
- `pnpm verify` → format OK · lint OK · typecheck OK · unit: contracts 23 passed, web 402 passed, 0 failed · build OK
- `pnpm test:e2e` → 178 passed in 5.6 min (adds `course-builder.spec.ts`: entry points per role, steps keep edits,
  keyboard reorder + announcement, add/remove with confirmation, publish checklist + "Not yet connected", 404 for
  another tenant's course, archived read-only, axe, 360 px). Earlier full runs on this tree failed only by timeout
  under load (1 + 3 + 1 tests) → local workers capped at 2, switcher redirect 15 s, builder spec 90 s
- No `.skip`/`.only`/`.todo`. CI: run 39535940356 (1.5.2) success; 1.5.3a/b not yet pushed

## Done in this phase
- 1.1 pnpm workspace, `apps/web` (Next 16.4.2, React 19.3.1, TS 6.0.3 strict), ESLint 10, Prettier, Vitest,
  Playwright + axe, GitHub Actions CI, `.nvmrc` 24, engine-strict, reviewed install scripts (commit cb23f12).
- 1.2 `styles/tokens.css` as the single colour/type/shape source; Tailwind 4 theme limited to tokens; shadcn/ui
  (radix-nova) + restyled Button; Inter self-hosted (D-059); contrast pairs + no-raw-colour enforced by unit tests;
  inverse focus ring for dark surfaces; dev-only `/design` (commit ca61cf9).
- 1.3a shadcn primitives reviewed + restyled; FormField, StatusBadge (full vocabulary), ConfirmDialog, Combobox,
  DatePicker, IconButton; zoned date + exact money formatting; `/design/components` gallery (commit 939e9a4).
- 1.3b chart tokens; card, table, tabs, breadcrumb, dropdown-menu, chart (recharts 3, D-060); PageHeader, KpiCard,
  ChartCard, DataTable (server-driven), FilterBar, Pagination (cursor), Stepper, state components (commit 101740e).
- 1.4 logo (D-064) · i18n helper `lib/i18n.ts` (all components migrated, guard test) · `SessionView` contract +
  `mocks/demo-session.ts` · permission-driven `lib/nav.ts` · AppShell (sidebar, drawer, top bar, user menu, workspace
  switcher, demo bar) · public/auth layouts · placeholder pages (D-061) · 403/404/error/suspended · `/account` ·
  `StickyActions` · `ENABLE_DEMO_WORKSPACES` gate (D-063) (commit 83bd1ef).
- 1.5.1 `packages/contracts` (Zod 4, D-035: error envelope, `PlatformDashboard`) · `docs/METRICS.md` (D-065 completion
  rate, D-066 statuses) · `lib/api/client.ts` + `platform.ts` (contract-parsed demo layer, `?demoState=`) · `/platform`
  dashboard (KPIs, growth/enrollment/status charts with tables, activity, recent tenants; no revenue/industry) ·
  workspace catch-alls now `[...slug]` + root pages · charts without JS animation (commit 88e9422).
- 1.5.2 `TenantDashboard` contract (scope in the response, none in the request) · `SessionView.branchScope` · tenant
  fixture computed per branch then scoped (D-026) · `/admin` dashboard (learners, courses, completion, overdue D-054,
  learning progress, deadlines, activity; compliance placeholder D-018) · shared PeriodFilter, ActivityFeed,
  kpiChange, fixture time helpers · `calendarDateIn` / `daysBetween` · `tenant.*` metrics (commit 1819242).
- 1.5.3a contracts `cursorPage`, `ListLimit`, `Cursor`, course schemas (D-068 level/delivery) · `lib/api/courses.ts`
  (query-bound opaque cursors, allowlisted sort, 422s) · `/admin/courses` server-driven list via server action ·
  `previousCursor` in the pager · `formatDuration` (commit c6f1220).
- 1.5.3b contracts `CourseDraft`, shared `publishIssues` / `nextVersionNumber` / `LESSON_COMPLETION_RULE` (D-041) ·
  `lib/api/course-draft.ts` (404 cross-tenant, 403 without edit keys, archived flag) · draft reducer · builder at
  `/admin/courses/[id]/build?step=` (5 steps, local edits under D-067 banner, keyboard reorder) · Stepper
  `onStepSelect` · "Create course" / title links for editors (uncommitted).

## In progress / uncommitted
- Nothing.

## Next step
Push 1.5.3a + 1.5.3b (on owner request). Then Slice 1.5.4: Learner dashboard `/learn` (ref 03) on demo data —
continue learning, my enrollments with statuses (D-054 overdue), upcoming deadlines, recent certificates; omit
achievements, announcements, ratings, recommendations and "learning plan" (D-043, D-025); sticky "Continue" on phones.

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Before Phase 2: D-010 · D-049 · D-051 · D-053 (confirm) · D-026 · D-047 · D-048 (decide).

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
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
