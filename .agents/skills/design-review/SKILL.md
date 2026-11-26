---
name: design-review
description: Use when asked to review, critique, or grade UI/UX quality in OneTool — "does this look right/professional", visual QA of a diff/PR/screen, accessibility or motion review, design consistency check — WITHOUT making edits. For fixing what's found, hand off to design-improve.
---

# Design Review

Review-only: findings and a verdict, no edits. All referenced modules live in
`.agents/design-sources/`.

## Workflow

1. **Scope.** Identify what's under review (a diff, a route, a component) and read the actual
   code. Declare the surface mode from `ONETOOL-DESIGN.md` — workspace, landing, portal, and
   mobile are graded on different dials; never grade workspace calm as "bland".

2. **Walk the checklist.** `review-checklist.md` section by section, plus `motion.md`'s review
   bar whenever the diff touches animation/transition/spring code, plus `anti-slop.md` as the
   final sweep. Name the page pattern and check its required pieces against `patterns.md`.
   Several §1 and §4 rows carry a law tag; when one fails, `ux-laws.md` has the web/mobile
   rule and the fix. Judge contrast only after compositing alpha; check both themes.

   A real finding that no rule covers gets two fixes: the code, and a new row in the module
   it belongs to. Say which row you added in the report.

3. **Honor the House exemptions.** StatusBadge tinted colors, data-grid hairline rows, Base UI
   modals, and workspace repetition are house patterns — flagging them is a false positive.

4. **Report.** Findings table ordered most-severe first, using the P0–P3 severity ladder and
   the Block/Approve thresholds defined in `review-checklist.md` §8 (that section is the
   single authority on severities and verdicts; motion findings from `motion.md` map
   HIGH→P1, MEDIUM→P2, LOW→P3):

   | Severity | Location | Finding | Suggested fix |
   | --- | --- | --- | --- |
   | P0–P3 | `file:line` | one sentence | one clause |

   If everything passes, say so plainly — don't invent nits to seem thorough.

   When asked for a score, use `review-checklist.md` §8 Part 3. Nothing scores 9.5 or higher
   unless it reads as made by a person: any AI-slop tell caps the overall at 9.0.

## Posture

- Default to flagging; approval is earned. But every finding needs a concrete location and a
  concrete failure — no vibes-based deductions.
- Review against the charter, not personal taste or generic "best practices" that the charter
  overrides.
- Escalation for a deeper second opinion: `/impeccable audit` / `/impeccable critique` (once
  the plugin is active; vendored at `impeccable-reference/audit.md` + `critique.md`), or the
  `web-design-guidelines` skill (fetches Vercel's ruleset; network-dependent).
