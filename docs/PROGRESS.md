# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.3a done** (forms, overlays, feedback), uncommitted.
Next: Slice 1.3b (data display, page structure).

## Last verified
2026-10-20, Node v24.21.0, pnpm 12.8.1:
- `pnpm verify` → format OK · lint OK · typecheck OK · unit 211 passed, 0 failed (12 files) · build OK
- `pnpm test:e2e` → 30 passed (home, `/design`, `/design/components`: axe, keyboard-only combobox/date picker/select,
  dialog/drawer/confirm focus + Escape, toast live region; desktop + 360 px)
- Clean copy (127 files, no node_modules): `pnpm install --frozen-lockfile && pnpm verify` → passed
- CI workflow not yet run (branch not pushed)

## Done in this phase
- 1.1 pnpm workspace, `apps/web` (Next 16.4.2, React 19.3.1, TS 6.0.3 strict), ESLint 10, Prettier, Vitest,
  Playwright + axe, GitHub Actions CI, `.nvmrc` 24, engine-strict, reviewed install scripts (commit cb23f12).
- 1.2 `styles/tokens.css` as the single colour/type/shape source; Tailwind 4 theme limited to tokens; shadcn/ui
  (radix-nova) + restyled Button; Inter self-hosted (D-059); contrast pairs + no-raw-colour enforced by unit tests;
  inverse focus ring for dark surfaces; dev-only `/design` (commit ca61cf9).
- 1.3a shadcn primitives reviewed + restyled; FormField, StatusBadge (full vocabulary), ConfirmDialog, Combobox,
  DatePicker, IconButton; zoned date + exact money formatting; `/design/components` gallery.

## In progress / uncommitted
- Slice 1.3a files. Suggested commit: `feat(web): form, overlay and feedback components (Slice 1.3a)`.

## Next step
Commit Slice 1.3a (on owner request), then plan Slice 1.3b: Card, KpiCard, ChartCard (+ table view), DataTable
(server-driven: search, filters, sort, cursor pagination, row actions, bulk select, loading/empty/error), FilterBar,
Pagination, Tabs, Stepper, Breadcrumbs, PageHeader, EmptyState, ErrorState, PermissionDenied. Decide the chart
library (recharts 3 via shadcn chart is the default) and confirm no TanStack Table (v9 just released).

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
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
