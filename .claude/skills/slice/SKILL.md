---
name: slice
description: Implement one VacheLearn vertical slice end-to-end (schema, domain, authorization, API, UI, tests, docs) following the project work protocol, then report honestly. Use when the user approves a slice plan or types /slice <name>.
argument-hint: "[slice id or name, e.g. 2.3 or invitations]"
disable-model-invocation: true
---

Implement slice: $ARGUMENTS

Follow this protocol exactly. Do not start a second slice in the same run.

## 1. Confirm scope
- Locate the slice in the current phase prompt (`prompts/phase-*.md`) and restate its goal and acceptance criteria.
- List open decisions it depends on (from `docs/DECISIONS.md`). If one is "Needs decision" and has no documented
  default, stop and ask.

## 2. Build in this order (tests alongside each layer)
1. **Schema** — Prisma models + migration following `.claude/rules/database.md` (tenant-owned checklist, composite
   FKs, CHECKs, partial unique indexes). Run the migration on a clean dev DB.
2. **Domain + authorization** — services with explicit tenant/branch scope, permission keys registered in
   `access/permissions.ts` and `docs/ROLE_PERMISSION_MATRIX.md`, transactions, idempotency keys, audit events.
3. **API** — DTOs with validation, explicit action endpoints for state changes, error envelope, OpenAPI.
4. **UI** — replace any demo fixture for this feature with the real client; loading/empty/error/permission states.
5. **Tests** — unit, API, and isolation (`/isolation-tests <resource>` for each new tenant-owned resource), plus a
   Playwright step if the slice adds a user journey.

## 3. Verify
- Run `pnpm verify` and `pnpm --filter api test:isolation` (or each gate individually if `verify` does not exist yet).
- If anything fails: diagnose root cause, fix, rerun. Never skip, weaken or delete a test to get green.
- If the slice touched data access, delegate a review to the `tenant-isolation-auditor` subagent and address findings.

## 4. Document
- Update the relevant docs (DOMAIN_MODEL, ROLE_PERMISSION_MATRIX, API_SPECIFICATION, DECISIONS, RUNBOOK),
  `.env.example`, and the Commands table in `CLAUDE.md` if commands changed.

## 5. Report (use exactly these headings)
- **Delivered** — behaviour, from the user's point of view
- **Acceptance criteria** — each AC → test name or manual check → pass/fail
- **Commands run** — command → real result summary (counts), from this session only
- **Files changed** — grouped by layer
- **Decisions / assumptions** — with Confirmed/Proposed/Needs decision labels
- **Limitations & follow-ups**
- **Next step**

Then run the `/handoff` steps to update `docs/PROGRESS.md`. Suggest a conventional commit message; commit only if
the user asks.
