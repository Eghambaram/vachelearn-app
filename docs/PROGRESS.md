# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.5.5 done, not committed** (Course player). Next: commit, then
Slice 1.5.6 (assessment taking + result, ref 05).

## Last verified
2026-10-23, Node v24.21.0, pnpm 12.8.1, on the final 1.5.5 tree:
- `pnpm verify` → check:ignored-source OK · format OK · lint OK · typecheck OK · unit: contracts 35 passed, web 444
  passed, 0 failed · build OK
- `pnpm test:e2e` → 198 passed in 5.0 min (adds `course-player.spec.ts`: resume, tree + prev/next, not-connected
  completion, 404s incl. every demo state, 360 px, axe)
- CI: 1.5.4 pushed 2026-10-23 (`b9ad2b8..cda632d`); CI result for that push not checked in this session

## Done in this phase
Detail per slice: `docs/progress-log/2026-10.md`.
- 1.1 workspace, Next 16 / React 19 / TS 6 strict, ESLint, Prettier, Vitest, Playwright + axe, CI (cb23f12).
- 1.2 tokens as the single style source, Tailwind 4 theme, shadcn/ui, Inter (D-059), contrast tests (ca61cf9).
- 1.3a/b primitives + composites (FormField, StatusBadge, DataTable, ChartCard, Stepper, states…) (939e9a4, 101740e).
- 1.4 logo (D-064), i18n helper, `SessionView`, permission-driven nav, AppShell, system pages, D-061/D-063 (83bd1ef).
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
  `onStepSelect` · "Create course" / title links for editors (commit bfbeb43; route page only in b9ad2b8).
- 1.5.4 contracts `LearnerDashboard`, shared `enrollmentDisplayStatus` (D-054, boundary tests Kolkata/Chicago) ·
  `mocks/enrollments.ts` (includes another learner) · `lib/api/learner.ts` (own records only, 404 for others) ·
  `/learn` dashboard + ownership-checked `/learn/courses/[enrollmentId]` stub · ProgressBar · KpiCard header wraps ·
  `learner.*` metrics (commit 1a09fcd).
- 1.5.5 contracts `CoursePlayer`, `LessonView`, `LessonCompletionRule`, shared `courseProgress` / `resumeLesson`
  (D-070) · `mocks/course-player.ts` (5×5 outline; dashboard progress + next lesson now derived from it) ·
  `getCoursePlayer` / `getLessonView` (own enrollment, pinned-version lessons, 404 in every demo state) · `/learn/
  courses/[id]` → resume redirect · `/lessons/[lessonId]` player (tree, per-type panels, prev/next, sticky on phones,
  completion actions "Not yet connected", D-069) · `formatClock`, `formatFileSize` · isolation audit: 2 Low fixed.

## In progress / uncommitted
- Slice 1.5.5, complete and verified but uncommitted: contracts `course-player.ts`, `apps/web/src/features/learn/player/`,
  lesson route, `mocks/course-player.ts`, learner API + tests, `e2e/course-player.spec.ts`, docs (D-069, D-070,
  METRICS, UI spec #41).

## Next step
Commit 1.5.5 (on owner request). Then Slice 1.5.6: assessment taking + result `/learn/attempts/[attemptId]` (ref 05) —
question flow, timer from the server (D-055), submit, result with pass/fail and score computed server-side (D-042),
completion vs pass shown separately; wire the player's assessment lesson to it.

## Blocked on owner
- Confirm D-064 (logo lockup, "Vache" wordmark vs "VacheLearn" product name).
- Review D-070 (resume = first unfinished lesson vs last opened).
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
- `.gitignore` patterns are anchored (`/build/`, `/apps/*/build/` …): a bare `build/` hid the builder route from git.
  `pnpm check:ignored-source` (first step of verify) fails if any source file under apps/ or packages/ is ignored.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
