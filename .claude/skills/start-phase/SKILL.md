---
name: start-phase
description: Start a VacheLearn build phase (0-7) by loading its prompt, checking preconditions and blocking decisions, and proposing the first slice plan. Use when the user says "start phase N" or "/start-phase N".
argument-hint: "[phase-number 0-7]"
disable-model-invocation: true
---

Start VacheLearn Phase $ARGUMENTS.

1. Find the matching file `prompts/phase-$ARGUMENTS-*.md` and read it fully. If none matches, list the files in
   `prompts/` and stop.
2. Read `docs/PROGRESS.md`. If the previous phase's exit gate is not recorded as met, say exactly which items are
   open and ask whether to proceed anyway. Do not silently skip a gate.
3. Read the documents listed under "Read first" in the phase prompt (only those).
4. Check every decision ID the phase prompt mentions in `docs/DECISIONS.md`. Produce a table:
   ID · topic · status · blocks which slice · recommended default. Ask the user to resolve any that block the first
   slice.
5. Run `git status` and confirm the working tree is clean (or describe what is uncommitted).
6. Propose the plan for the **first slice only**: goal, acceptance criteria (copied/derived from the prompt and spec),
   files/modules to create or change, commands to run, new dependencies with a one-line justification each, tests to
   add (including isolation tests if data access is involved), and what the user will be able to see when done.
7. Update `docs/PROGRESS.md`: current phase = $ARGUMENTS, status = planning slice 1.
8. Stop and wait for approval before writing application code.
