---
paths:
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/test/**"
  - "**/e2e/**"
  - "**/playwright.config.*"
  - "**/vitest.config.*"
  - "**/jest.config.*"
---

# Testing rules

## Layers (minimum expectations)

| Layer | Scope | Runs against |
|---|---|---|
| Unit | permission evaluation, completion policy, scoring + rounding, compliance status + boundary dates, certificate eligibility, order state machine, CSV escaping, metric definitions | pure functions / services with fakes |
| Integration | DB constraints (composite FKs, partial unique indexes, CHECKs), tenant scoping in repositories, adapters (storage, email, payment webhook verification), job idempotency | real Postgres (Docker/Testcontainers) |
| API | validation + error envelope, pagination limits, status transitions, 401/403/404/409/422, concurrency conflicts | Nest app + real Postgres |
| Isolation | cross-tenant and cross-branch attempts on **every** tenant-owned resource and every list/export/cursor | Nest app + seeded two-tenant fixture |
| E2E | the mandatory journey in `docs/ACCEPTANCE_TESTS.md`, keyboard-only pass on primary learner flow, axe checks | Playwright against web + api |

## Isolation suite (release blocker)

- Fixture: Tenant A (branches A1, A2) and Tenant B (branch B1); users for each role; one user with memberships in both
  tenants. Build it once in a shared helper; do not hand-roll per test.
- For each resource, assert at least: read by ID from other tenant → 404; list never includes other tenant rows;
  update/delete/action from other tenant → 404; branch-scoped actor cannot read/list/export another branch (by ID,
  by filter `branchId=other`, by cursor crafted from another branch's row, by export ID); attaching another tenant's
  ID as a reference (course, group, user, branch, template) → 404/422 and no row created.
- Name tests by behaviour: `it('branch admin of A1 cannot list learners of A2 via branchId filter')`.
- Use `/isolation-tests <resource>` to scaffold these.

## Rules

- Tests must be deterministic: fixed clock (inject a `Clock`), seeded IDs where order matters, no reliance on
  wall-clock time or test order. Boundary-date tests cover the exact day before/of/after due, due-soon and expiry,
  across at least two timezones (e.g. Asia/Kolkata and America/Chicago).
- Do not mock the database for integration/API/isolation tests. Mock only external providers.
- Never weaken an assertion, skip a test, or add `.only`/`.skip` to get green. If a test is wrong, fix it and explain
  why in the report. A flaky test is a bug: fix it or quarantine it with an issue reference.
- Retry/idempotency tests call the operation twice (and concurrently where relevant) and assert one effect.
- Security tests: invitation replay/expiry/email mismatch, privilege escalation, webhook spoof + replay, CSV formula
  injection (`=`, `+`, `-`, `@`, tab, CR prefixes), unsafe upload types, open redirect on login/return URLs.
- Report real numbers: "api: 142 passed, 0 failed (isolation: 38 passed)". Never summarise as "tests pass" without
  having run them in this session.
