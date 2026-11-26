---
name: design-improve
description: Use when restyling, polishing, modernizing, or fixing the look, feel, or UX of EXISTING OneTool UI — "make this better/cleaner/less cluttered/more professional", spacing/typography/color/motion passes, de-slopping a screen, or when a feature works but looks rough. Not for building new surfaces (design-new) or review-only feedback (design-review).
---

# Improve Existing UI

Diagnose before transforming, change one axis at a time, checkpoint with Patrick between
phases. All referenced modules live in `.agents/design-sources/`.

## Workflow

1. **Classify + baseline.** Read `ONETOOL-DESIGN.md`; declare the surface mode. Read the
   actual current code of the target surface — never improve from memory or a description.

2. **Diagnose first (no edits).** Walk `review-checklist.md` + `anti-slop.md` against the
   surface, and `patterns.md` for the page pattern, table, form, state, and messaging specs,
   then produce a short findings list (Severity | file:line | finding). Where a finding
   is really a behavioral one (too many choices, unreachable target, no end-of-flow moment),
   name the law from `ux-laws.md` in the finding so the fix has a reason. Respect the
   charter's House exemptions — semantic status colors, data-grid hairlines, and workspace
   repetition are features, not defects.

3. **Plan and checkpoint.** Map the findings to the fewest axes that fix them, propose the
   pass order, and get Patrick's go-ahead before multi-file transforms. Axis → module map
   (vendored impeccable verb modules; `ls .agents/design-sources/impeccable-reference/` for
   the current set, or `/impeccable <verb>` once the plugin is active):
   - Cluttered / over-designed → `distill.md`, `quieter.md`
   - Timid / bland (landing only) → `bolder.md`; monochrome needing accents → `colorize.md`
   - Typography → `typeset.md`; layout & spacing → `layout.md`
   - Off-system one-offs → align to the charter's component ladder + tokens (normalize)
   - Robustness (i18n, extreme content, error paths) → `harden.md`
   - Motion → `motion.md` (constants + review bar) — emil content, not impeccable
   - Final pre-ship pass → `polish.md`
   Opposed pairs (bolder↔quieter, colorize↔distill) never run in the same effort.

4. **Transform in phases, one altitude per pass:** structure/layout → type → color →
   states/robustness → motion → final polish. Skip phases the diagnosis didn't implicate.
   Brief checkpoint after each phase (what changed, what's next). Never leak phase narration
   into code comments.

5. **Verify:** re-walk the checklist against the diff only; state what pixel/behavior actually
   changed so the fix is checkable. Both themes, reduced motion, keyboard pass.

## Hard rules

- Diagnosis is mandatory — no "improvement" passes on plausibility alone.
- Don't restyle established signature chrome (charcoal rail and header, grey canvas, StatusBadge
  colors, mobile picture frame) as a side effect; call it out if it's genuinely the problem.
- Preserve URLs, nav labels, form field names, and legal copy silently changing nothing the
  user relies on.
- Tokens/components stay on-system; a redesign that needs new tokens is a decision for
  Patrick, not a side effect.
