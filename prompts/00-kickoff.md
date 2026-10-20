# 00 — Kickoff message

Open this folder as the Claude Code workspace (`cd VacheLearn && claude`). Confirm `CLAUDE.md` loaded (`/context` or
`/memory`). Then send the message below. Plan mode is recommended for this first turn.

---

## Message to send

```text
We are starting VacheLearn from zero. Nothing has been implemented: no app, repo history, database, cloud account,
credentials or payment integration exists. Treat anything you find in this folder as documentation unless it is code,
in which case inspect it before changing anything.

Read, in this order:
1. CLAUDE.md (already loaded) and MASTER_PROMPT.md (v2.0 — canonical; it supersedes docs/Supplementary_Master_Prompt.md)
2. prompts/phase-0-discovery.md — this is the task for this session
3. The documents Phase 0 lists (spec in docs/MVP_SPEC.md, decisions, roles, domain, UI/UX, acceptance tests,
   legacy capability inventory)
4. Look at the reference images in assets/ui-ux/ and the logo in assets/brand/ as visual direction only.

Then carry out Phase 0 exactly as written in prompts/phase-0-discovery.md. Do not write application code in this
phase. Do not ask me for secrets. Label every assumption Confirmed / Proposed / Needs decision. Finish with the Phase 0
report format, including the list of decisions you need from me, ordered by how soon they block work.
```

---

## What a good first response looks like

- Environment assessment with actual tool versions (`node -v`, `pnpm -v`, `docker --version`, `git --version`) and
  anything missing, with the exact install command for your OS.
- A short list of contradictions or gaps it found in the kit (there are some — see `KIT_REVIEW.md`), not silent picks.
- The phase plan, the first vertical slice with acceptance criteria, and the decisions it needs from you.
- No generated application, no `create-next-app`, no `nest new` yet.

If the response jumps into scaffolding, reply: "Stop. Phase 0 is documentation and planning only. Revert any
scaffolding and give me the Phase 0 report."
