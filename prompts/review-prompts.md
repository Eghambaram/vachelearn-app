# Review and course-correction prompts

Copy-paste prompts for moments that come up during the build.

## Independent reviews (subagents)

```text
Use the tenant-isolation-auditor subagent to review the changes since <commit/branch>. It should report every query,
endpoint, job or export that could read or write outside the actor's tenant or branch, with file:line and a failing
test idea. Then fix confirmed issues and add the tests.
```

```text
Use the security-reviewer subagent on <area: auth | invitations | uploads | certificates | payments | exports>.
Report findings by severity with evidence. Do not fix yet; show me the list first.
```

```text
Use the ux-accessibility-reviewer subagent on <route or component>. Check against docs/UI_UX_SPECIFICATION.md,
.claude/rules/web.md and WCAG 2.2 AA. Include keyboard path and contrast results.
```

```text
Use the qa-verifier subagent to independently verify Phase <N>'s exit gate: run every gate from a clean state, check
each acceptance criterion against a test, and list anything claimed but not evidenced.
```

## Course corrections

```text
You marked <feature> as done. Show me the test that proves the main action persists data and is authorization-checked.
If there isn't one, it isn't done — write it.
```

```text
You invented a business rule for <topic>. Revert it to the documented default (or remove it), add a "Needs decision"
row to docs/DECISIONS.md with options and your recommendation, and tell me what it blocks.
```

```text
This change is too big to review. Split it: keep only <slice> in this change set, stash or revert the rest, and give
me the plan for the remainder as separate slices.
```

```text
Before fixing this bug, write a failing test that reproduces it. Then fix it and show the test passing.
```

```text
Explain the root cause of <failure> before changing code. Do not weaken, skip or delete tests to get green.
```

## Decisions

```text
/decision D-004 Confirmed: new group members receive active group assignments; removed members keep history and
existing enrollments; future access unaffected. Owner: <name>, today.
```
