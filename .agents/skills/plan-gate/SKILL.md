---
name: plan-gate
description: Gate a change behind a written plan that a second model has reviewed. Use before the first edit of any change that touches more than one file, a schema, auth, payments, or a dependency install or upgrade, and when the user says "plan gate" or asks for a plan review.
---

# Plan gate

Tracked files stay untouched until step 5 passes.

## 1. Write the plan

Write `.planning/plans/<slug>.md` with: goal, out of scope, files to touch, ordered steps, checks to run, open questions.

Open every file and line the plan cites. Done when each cited path exists and says what the plan claims.

## 2. Same-provider check

Get one review from a second model on your own provider. `CLAUDE.md` names the route for Claude sessions.

## 3. Cross-model review

Send the plan to the other provider's flagship at high reasoning effort, read-only. `AGENTS.md` names who that is. Use this brief; the reviewer has no history:

```
Review only. Do not edit, commit, push, or start subagents.
Repo: <abs path>  Plan: <abs path to plan file>
Read the plan, then the files it cites. Find steps that will fail, wrong
assumptions about the code, missing callers or migrations, and checks that
would not catch a break. Hold to the smallest change that meets the goal.
blocker = the plan fails as written. should = a real gap in the goal. nit = rest.
Reply:
VERDICT: APPROVE or CHANGES
P1 [blocker|should|nit] <file>:<line or plan step> <claim>. Fix: <suggestion>
```

A timeout, error or empty reply is not approval. Report it.

## 4. Answer every finding

Check each finding against the code yourself. Then, in a `## Review ledger` section of the plan file, mark each id:

- `fixed:` the plan changed, say how.
- `disagree:` with evidence (file:line, test, output).
- `declined:` nit or out of scope, one line.

Run a second round only while a blocker or should is open, and send the ledger with it. Two rounds at most. An item still disputed after that goes to the user with both sides in two lines each.

## 5. Stop for approval

Show the user the plan path, the verdicts, and the ledger. Start editing when they approve.
