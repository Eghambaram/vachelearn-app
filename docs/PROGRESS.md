# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.4 done** (app shells + navigation). Next: Slice 1.5.1 (Platform
Admin dashboard on demo data).

## Last verified
2026-10-20, Node v24.21.0, pnpm 12.8.1, on the final 1.4 tree:
- `pnpm verify` → format OK · lint OK · typecheck OK · unit 319 passed, 0 failed (17 files) · build OK
- `pnpm test:e2e` → 114 passed (adds 1.4 `shell.spec.ts`: nav per demo role, skip link, keyboard-only nav, role +
  workspace switchers, user menu, permission-denied / 404, drawer focus trap at 360 px, no sideways scroll, axe on
  every shell/public/auth/system page; desktop + 360 px projects)
- No `.skip`/`.only`/`.todo` in `apps/web`. CI not yet run (push blocked, see below)

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

## In progress / uncommitted
- Nothing.

## Next step
Slice 1.5.1: Platform Admin dashboard (ref 01-final) on demo data through a typed `lib/api` client → `mocks/`;
revenue/plan widgets hidden (D-027), industry widget per D-048. Optionally run `ux-accessibility-reviewer` on 1.3–1.4.

## Blocked on owner
- Push: GitHub 403 — credential `egha-dev` has no write access to `Eghambaram/vachelearn-app`. Grant access or push
  as the owner (`gh auth login`, then `git push -u origin main`). `main` is 11 commits ahead of origin.
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
- E2E is load-sensitive on WSL: full suite 5–7 min; `components.spec.ts` has a 90 s per-test timeout because its
  full-page axe scans of the gallery take 30–40 s under parallel load.
- Radix modal DropdownMenu aria-hides the page (axe `aria-hidden-focus`): every DropdownMenu uses `modal={false}`.
- Accessible names must contain the visible label (axe `label-content-name-mismatch`, WCAG 2.5.3): append screen-reader
  context instead of replacing the name with `aria-label`.
- `pkill -f "<pattern>"` in a Bash call kills the calling shell when the pattern appears in the command itself.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
