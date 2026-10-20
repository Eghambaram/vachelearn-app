# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.3b done** (data display, page structure, states), uncommitted.
Slice 1.3 (core components) is complete once 1.3b is committed. Next: Slice 1.4 (app shells + navigation).

## Last verified
2026-10-20, Node v24.21.0, pnpm 12.8.1, on the final tree:
- `pnpm verify` → format OK · lint OK · typecheck OK · unit 267 passed, 0 failed (15 files) · build OK
- `pnpm test:e2e` → 48 passed (adds 1.3b: keyboard sort + aria-sort, cursor pagination, search/empty, row-action menu
  focus, bulk select, loading/error + axe, chart→table tab + axe, stepper, no sideways scroll; desktop + 360 px)
- Clean copy (168 files, no node_modules): `pnpm install --frozen-lockfile && pnpm verify` → passed
- CI workflow not yet run (branch not pushed)

## Done in this phase
- 1.1 pnpm workspace, `apps/web` (Next 16.4.2, React 19.3.1, TS 6.0.3 strict), ESLint 10, Prettier, Vitest,
  Playwright + axe, GitHub Actions CI, `.nvmrc` 24, engine-strict, reviewed install scripts (commit cb23f12).
- 1.2 `styles/tokens.css` as the single colour/type/shape source; Tailwind 4 theme limited to tokens; shadcn/ui
  (radix-nova) + restyled Button; Inter self-hosted (D-059); contrast pairs + no-raw-colour enforced by unit tests;
  inverse focus ring for dark surfaces; dev-only `/design` (commit ca61cf9).
- 1.3a shadcn primitives reviewed + restyled; FormField, StatusBadge (full vocabulary), ConfirmDialog, Combobox,
  DatePicker, IconButton; zoned date + exact money formatting; `/design/components` gallery (commit 939e9a4).
- 1.3b chart tokens `chart-1…5` (10 new contrast pairs); restyled card, table, tabs, breadcrumb, dropdown-menu, chart
  (recharts 3, D-060); Checkbox indeterminate; PageHeader, Breadcrumbs, KpiCard, ChartCard (+ table view), DataTable
  (server-driven), FilterBar, Pagination (cursor), Stepper, EmptyState, ErrorState, PermissionDenied, DemoBadge;
  `lib/table.ts`; gallery sections (uncommitted).

## In progress / uncommitted
- All Slice 1.3b files (see `git status`): `apps/web/src/components/*` (new composites + 6 ui primitives),
  `lib/table.ts`, `styles/tokens.*`, `globals.css`, `messages/en.ts`, `app/design/components/*`, `e2e/components.spec.ts`,
  `package.json` + lockfile (recharts 3.10.1), `docs/UI_UX_SPECIFICATION.md`, `docs/DECISIONS.md` (D-060; D-058/059/060
  rows moved out of the owner-queue table into Architecture).
  Suggested commit: `feat(web): data display, page structure and state components (Slice 1.3b)`.

## Next step
Commit Slice 1.3b (on owner request); optionally run the `ux-accessibility-reviewer` subagent on 1.3a+1.3b. Then open
`prompts/phase-1-design-system.md` §1.4 and plan Slice 1.4 (public + auth layouts, workspace AppShell with sidebar/top
bar, role-based nav definitions, mobile sidebar, i18n helper D-028) — needs the brand logo SVG/PNG (see below).

## Blocked on owner
- Before Slice 1.4: brand logo as SVG or transparent PNG (current asset is a JPEG on off-white with a "Vache"
  wordmark — do not redraw it).
- Before Phase 2: D-010 · D-049 · D-051 · D-053 (confirm) · D-026 · D-047 · D-048 (decide).
- Pushing to GitHub (needed for the first CI run) requires owner approval.

## Known issues
- Node 26 not yet LTS (nodejs.org, 2026-10-20); bump `.nvmrc`/`engines` once it is (reported 2026-10-28).
- `engineStrict` is enforced on fresh installs only; an existing `node_modules` skips the check ("Already up to date").
- D-058: TypeScript pinned ~6.0 and ESLint plugin peer exception — revisit when typescript-eslint supports TS 7.
- `src/styles/vendor/shadcn-variants.css` is a vendored copy (shadcn@4.22.1, MIT); refresh it by hand if shadcn changes.
- Component copy lives in `messages/en.ts` and is not yet routed through the i18n helper (Slice 1.4, D-028).
- Proposed status tones (UI spec §Status tones) await owner review in the gallery.
- Full-page axe scan of `/design/components` takes 40–44 s under load; marked `test.slow()` (90 s). Under heavy
  machine load (load avg ~8) one run still timed out (also on the unchanged `/design`); rerun passed 48/48.
- Radix modal DropdownMenu aria-hides the page (axe `aria-hidden-focus`): DataTable row menus use `modal={false}`;
  any future DropdownMenu should too.
- `shadcn add` reformats `src/styles/vendor/shadcn-variants.css`; restore it with `git checkout` after adding components.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
