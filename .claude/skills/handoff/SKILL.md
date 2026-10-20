---
name: handoff
description: Close out a VacheLearn work session by updating docs/PROGRESS.md (current phase, slice, verified gate results, next step, blockers) and the progress log, so the next session resumes cleanly. Use at the end of every slice or session, or before /clear.
---

Update the project's session state.

1. Gather facts (do not rely on memory): `git status`, `git log -5 --oneline`, and the gate results you actually ran
   in this session (if none were run since the last code change, say "not re-verified").
2. Rewrite `docs/PROGRESS.md` keeping it under ~80 lines, with these sections exactly:
   - **Current phase / slice** — e.g. "Phase 2 · Slice 2.4 (memberships & roles) — in progress"
   - **Last verified** — date, commands, real result counts
   - **Done in this phase** — one line per finished slice
   - **In progress / uncommitted** — what is partially done, which files
   - **Next step** — the single next action, specific enough to start without re-reading the conversation
   - **Blocked on owner** — decision IDs and questions
   - **Known issues** — bugs, flaky tests, tech debt with file references
3. Append a dated entry to `docs/progress-log/YYYY-MM.md` (create if needed) with: slice, summary, commits, gates.
4. If commands changed, confirm the Commands table in `CLAUDE.md` is correct.
5. Show the user the new PROGRESS.md and a suggested commit message. Do not commit unless asked.
