# Session resume

Use at the start of every new session after the first, or after `/clear`.

## Message to send

```text
Resume VacheLearn. Read docs/PROGRESS.md (already imported via CLAUDE.md), run git status and git log -10 --oneline,
and check whether the last reported gate results still hold (run pnpm verify if code changed since). Then tell me in
five lines: current phase and slice, what was last verified, what is unfinished, blockers/decisions waiting on me,
and the next step you propose. Wait for my go-ahead before continuing.
```

## If things look off

- PROGRESS.md disagrees with the code → "Trust the code. Reconcile PROGRESS.md with what is actually in the repo and
  show me the diff."
- Tests that were green are now red → "Stop new work. Diagnose and fix the regression first; explain the root cause."
- The session drifted into a second slice → "Finish or revert the partial work so only one slice is open, then
  /handoff."
