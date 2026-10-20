# Initial Runbook

This is a placeholder operational runbook for the greenfield project. Complete it during implementation.

## Local development

Commands below were run on 2026-10-20 (Phase 1 Slice 1.1) on Ubuntu 26.04 under WSL2 with Node v24.21.0 and pnpm
12.8.1.

| Step | Command | Notes |
|---|---|---|
| Runtime | Node 24 LTS (`.nvmrc`), pnpm 12.8.1 (`packageManager`) | Fresh installs fail with `ERR_PNPM_UNSUPPORTED_ENGINE` on older Node (`engineStrict`) |
| Install | `pnpm install` | Dependency install scripts are denied unless listed under `allowBuilds` in `pnpm-workspace.yaml` |
| Web dev server | `pnpm dev` | http://localhost:3000 |
| All gates | `pnpm verify` | format:check → lint → typecheck → test → build; stops at the first failure |
| Format files | `pnpm format` | `docs/`, `prompts/`, `reference/`, `assets/`, `.claude/` and root `*.md` are ignored on purpose |
| E2E browser (once) | `pnpm --filter web exec playwright install chromium` | WSL here already had the system libraries; CI uses `--with-deps` |
| E2E | `pnpm test:e2e` | Builds, starts the app on :3100 with `ENABLE_DESIGN_GALLERY=true`, runs smoke, `/design` and axe at desktop and 360 px |
| Design token sheet | `pnpm dev` → http://localhost:3000/design | Dev only. Production builds return 404 unless `ENABLE_DESIGN_GALLERY=true` (verified with `next start`: 404, page title not leaked) |

API, database, migrations and seed commands arrive in Phase 2.

## Environments
- Separate local, staging and production configuration.
- Use `.env.example` for names and descriptions only.
- Store secrets in local environment or a secret manager; never commit them.

## Deployments
- Document build, migration, health-check, rollback and smoke-test steps.
- Do not run destructive production migrations without a reviewed rollback/forward-fix plan.

## Backups and recovery
- Define backup schedule, retention and recovery objectives with the owner.
- Test database restore in a non-production environment before production launch.

## Incident handling
- Include health checks, error monitoring, request IDs, audit lookup and escalation contacts before production.
