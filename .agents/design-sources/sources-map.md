# Sources map

Where every design reference in this repo lives, what it is authoritative for, how to invoke it, and how far to trust it.

## Routing table

| Need | Go to |
|---|---|
| Any design decision at all | `ONETOOL-DESIGN.md` (charter — always first, always wins) |
| Motion values, animation review | `motion.md` |
| "Is this pattern banned?" | `anti-slop.md` |
| Which page layout, table/form spec, status vocabulary, empty/loading/error, message surface | `patterns.md` |
| "Why does this layout/flow work (or not)?" — choice count, target size, grouping, timing, memory, end-of-flow | `ux-laws.md` |
| Reviewing/grading a screen | `review-checklist.md` |
| Real-world reference UI before designing | `research-mobbin.md` |
| A verb-shaped push (bolder, quieter, distill, harden…) | impeccable — `/impeccable <verb>` |
| Gesture/spring/Apple-fluid detail beyond `motion.md` | `emil-skills/skills/apple-design/SKILL.md` |
| A named defect list for an audit | `taste-skill/skills/redesign-skill/SKILL.md` |
| Rule lookup by topic (contrast, spacing, forms…) | ui-ux-pro-max `search.py` |
| Landing/marketing direction, UX writing | frontend-design plugin |
| Pointer-reactive isometric line figure (landing only) | Hairline (§10) |

## 1. The charter and the distilled modules — `.agents/design-sources/`

