---
name: verify
description: Run every VacheLearn quality gate (format, lint, typecheck, tests, isolation suite, build, optionally e2e) and report the real results without embellishment. Use before declaring any slice or phase done, or when the user asks whether things pass.
argument-hint: "[optional: e2e]"
---

Run the quality gates and report only what actually happened in this session.

1. Read the Commands table in `CLAUDE.md` for the exact commands. If a command does not exist yet (early phases),
   say so instead of inventing one.
2. Make sure local services are up if tests need them (`docker compose -f infra/docker-compose.yml ps`).
3. Run, in order, stopping to report if one cannot run at all:
   - `pnpm format:check`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm --filter api test:isolation` (once Phase 2 has created it)
   - `pnpm build`
   - `pnpm test:e2e` only if the argument is `e2e` ($ARGUMENTS) or the user asked.
4. Report as a table: gate · command · result (passed/failed/not available) · key numbers (e.g. "212 passed,
   0 failed, 3 skipped") · first error line if failed.
5. If anything is skipped (`.skip`, `.only`, `test.todo`) list the files. Skipped tests are not passes.
6. Do not fix anything in this skill unless the user asks; recommend the next action instead.

Never write "all tests pass" unless every gate above ran in this session and passed.
