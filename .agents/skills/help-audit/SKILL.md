---
name: help-audit
description: Re-verify OneTool help center articles (packages/help-content) against the current code and report or fix factual drift. Use whenever the user asks to audit, verify, or fact-check help docs or documentation accuracy, mentions stale or outdated docs or docs drift, asks whether help articles still match the product, finishes a large feature and wants the docs checked, or a scheduled documentation audit runs. Trigger even for partial scopes like "check the quotes help articles".
---

# Help content audit

The 43 help articles in `packages/help-content/articles/*.ts` were written by fact-checking the code at a point in time. Code moves; copy doesn't. This skill re-runs that fact-check: every user-visible claim in an article (button labels, step sequences, plan availability, permission lines, described behavior) is either confirmed by current code or reported as drift. Wrong docs are worse than no docs — a user following a stale step loses trust in the whole help center — so the bias is: confirm with evidence, and when the code can't confirm a claim, say so rather than guessing.

## Modes

- **Report (default)**: produce the drift report. Do not edit articles.
- **Fix**: only when the request says to fix/update the articles. Apply edits for confirmed drift, then follow "Fix rules" below.

## Scope

Default is all 13 categories. Narrow when the request names categories, article refs, or "changed since <ref>". When asked to audit "what changed", prioritize by comparing `git log` timestamps: a category whose source surfaces (see `references/sources.md`) changed after its article file last changed is the one likely to have drifted.

## Process

1. Enumerate scoped articles from `packages/help-content/articles/*.ts` (registry: `packages/help-content/registry.ts`).
2. Read `.planning/help-center-fact-gaps.md` if it exists. It lists claims that were already known-unverifiable when the docs shipped. Do not re-report those as new drift; do note any that the current code can now settle.
3. Audit each category. For 1–2 categories, do it directly. For more, spawn one verification subagent per category (a cheaper model is fine — the work is reading and comparing, not judgment) using the handoff packet below, run them in parallel, and vet surprising findings yourself by reopening the cited code before reporting them.
4. Check route-map coverage: every `apps/web/src/app/(workspace)/**/page.tsx` route should have an entry in `apps/web/src/lib/help/route-help.ts`. Report unmapped pages and refs that no longer resolve.
5. Write the report (format below) to `.planning/help-audit-<YYYY-MM-DD>.md` when `.planning/` exists; otherwise return it directly. Lead with the drifted claims — confirmed claims are one summary line per article.

## Verification subagent handoff packet

Give each subagent only this — it has no chat context:

- Repo root path and the single category's article file path.
- The source surfaces for that category from `references/sources.md`, with the note that these are starting points: locate exact files with `graphify query` / glob / grep before concluding anything.
- The task: for every user-visible claim in each article (bolded UI labels, step order, plan availability lines, permission lines, described behavior and side effects), find the code that backs it. Verify behavior end to end: a claim that an action works is confirmed only when the UI control exists AND the backend path succeeds under every condition the copy implies — read the mutation for guards and throws. (A Delete button rendered in every status is still drift if the mutation rejects quotes that have invoices.) Classify each claim:
  - **confirmed** — code matches; cite file:line.
  - **drifted** — code contradicts the copy; cite file:line and state what the copy should say now.
  - **unverifiable** — could not find code that settles it either way; say where you looked.
- Evidence format: per-article list of `claim → verdict → file:line → note`.
- Stop conditions: if the article file or source dirs don't exist as described, or a search stalls, stop and report rather than improvising.

## Report format

```
# Help audit — <date> — scope: <scope>

## Drift (fix these)
- <category/article-slug>: "<claim as written>" → <what the code actually does> (<file:line>)

## Newly resolvable fact gaps
- <fact-gaps entry that current code can now settle, and the answer>

## Unverifiable claims
- <category/article-slug>: "<claim>" — looked in <where>

## Route map
- Unmapped workspace pages: <routes>
- Broken refs: <refs>

## Confirmed
- <category/article-slug>: N claims confirmed
```

## Fix rules

- Copy style is enforced by `apps/web/src/lib/help/help-content.test.ts`: no em/en dashes, no exclamation marks, no marketing filler (seamless, effortless, robust, leverage, empower, etc.). Match the surrounding article's voice; steps bold only labels confirmed in code.
- Never "fix" an unverifiable claim by rewording it into a different unverified claim — either confirm it or move it to `.planning/help-center-fact-gaps.md`.
- Update `.planning/help-center-fact-gaps.md`: remove entries the audit settled, add new unverifiable claims found.
- After edits, run both consumers' tests:
  - `cd apps/web && pnpm exec vitest run src/lib/help/`
  - `cd packages/backend && pnpm exec vitest run convex/assistantTools.test.ts`
