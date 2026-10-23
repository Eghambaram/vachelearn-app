# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.5.6 done, not committed** (Assessment taking + result). Next:
commit, then Slice 1.5.7 (certificate view + public verification, ref 05 panel 7).

## Last verified
2026-10-23, Node v24.21.0, pnpm 12.8.1, on the final 1.5.6 tree:
- `pnpm verify` → check:ignored-source OK · format OK · lint OK · typecheck OK · unit: contracts 42 passed, web 470
  passed (28 files), 0 failed · build OK
- `pnpm test:e2e` → 210 passed in 7.9 min (adds `attempts.spec.ts`: lesson → open attempt, keyboard-only
  answer/review/submit not connected, score-only results, 404 in every demo state, 360 px, axe)
- CI: run 39963709180 (1.5.5, commit 108952f) success; run 39905603553 (1.5.4) success

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
- 1.5.5 contracts `CoursePlayer`, `LessonView`, shared `courseProgress` / `resumeLesson` (D-070) · demo outline drives
  dashboard figures · `/learn/courses/[id]` → resume · lesson player (tree, per-type panels, prev/next, completion
  actions not connected, D-069) (commit 108952f).
- 1.5.6 contracts `AttemptView` (strict questions, no answer key; no questions after the deadline), shared
  `scoreAttempt` (D-042, D-072) / `answerIssues` / `canStartAttempt` (D-073) · `mocks/attempts.ts` (key server-side)
  · `getAttempt` (own, non-cancelled; 404 in every demo state; expired open attempt graded on read, D-055) ·
  `/learn/attempts/[id]` taking (timer, navigator, review, submit not connected, D-071) and result (score only, D-023;
  history; retake only after a fail) · player lists attempts · client-boundary guard test · `formatPercentTenths`.

## In progress / uncommitted
- Slice 1.5.6, complete and verified but uncommitted: contracts `assessment-attempt.ts`, `features/learn/attempt/`,
  `/learn/attempts/[attemptId]`, `mocks/attempts.ts`, learner API + tests, `e2e/attempts.spec.ts`, docs (D-023
  Confirmed, D-071–D-073, METRICS, UI spec #42, DOMAIN_MODEL attempt/answer rules).

## Next step
Commit 1.5.6 (on owner request). Then Slice 1.5.7: certificate view `/learn/certificates` (own awards, completion vs
certificate, Download PDF not connected) and public `/verify/[verificationId]` (opaque id, minimal data per D-017,
learner name only if the owner agrees; revoked/expired states). Check D-017 with the owner first.

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
- Radix radio groups select on arrow-key focus only while the key is held (focus moves in a `setTimeout`): Playwright
  tests use `keyboard.down`/`up`, not `press` (`e2e/attempts.spec.ts`).
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
