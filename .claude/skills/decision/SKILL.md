---
name: decision
description: Record or update a product/technical decision in docs/DECISIONS.md with ID, status, owner, date, rationale and impact. Use when the user answers a business question, or when work reveals a rule that must not be invented.
argument-hint: "[D-NNN or topic] [Confirmed|Proposed|Needs decision] [details]"
---

Record a decision: $ARGUMENTS

1. Open `docs/DECISIONS.md`. Find the row by ID (`D-NNN`) or by topic. If none exists, add a new row with the next
   free ID.
2. Status rules:
   - **Confirmed** only when the user (product owner) has explicitly decided it in this conversation. Record owner
     name if given (else "Product owner") and today's date.
   - **Proposed** for a recommended default Claude will build against until confirmed.
   - **Needs decision** when no safe default exists; include 2–3 options with consequences and a recommendation.
   - Never delete or overwrite history: when a decision changes, mark the old row **Superseded by D-NNN** and add
     the new row.
3. Fill every column: topic, decision, status, blocks phase, owner, date, rationale, impact.
4. Find code, docs or prompts that depend on this decision (search for the ID and topic keywords). List what must
   change; if the decision changes behaviour already built, propose the follow-up slice instead of silently editing.
5. Show the user the final row(s) and the list of impacted places.
