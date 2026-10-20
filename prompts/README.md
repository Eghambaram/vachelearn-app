# Prompts — how to drive Claude Code through the build

These are the messages you (the product owner) send to Claude Code, in order. Each phase prompt is self-contained:
it names what to read, the slices to build, acceptance criteria, the exit gate and the report format.

| File | When to use |
|---|---|
| `00-kickoff.md` | Very first message in a new Claude Code session on this folder |
| `phase-0-discovery.md` | Workspace audit, plan, decisions, domain draft, first slice — no app code |
| `phase-1-design-system.md` | Tokens, components, app shell, key screens on labelled demo data |
| `phase-2-foundation.md` | API, database, auth, tenancy, RBAC, audit, CI, isolation tests (R1) |
| `phase-3-people-content.md` | Invitations, groups, course authoring, versioning, assets, catalog |
| `phase-4-learning-lifecycle.md` | Assignments → player → assessments → completion → certificates → basic reports (MVP) |
| `phase-5-operations.md` | Compliance, reports/exports, surveys, classroom, notifications (R3) |
| `phase-6-commerce-analytics.md` | Payments, refunds, metric dictionary, governed reports (R4) |
| `phase-7-production-readiness.md` | Security, a11y, performance, backup/restore, release checklist |
| `session-resume.md` | Start of any later session (or after `/clear`) |
| `review-prompts.md` | Ready-made prompts for independent reviews, fixes and course-corrections |

## How to run a phase

1. Start Claude Code in the repository root (so `CLAUDE.md` and `.claude/` load).
2. Type `/start-phase N` — or paste the phase prompt file's "Message to send" block.
3. Approve the slice plan Claude proposes, then let it work one slice at a time (`/slice <name>`).
4. After each slice: read the report, check the real test output, answer any **Needs decision** items.
5. At phase end: ask for the `qa-verifier` subagent review, then `/handoff`.

## Tips

- Use plan mode (Shift+Tab) for Phase 0 and for the planning step of each slice.
- Keep sessions focused on one slice. `/clear` between slices; `docs/PROGRESS.md` carries state across sessions.
- When Claude asks a business question, answer it in `docs/DECISIONS.md` terms ("D-004: Confirmed — new members
  receive active group assignments") so it can record the decision accurately.
- Never paste production secrets into the chat. Put local values in `.env` (which Claude is blocked from reading).
