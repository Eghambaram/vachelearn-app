# Initial Runbook

This is a placeholder operational runbook for the greenfield project. Complete it during implementation.

## Local development
- Document exact runtime versions after selecting them.
- Document package manager and install commands.
- Document how to start the web app, API and local database.
- Document database migration and seed commands.
- Document lint, type-check, test and build commands.

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