- `ONETOOL-DESIGN.md` — surface modes, tokens, component acquisition ladder, quality floor, **House exemptions**. Law. Every design skill loads it first; no other source may contradict it.
- `motion.md` — the motion bible (gate, constants, CSS-vs-spring, stack notes, review bar).
- `anti-slop.md` — the merged DON'T catalog, scope-tagged `[all]` / `[landing-only]` / `[see charter exemption]`.
- `patterns.md` — the pattern catalog: the four page layouts and their required pieces, table and form specs, the closed status vocabulary, empty/loading/error rules, and the messaging surface matrix. Ported from Datadog's DRUIDS guidelines (2026-09) with its numbers replaced by ours.
- `ux-laws.md` — the behavioral laws (Hick's, Fitts's, Miller's, Doherty, Peak-End, Gestalt grouping, Tesler's, Postel's…) translated into OneTool web and mobile rules, each with a review check and an anchor in the current product. Cite a law by name in a brief or a finding; the module is the reason behind several `review-checklist.md` rows.
- `review-checklist.md` — the operational checklist `design-review` walks.
- `research-mobbin.md` — how to use the Mobbin MCP (`mcp__mobbin__search_screens` / `search_flows` / `search_sections`) as the reference layer. **This file is the only Mobbin guidance you need** — don't re-derive it. Steal structure, never palette or type.

These modules are distilled *from* everything below. Read a raw source only when a distilled module points you there or when you need a detail it deliberately dropped.

## 2. impeccable — plugin 4.0.4 + vendored reference

- **Plugin**: `impeccable@impeccable`, enabled for this repo in `.claude/settings.json`.
- **Vendored reference**: `.agents/design-sources/impeccable-reference/*.md` — one module per verb, plus `README.md` and `DESIGN.md`.
- **Invoke**: `/impeccable <verb> <target>` (e.g. `/impeccable audit projects`, `/impeccable quieter landing-hero`). Bare `/impeccable` lists the menu; free text works (`/impeccable redo this hero section`). `/impeccable pin audit` creates a standalone `/audit`. **Requires the plugin to be active** — after installing or updating, restart the session before the slash command resolves.
- **Authoritative for**: the curated anti-pattern catalog (`craft-floor.md` is the quality bar; `new-work.md` names the look-clusters models default to), verb-shaped pushes (`bolder`, `quieter`, `distill`, `harden`, `onboard`, `clarify`, `typeset`, `colorize`, `layout`, `delight`, `optimize`, `adapt`, `overdrive`, `animate`), and the P0–P3 severity vocabulary.
- **Trust notes**: the verb modules are the best-written anti-pattern source we have — the extracted rules already live in `anti-slop.md`, so read the raw module only for a verb you're actually running. `/impeccable init` writes a root `PRODUCT.md`/`DESIGN.md`; **don't run it** — `ONETOOL-DESIGN.md` already fills that role and a second competing design doc is a maintenance hazard. Its scoring rubrics (audit /20, critique /40 Nielsen) are useful; our review verdict format is Block/Approve, not a score, so translate rather than paste. Its `live` browser-iteration mode conflicts with the standing rule that Patrick does visual verification.

## 3. emil-skills — `.agents/design-sources/emil-skills/skills/`

Emil Kowalski (animations.dev, ex-Vercel/Linear). Vendored, not installed as skills — read the files directly.

| Path | Authoritative for |
|---|---|
| `review-animations/STANDARDS.md` | The precise motion values (curves, duration table, springs, stagger, gestures, clip-path). Cite, never approximate. |
| `review-animations/SKILL.md` | The ten non-negotiable standards, escalation triggers, remedial hierarchy, verdict format. |
| `improve-animations/AUDIT.md` | The 8-category audit taxonomy + HIGH/MEDIUM/LOW severity definitions. |
| `improve-animations/SKILL.md` | Audit → plan workflow (recon, parallel audit, vetting, self-contained plans). |
| `find-animation-opportunities/SKILL.md` | The 4-question gate and the "where to hunt" seam list; **and the required rejected-candidates section**, which is what keeps it from becoming a wishlist. |
| `animation-vocabulary/SKILL.md` | Reverse-lookup glossary — turns "the bouncy thing when a popover opens" into "Pop in". Naming only. |
| `apple-design/SKILL.md` | Fluid/gesture depth beyond `motion.md`: interruptibility, velocity handoff, momentum projection, rubber-banding, translucent materials, Apple's 8 design principles. |
| `emil-design-eng/SKILL.md` | The hub knowledge base — philosophy, the Before/After review-table format, CSS transform/clip-path mastery, Sonner component-building principles, 12-row review checklist. |
| `prototype/`, `pick-ui-library/` | Not used here — our component ladder is settled by the charter. |

**Trust notes**: emil is the primary motion authority; `motion.md` already carries its values, so open these only for detail it dropped (gesture math, clip-path recipes, the vocabulary glossary). `apple-design`'s typography section conflicts with our stack — it says "default to the platform system font"; OneTool uses **Outfit**. The charter wins.

## 4. taste-skill — `.agents/design-sources/taste-skill/skills/`

MIT, by leonxlnx. Thirteen sub-skills of very uneven fit. Vendored, not installed.

- **Adopt**:
  - `taste-skill/SKILL.md` (the v2 flagship) — §0 brief inference, §4 bias corrections, §9 AI tells, §14 pre-flight. Distilled into `anti-slop.md` and `review-checklist.md`.
  - `redesign-skill/SKILL.md` — the ~90-defect audit checklist; the best portable defect vocabulary available. Highest-severity rows are folded into `review-checklist.md`.
  - `output-skill/SKILL.md` — how to report design work back.
- **Adapt**: `minimalist-skill/SKILL.md` — usable for workspace restraint, but read it as a dial, not a style; the workspace is calm-and-dense, not sparse.
- **Skip for workspace work**: `brutalist-skill`, `soft-skill` (whole-aesthetic takeovers that violate the surface-mode dials — brutalist ideas are landing-only and even there the charter's blueprint language already sets direction), `gpt-tasteskill` (a port for a different model), `image-to-code-skill` / `imagegen-frontend-web` / `imagegen-frontend-mobile` / `stitch-skill` (image-generation and screenshot-to-code pipelines we don't run), `taste-skill-v1` (superseded by the v2 flagship), `brandkit` (our brand is settled).

## 5. ui-ux-pro-max — `.agents/design-sources/ui-ux-pro-max/`

A large CSV rule corpus with a Python search front-end. Available as the `ui-ux-pro-max` skill, but the **CSV lookup is the part worth using**:

```bash
python3 .agents/design-sources/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain> -n 8
python3 .agents/design-sources/ui-ux-pro-max/scripts/search.py "<query>" --stack <stack> -n 8
```

- `--domain` (singular, exactly these): `style` · `color` · `chart` · `landing` · `product` · `ux` · `typography` · `icons` · `react` · `web`
- `--stack`: `html-tailwind` · `react` · `nextjs` · `astro` · `vue` · `nuxtjs` · `nuxt-ui` · `svelte` · `swiftui` · `react-native` · `flutter` · `shadcn` · `jetpack-compose`
- Other flags: `-n/--max-results` (default 3), `--json`, `--format ascii|markdown`.
- Rows return as `Category / Issue / Description / Do / Don't / Code Example Good / Code Example Bad / Severity`.

**Trust notes**: trust the domain and stack CSV lookups — they are terse, checkable Do/Don't rows and good for a second opinion on a specific topic. Relevance ranking is loose: a query often returns one on-target row and two adjacent ones, so read the `Issue` field before using a row. **Do not trust `--design-system` / `-ds`** (nor `--persist` / `--page`, which write files from it) — the pattern picker mismatches intent and would emit a competing design system next to the charter. Never let it write into the repo.

## 6. frontend-design plugin

- `frontend-design@claude-plugins-official`, enabled for this repo in `.claude/settings.json`. Invoke via the `frontend-design:frontend-design` skill.
- **Best for**: landing and marketing direction — aesthetic point of view, typography personality, and UX writing; it is good at pushing past templated defaults.
- **Scope it**: its "take a risk / make a bold choice" framing is written for greenfield marketing sites. That framing applies to `(marketing)` and Remotion only. In the workspace, consistency with existing screens beats novelty and the boldness budget is ~zero (charter surface-mode table).

## 7. web-design-guidelines skill — `.agents/skills/web-design-guidelines/`

Vercel's Web Interface Guidelines reviewer. It **fetches the guidelines from a remote URL at run time** and outputs terse `file:line` findings. Useful as an independent accessibility/interaction sweep over specific files. Two caveats: it needs network access, and its findings are generic-web — reconcile them against the charter's House exemptions before acting (it will flag patterns we keep deliberately).

## 8. Mobbin MCP

Covered entirely by `research-mobbin.md`. Don't call the tools without reading it — the searches-and-images workflow, the 2–3-search cap, and the "steal structure, never palette" rule all live there.

## 9. Component sources (not design theory)

`reui` MCP / skill and the ReUI registry are the *acquisition* path defined by the charter's component ladder, not a source of taste. `21st` MCP is available but generates components outside our ladder — prefer vendored `ui/`, then the ReUI registry.

## 10. Hairline — `@lucasmarkes/hairline`

Lucas Marques' isometric line figures that react to the pointer (MIT, no dependencies, about 6kB per figure, [hairline.lucasmarkes.com](https://hairline.lucasmarkes.com)). Repo: `lucasmarkes/hairline`. Reviewed 2026-11 at v0.5.1.

- **Authoritative for**: the empty-state drawing rules in its `skills/hairline-create/concepts.md` (already distilled into `patterns.md` §4) and the drawing craft in `rules.md`: rounded solids, a bright silhouette over a dim inner crease, opaque plates painted back to front, and a designed rest pose.
- **Use it on**: landing, plus the root 404 (`components/shared/not-found-figure.tsx`, the `plug` figure, pointer response only). The landing motion dial (5–6) allows pointer response. Never in the workspace, portal or public app pages, where the dial is 2 and `motion.md` keeps decorative pointer tracking out. Even on landing it's a third art style next to the halftone scenes and field photos, so it needs a slot where it is the only art.
- **Trust notes**:
  - Figures are 5:4 and need at least 240px wide to read, so none of our `sm`/`md` empty-state slots qualify.
  - Stroke only. Its rule 04 forbids fills and color, so a figure never shares a view with our filled Illustration scenes.
  - DOM-only and client-rendered. On the server it renders an empty 5:4 box, and mobile can't run it.
  - Theme it with the six `--hairline-*` variables. Set `--hairline-plate` to the color of the surface the figure sits on; its plates are opaque.
  - `play` loops on its own. It must follow the landing's pause-motion toggle (`motion-pause.ts`, WCAG 2.2.2) as well as reduced motion.
  - Import from the vanilla entry (`@lucasmarkes/hairline`) and mount in an effect. The React entry's components aren't marked pure, so importing one bundles all 33 figures.
  - In the root `not-found`, use a dynamic `import()` inside the effect. Client chunks there load as scripts on every route; a static import put 7.8kB gzipped on all of them.
  - The package exports only its 33 named figures. A figure from its `hairline-create` or `hairline-adopt` skill is a standalone HTML file with the engine inlined. Shipping one means vendoring that engine into a client component.
- **Skills**: `hairline-create` and `hairline-adopt` are installed from `lucasmarkes/hairline` and pinned in `skills-lock.json`. Unlike the other sources, invoke them directly: `/hairline-create <idea>`, `/hairline-adopt <file.svg>`.
  - Run them from the session scratchpad, never the repo root. Their scripts write `hairline-*.html`, `.png` and `.txt` into the working directory.
  - `look.mjs` installs `playwright-core@1` (unpinned) into `~/Library/Caches/hairline-look` on first run, then screenshots the figure's own HTML in headless Chrome. It checks a standalone file, not the app, so it doesn't break the visual-verification rule. Patrick still judges the figure.
  - To update, re-vendor from upstream and bump `VENDORED.md`. Never hand-edit the vendored files; `validate.mjs` checks `kernel.js` against its own hash.

## 11. Skills that consume all of this

- `design-new` — new surfaces: research → brief → build → self-review.
- `design-improve` — restyle/polish/de-slop existing UI.
- `design-review` — review-only; walks `review-checklist.md`, renders Block/Approve.

