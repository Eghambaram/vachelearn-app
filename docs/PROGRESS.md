# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 1 · Design system & UI foundations — **Slice 1.1 done** (workspace + web scaffold + tooling), uncommitted.
Next slice: 1.2 Design tokens + theme.

## Last verified
2026-10-20, Node v24.21.0, pnpm 12.8.1:
- `pnpm verify` → format OK · lint OK · typecheck OK · unit 3 passed, 0 failed (2 files) · build OK
- `pnpm test:e2e` → 4 passed (smoke + axe; desktop + 360 px)
- Clean copy: `pnpm install --frozen-lockfile && pnpm verify` → passed
- CI workflow not yet run (branch not pushed)

## Done in this phase
- 1.1 pnpm workspace, `apps/web` (Next 16.4.2, React 19.3.1, TS 6.0.3 strict), ESLint 10, Prettier, Vitest,
  Playwright + axe, GitHub Actions CI, `.nvmrc` 24, engine-strict, reviewed install scripts (`allowBuilds`).

## In progress / uncommitted
- Slice 1.1 files (root configs, `apps/web/`, `.github/workflows/ci.yml`, README, CLAUDE.md commands, RUNBOOK,
  DECISIONS D-058, `docs/progress-log/2026-10.md`). Suggested commit:
  `chore(web): scaffold pnpm workspace, Next.js app and quality gates`.

## Next step
Commit Slice 1.1 (on owner request), then plan Slice 1.2: `styles/tokens.css`, Tailwind + shadcn/ui, self-hosted font
(record in DECISIONS), contrast table, dev-only `/design` page, no-raw-hex check.

## Blocked on owner
- Before Slice 1.2/1.4: brand logo as SVG or transparent PNG (current asset is a JPEG on off-white with a "Vache"
  wordmark — do not redraw it).
- Before Phase 2: D-010 · D-049 · D-051 · D-053 (confirm) · D-026 · D-047 · D-048 (decide).
- Pushing to GitHub (needed for the first CI run) requires owner approval.

## Known issues
- Node 26 not yet LTS (nodejs.org, 2026-10-20); bump `.nvmrc`/`engines` once it is (reported 2026-10-28).
- `engineStrict` is enforced on fresh installs only; an existing `node_modules` skips the check ("Already up to date").
- D-058: TypeScript pinned ~6.0 and ESLint plugin peer exception — revisit when typescript-eslint supports TS 7.
- `guard-secrets.mjs` blocks any shell command whose text names a real env file (even in commit messages or file
  content written via heredoc) — use the Write tool or reword; don't weaken the hook.
