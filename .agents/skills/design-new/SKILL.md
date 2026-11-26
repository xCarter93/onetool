---
name: design-new
description: Use when creating new UI in OneTool — a new page, screen, view, component, flow, empty state, landing section, portal/mobile surface, or a new section/panel added to an existing page — before writing any JSX for it. Triggers on "build/create/design/add a <page|screen|component|section>", new feature UI, or any UI that doesn't exist yet (restyling existing UI is design-improve).
---

# Design New UI

Produce OneTool-consistent UI on the first pass by running research → brief → build → self-review,
with the design charter as law. All referenced modules live in `.agents/design-sources/`.

## Workflow

1. **Classify the surface.** Read `ONETOOL-DESIGN.md` (the charter) and open with one line:
   `Reading this as: <workspace|landing|portal|mobile|email> — <one-clause stance>.` The
   surface mode sets how bold you're allowed to be; workspace boldness budget is ~zero —
   consistency with existing screens beats novelty there.

2. **Research references** — skip only when the pattern already exists on a sibling OneTool
   screen (another list page, another report section) that you can match; research when the
   pattern is new to the product. When researching, follow
   `research-mobbin.md` — 2–3 Mobbin searches, examine the images, keep 2–3 references with a
   one-line reason each, cite their `mobbin_url`s. Steal structure, never palette/type.

3. **Write the design brief before any code** (a few lines in your reply, not a file):
   - Page pattern from `patterns.md` §1 (List, Detail, Dashboard, Form) and its required
     pieces; for a table, form, status, empty/loading/error, or message surface, the matching
     `patterns.md` section sets the spec.
   - Layout concept (ASCII sketch if it helps) and content hierarchy — what's the ONE primary
     action; what does the squint test show.
   - Token roles used (semantic roles from the charter only — no new values, no raw hex).
   - Component plan via the acquisition ladder (`ui/` → ReUI registry → vendor → `domain/`).
     Statuses through `StatusBadge`, tables through `data-grid`, money through the canonical
     formatters.
   - The behavioral laws the layout leans on, by name from `ux-laws.md` (its situation → law
     index is the entry point): e.g. how many choices sit at the decision point (Hick's), what
     is thumb-reachable on mobile (Fitts's), what the end-of-flow moment is (Peak-End).
   - One signature moment max, scoped to the surface mode (landing: earn it; workspace:
     usually none).
   - Copy: real strings in house voice — no placeholder lorem, no AI-cute phrasing.

4. **Build the real thing.** No scratch/preview routes — wire the actual surface; Patrick does
   visual verification. Ship the full state cycle (skeleton shaped like the layout, composed
   empty state, inline errors, success feedback), all interaction states, both themes.
   Motion only per `motion.md` constants — check the frequency gate before animating anything.

5. **Self-review before presenting:** walk `review-checklist.md` against your own work and fix
   what fails; run `anti-slop.md`'s checks last. Then summarize what you built and which
   references/brief decisions shaped it.

## Escalation (load only when needed)

- Landing/marketing aesthetic direction: invoke `frontend-design:frontend-design`, and/or read
  `impeccable-reference/new-work.md` + `craft-floor.md` (or `/impeccable` once active).
- Motion-heavy work: `motion.md` first; deep dives in `emil-skills/skills/` (apple-design for
  gesture/spring physics, animation-vocabulary to name an effect precisely).
- Palette/font/chart/domain data lookups: `python3 .agents/design-sources/ui-ux-pro-max/scripts/search.py
  "<query>" --domain <d>` — trust the CSV lookups, never its `--design-system` recommendation.
- Component discovery: ReUI MCP (`mcp__reui__search` → `get_component` → `get_examples`).
- Charts/data viz: the `dataviz` skill.

## Hard rules

- Charter over any external source; its House exemptions override generic anti-pattern lists.
- Never invent tokens, colors, or a second radius scale; flag it if the design truly needs a
  new token and let Patrick decide.
- Landing boldness never bleeds into workspace/portal.
- New workspace pages need a `route-help.ts` entry; substantial new sections on a surface
  documented in `packages/help-content` update the matching help article in the same change
  (help-content freshness rule).
