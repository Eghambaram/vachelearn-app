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
| Design token sheet + component gallery | `pnpm dev` → http://localhost:3000/design and /design/components | Dev only. Production builds return 404 unless `ENABLE_DESIGN_GALLERY=true` (verified with `next start`: 404, page title not leaked) |

### API, database and local services (Phase 2 Slice 2.1, run 2026-10-27)

| Step | Command | Notes |
|---|---|---|
| Local services | `pnpm services:up` (= `docker compose -f infra/docker-compose.yml up -d --wait`) | Postgres 18 and Mailpit, healthchecked. Host ports **55432** (Postgres), **51025** (SMTP), **58025** (Mailpit inbox, http://localhost:58025) — not the standard ones, so another project's Postgres/Mailpit on 5432/1025/8025 is never touched. Override with `VL_POSTGRES_PORT`, `VL_SMTP_PORT`, `VL_MAILPIT_UI_PORT`. Bound to 127.0.0.1. Stop: `pnpm services:down` (keeps the data volume) |
| Databases | created by the container | `vachelearn` (dev) and `vachelearn_test` (integration tests; `infra/postgres/init/` runs once when the volume is first created) |
| Configuration | copy `.env.example` to `.env` at the repo root and adjust | The API validates it at boot and exits naming any missing or malformed variable (values never printed). Prisma and the API load the root `.env` only if it exists; CI passes variables directly |
| Migrate (dev) | `pnpm --filter api db:migrate` | `prisma migrate dev`; migrations in `apps/api/prisma/migrations/` (2.2: `tenancy` — hand-written CHECKs and the audit trigger are at the end of its SQL) |
| Apply migrations (CI / deploy) | `pnpm --filter api db:deploy` | `prisma migrate deploy` |
| Reset (local only) | `VL_ALLOW_DB_RESET=1 pnpm --filter api db:reset` | Refuses unless `DATABASE_URL` is localhost with **no query string** (Prisma honours `?host=`) and the database is `vachelearn` or `*_test`, `NODE_ENV` is not production, and the one-off opt-in is given (`apps/api/scripts/database-guard.mjs`, unit-tested) |
| Dev servers | `pnpm dev` | Builds the contracts, then web :3000, API :4000 (`tsc --watch` + `node --watch`), contracts in watch mode |
| API probes | http://localhost:4000/health · /ready | `/ready` is 503 `NOT_READY` while the database is unreachable (checked by stopping the Postgres container) |
| API docs | http://localhost:4000/api/docs (JSON: /api/docs-json) | On by default in development only (`ENABLE_API_DOCS` overrides; refused in production) |
| Isolation suite | `pnpm --filter api test:isolation` | Cross-tenant and cross-branch tests, route access declarations and schema constraints (`test/*.isolation.test.ts`) |
| API tests | `pnpm --filter api test` | Real Postgres: `TEST_DATABASE_URL` (default `vachelearn_test` on :55432); the same guard refuses anything but a local `*_test` database; applies migrations first |

How `apps/api` loads the shared contracts: `packages/contracts` exports TypeScript source to the web app and to tests,
and a CommonJS build (`dist/`, `pnpm --filter @vachelearn/contracts build`) to the API through the `require` export
condition. The API's `build`, `typecheck` and `dev` scripts build the contracts first. Prisma's client is generated into
`apps/api/generated/` (git-ignored) by `pnpm --filter api generate`, which `build`, `typecheck` and `test` run.

## Environments
- Separate local, staging and production configuration.
- Use `.env.example` for names and descriptions only.
- `CURSOR_SECRET` (≥ 32 random characters) is required in production; rotating it invalidates open list cursors
  only (clients get 422 and restart from the first page).
- Store secrets in local environment or a secret manager; never commit them.

## Deployments
- Document build, migration, health-check, rollback and smoke-test steps.
- Do not run destructive production migrations without a reviewed rollback/forward-fix plan.

## Backups and recovery
- Define backup schedule, retention and recovery objectives with the owner.
- Test database restore in a non-production environment before production launch.

## Incident handling
- Include health checks, error monitoring, request IDs, audit lookup and escalation contacts before production.
