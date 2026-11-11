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
| E2E | `pnpm test:e2e` | Needs `pnpm services:up`. Builds and starts the API on :4100 (integration-test database, Mailpit; migrations applied) and the web app on :3100 proxying to it, then runs every spec with axe at desktop and 360 px. `e2e/auth.spec.ts` creates accounts with `user:create` and reads links from Mailpit. A `seed` setup project runs `db:seed` once on that database (new accounts get the e2e password) before every other project; `e2e/seed-roles.spec.ts` signs in as each seeded role and checks the workspace, organisation and scope (Slice 2.6c). Do not run it while the API integration tests run: both use `vachelearn_test` |
| Design token sheet + component gallery | `pnpm dev` → http://localhost:3000/design and /design/components | Dev only. Production builds return 404 unless `ENABLE_DESIGN_GALLERY=true` (verified with `next start`: 404, page title not leaked) |

### API, database and local services (Phase 2 Slice 2.1, run 2026-10-27)

| Step | Command | Notes |
|---|---|---|
| Local services | `pnpm services:up` (= `docker compose -f infra/docker-compose.yml up -d --wait`) | Postgres 18 and Mailpit, healthchecked. Host ports **55432** (Postgres), **51025** (SMTP), **58025** (Mailpit inbox, http://localhost:58025) — not the standard ones, so another project's Postgres/Mailpit on 5432/1025/8025 is never touched. Override with `VL_POSTGRES_PORT`, `VL_SMTP_PORT`, `VL_MAILPIT_UI_PORT`. Bound to 127.0.0.1. Stop: `pnpm services:down` (keeps the data volume) |
| Databases | created by the container | `vachelearn` (dev) and `vachelearn_test` (integration tests; `infra/postgres/init/` runs once when the volume is first created) |
| Configuration | copy `.env.example` to `.env` at the repo root and adjust | The API validates it at boot and exits naming any missing or malformed variable (values never printed). Prisma and the API load the root `.env` only if it exists; CI passes variables directly |
| Migrate (dev) | `pnpm --filter api db:migrate` | `prisma migrate dev`; migrations in `apps/api/prisma/migrations/` (2.2 `tenancy`, 2.3a `jobs_and_email` — hand-written CHECKs and triggers are at the end of each SQL file). Needs `DATABASE_URL`: from the root env file, or passed inline (`DATABASE_URL=postgresql://vachelearn:change-me@localhost:55432/vachelearn`) |
| Apply migrations (CI / deploy) | `pnpm --filter api db:deploy` | `prisma migrate deploy` |
| Reset (local only) | `VL_ALLOW_DB_RESET=1 pnpm --filter api db:reset` | Refuses unless `DATABASE_URL` is localhost with **no query string** (Prisma honours `?host=`) and the database is `vachelearn` or `*_test`, `NODE_ENV` is not production, and the one-off opt-in is given (`apps/api/scripts/database-guard.mjs`, unit-tested) |
| Dev servers | `pnpm dev` | Builds the contracts, then web :3000, API :4000 (`tsc --watch` + `node --watch`), contracts in watch mode |
| API probes | http://localhost:4000/health · /ready | `/ready` is 503 `NOT_READY` while the database is unreachable (checked by stopping the Postgres container) |
| API docs | http://localhost:4000/api/docs (JSON: /api/docs-json) | On by default in development only (`ENABLE_API_DOCS` overrides; refused in production) |
| Isolation suite | `pnpm --filter api test:isolation` | Cross-tenant and cross-branch tests, route access declarations and schema constraints (`test/*.isolation.test.ts`) |
| API tests | `pnpm --filter api test` | Real Postgres: `TEST_DATABASE_URL` (default `vachelearn_test` on :55432); the same guard refuses anything but a local `*_test` database; applies migrations first. Email tests send to Mailpit (`MAILPIT_URL`, default http://127.0.0.1:58025; `MAILPIT_SMTP_PORT`, default 51025) and find their message by a unique subject, so other mail in the inbox is left alone |
| Create an account | `pnpm --filter api user:create --email <address> --name "<name>" --reason "<why>"` | Builds, creates the user without a password and sends that account's set-password email only (Mailpit locally); prints whether it was sent. The audit reason records the OS user, host and `--reason`. Needs `DATABASE_URL`, `NODE_ENV` and the email settings (root env file or inline). Platform roles come with 2.4 |
| New tenant's first admin | `POST /api/v1/platform/tenants/:id/first-admin` as platform staff (D-092) | Creates the account if needed and sends its set-password email; afterwards the tenant's admins assign roles themselves (`/api/v1/role-assignments`) |
| Grant a role (operator) | `pnpm --filter api user:grant --email <address> --role <role> [--tenant <slug> [--branch <code>]] --reason "<why>"` | Fixed roles (D-053): `platform_super_admin` (no tenant) or a tenant role in one tenant, optionally on one branch (`branch_admin` needs one). Creates the membership and branch membership when missing; idempotent; audited with OS user, host and reason. Until the role-assignment API (2.4b) |
| Demo data (local only) | `pnpm --filter api db:seed` | Two fictional tenants (Demo Manufacturing Co, Demo Logistics Ltd), two branches each in different time zones, one account per tenant role per tenant, a second learner on the second branch, `both-tenants@demo.vachelearn.test` (Learning Manager in one, Learner in the other), `platform-admin@demo.vachelearn.test`, job roles. Accounts are `<role>.<tenant-slug>@demo.vachelearn.test`, e.g. `admin.demo-manufacturing@…`. Idempotent: a re-run adds only what is missing and never changes a password. Password: `SEED_PASSWORD` (≥ 12 characters) or a random one printed once for the accounts created in that run; if it is lost, use "Forgot your password?" and Mailpit. Refuses `NODE_ENV=production` and any database but local `vachelearn`/`*_test`: the URL guard runs in the package script **and** in the command itself (running `dist/src/cli/seed.js` directly cannot skip it), the server's own database name is checked, and a dev database holding any non-demo tenant or any account outside the reserved `.test` domain is refused (so a tunnel to a real database is never seeded). Not safe to run twice at the same moment (one run may fail on a unique key; nothing is duplicated). Tenants, branches, job roles and passwords it creates are not audited; memberships and roles are, as "system" with reason "db:seed demo data". Run 2026-11-04 twice on the dev database: 16 accounts, second run "No new accounts" |
| Sign-in (browser) | `pnpm dev`, then http://localhost:3000/login | The web app forwards `/api/v1/*` to `API_INTERNAL_URL` (D-085; build-time rewrite — rebuild after changing it). New accounts come from `user:create`; follow the set-password link from Mailpit (http://localhost:58025). Without roles (2.4) a user lands on `/welcome` |
| Sign-in (API) | `POST /api/v1/auth/login` with `Origin: http://localhost:3000` | No account can sign in yet: accounts are created with the set-password link in 2.3c (D-083). Sessions: `SELECT user_id, created_at, last_seen_at, expires_at, end_reason FROM auth_sessions ORDER BY created_at DESC LIMIT 20;` — revoke one by setting `ended_at`/`end_reason`. Rotating `SESSION_SECRET` invalidates every CSRF token (users sign in again); `CURSOR_SECRET` only list cursors |
| Deploying 2.3b to a database with older audit rows | — | Migration `identity_sessions` adds `audit_events.actor_user_id → users`. Only local databases exist so far (tests seed their actors as users). Any database holding 2.2 audit rows with actor ids that are not users needs a forward fix before `db:deploy` (create those users, or null the ids with a recorded reason — audit rows are insert-only, so that means a supervised maintenance step) |
| Background jobs | runs inside the API (`JOBS_WORKER`, on by default except in tests) | Postgres `jobs` table (D-040): polled every 2 s; 5 attempts, waits 30 s doubling to 1 h; a `running` job abandoned by a stopped process is retried after a 5-minute lease. Inspect locally: `SELECT type, status, attempts, run_after, last_error FROM jobs ORDER BY created_at DESC LIMIT 20;` (`last_error` is sanitised; payloads hold ids only) |
| Email | local: Mailpit inbox http://localhost:58025 | `EMAIL_PROVIDER=smtp` sends to Mailpit; `console` logs masked recipient + subject only (links never reach the log, so use Mailpit to follow one). Delivery is at-least-once: a crash between the SMTP server accepting a message and `sent` being recorded can resend it, with the same Message-ID. **Production:** STARTTLS is mandatory unless `SMTP_SECURE=true` (implicit TLS), certificates are always verified, an SMTP 5xx fails the job at once, and `EMAIL_FROM` must not be a placeholder (`.invalid`, `example.*`) |

### Client demo (local, D-110, D-111)

A local production build with demo content on: real sign-in for every seeded role, the Phase 1 sample-data screens
(courses, builder, learner dashboard, player, certificates, reports) marked Demo with a shell banner, the demo catalog
with enrol (kept in a browser cookie only), and public tenant pages. Run 2026-11-11:

1. `pnpm services:up`, then `pnpm --filter api db:seed` (dev database `vachelearn`). On a fresh database set
   `SEED_PASSWORD` first and every demo account gets it. Accounts that already exist keep their password: set one per
   account with "Forgot your password?" on `/login` and the link in Mailpit (http://localhost:58025).
2. API on :4000: `pnpm --filter api build`, then from `apps/api` start `node --enable-source-maps dist/src/main.js`
   with `NODE_ENV=development API_PORT=4000 DATABASE_URL=<local vachelearn URL> WEB_ORIGIN=http://localhost:3000
   EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=51025` (or `pnpm dev` with the root env file).
3. Web on :3000: from `apps/web`, `ENABLE_DEMO_CONTENT=true API_INTERNAL_URL=http://localhost:4000 pnpm build`, then
   `ENABLE_DEMO_CONTENT=true pnpm exec next start --port 3000`. `pnpm verify` and `pnpm test:e2e` rebuild `.next`
   without the flag: rebuild the demo afterwards.
   Demo videos (optional): copy MP4 files to `apps/web/public/demo-media/demo-1.mp4`, `demo-2.mp4`, `demo-3.mp4`
   (git-ignored, never committed); video lessons then play them with a placeholder captions track. Without them,
   video lessons show the media placeholder.
4. Walk through: http://localhost:3000 (demo organisations) → `/t/demo-manufacturing`, `/t/demo-logistics` (catalog,
   course pages, "Sign in to enrol") → sign in as `<role>.<tenant-slug>@demo.vachelearn.test` (roles: `admin`,
   `branch-admin`, `learning-manager`, `compliance`, `instructor`, `learner`, `learner2`), `both-tenants@…`,
   `platform-admin@…` → learner: My learning (status filters) → Course catalog → a course → Enrol → first lesson (video lessons play the
   demo videos); admin: Dashboard, Courses, People.

Live in the demo: sign-in, sessions, workspaces, people, branches, roles, settings, audit log. Sample data: everything
under the banner. Instructor screens still say "Not available yet" (Phase 5). Turn the flag off and rebuild to return to D-097. Never set it (or combine it with `ENABLE_DEMO_VERIFICATION`) on
anything but a local machine: nothing enforces this, and real users would see sample certificates under their own names.

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
