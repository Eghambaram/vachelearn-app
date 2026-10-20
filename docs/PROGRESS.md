# Progress (imported into every Claude Code session — keep under ~80 lines)

## Current phase / slice
Phase 0 · Discovery & plan — **not started**. No application code exists.

## Last verified
Nothing to verify yet (no code, no test commands).

## Done in this phase
- Starter kit v2.0 prepared (CLAUDE.md, MASTER_PROMPT v2, prompts/, .claude/ rules, skills, agents, hooks,
  DECISIONS with IDs, legacy capability inventory, Markdown copy of the spec).

- Git initialised on `main`; kit committed. Kit review fixes: tighter permission rules, Bash-command checks added
  to `guard-secrets.mjs`, pre-Phase-0 banners on stale docs.

## In progress / uncommitted
- Nothing (verify with `git status`).

## Next step
Run `prompts/00-kickoff.md` → Phase 0 per `prompts/phase-0-discovery.md` (documentation and planning only).

## Blocked on owner
Needs decision before Phase 1–2: D-034 market/currency/timezone · D-026 multi-branch learners.
Proposed, to confirm before Phase 1–2: D-010 auth · D-024 package manager · D-028 languages · D-035 validation
library · D-038 marketing content policy. (See docs/DECISIONS.md.)

## Known issues
- `guard-secrets.mjs` Bash checks are **inactive** until the owner adds `Bash` to the PreToolUse hook matcher in
  `.claude/settings.json` (`"Edit|Write|MultiEdit"` → `"Edit|Write|MultiEdit|Bash"`); Claude may not edit its own hooks.
- See `KIT_REVIEW.md` for contradictions resolved in kit v2.0 and remaining gaps.
