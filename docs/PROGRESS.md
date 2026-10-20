# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.2 done** (design tokens + theme), uncommitted.
Next slice: 1.3 Core components.

## Last verified
2026-10-20, Node v24.21.0, pnpm 12.8.1:
- `pnpm verify` → format OK · lint OK · typecheck OK · unit 56 passed, 0 failed (6 files) · build OK
- `pnpm test:e2e` → 12 passed (home + `/design`: smoke, Inter incl. ₹, inverse focus ring, axe; desktop + 360 px)
- `next start` without `ENABLE_DESIGN_GALLERY` → `/design` 404, title not leaked
- Clean copy (92 files, no node_modules): `pnpm install --frozen-lockfile && pnpm verify` → passed (56 unit tests)
- CI workflow not yet run (branch not pushed)

## Done in this phase
- 1.1 pnpm workspace, `apps/web` (Next 16.4.2, React 19.3.1, TS 6.0.3 strict), ESLint 10, Prettier, Vitest,
  Playwright + axe, GitHub Actions CI, `.nvmrc` 24, engine-strict, reviewed install scripts (commit cb23f12).
- 1.2 `styles/tokens.css` as the single colour/type/shape source; Tailwind 4 theme limited to tokens; shadcn/ui
  (radix-nova) + restyled Button; Inter self-hosted (D-059); contrast pairs + no-raw-colour enforced by unit tests;
  inverse focus ring for dark surfaces; dev-only `/design`.

## In progress / uncommitted
- Slice 1.2 files. Suggested commit: `feat(web): design tokens, Tailwind theme and token sheet`.

## Next step
Commit Slice 1.2 (on owner request), then plan Slice 1.3 (core components + gallery states, axe, unit tests for
StatusBadge, DataTable sort/paginate, ConfirmDialog focus return). Add shadcn components with
`pnpm dlx shadcn@4.22.1 add <name>` from `apps/web`, then review each: fix the `cn` import to `@/lib/utils`, remove
`dark:` classes and opacity-based focus rings, and check `package.json` / `pnpm-workspace.yaml` for added packages
or policy exclusions.

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
- `/design` and the placeholder page are not yet routed through the i18n helper (arrives with Slice 1.4, D-028).
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
