# Anti-slop

The merged DON'T catalog — every pattern that makes OneTool UI read as generic, templated, or AI-generated, deduplicated across impeccable, taste-skill, redesign-skill, and emil.

**Scope tags.** `[all]` applies everywhere. `[landing-only]` applies to `(marketing)` and Remotion; ignoring it in the workspace is correct. `[see charter exemption]` means OneTool uses this pattern deliberately — the generic ban does **not** apply; `ONETOOL-DESIGN.md` "House exemptions" wins.

**Anti-slop is a floor, not a direction.** It says what to avoid; the charter says what to build. When torn between refined and committed, commit.

**"Visible copy"** means anything a user reads in the product or in client-facing output: UI labels, headings, body text, toasts, empty states, errors, emails, PDFs, help articles, marketing pages. It does **not** mean code comments, commit messages, PRDs, or reference docs like this one.

## Mechanically checkable (grep these before shipping)

| Check | Threshold |
|---|---|
| Em-dashes (`—`) in visible copy — headlines, labels, buttons, body, toasts, help articles | **zero** `[all]` |
| En-dash (`–`) as a separator (ranges use a hyphen) | zero `[all]` |
| Gradient text (`bg-clip-text` on a heading) | zero `[all]` |
| Gray text on a colored/tinted surface | zero `[all]` |
| Pure `#000` / `#fff` (or `black`/`white` utilities) as a ground | zero — always tint `[all]` |
| Raw hex/oklch in a component (tokens only) | zero `[all]` (`onetool/no-raw-colors` lint) |
| Raw Tailwind palette utilities (`bg-red-500`, `text-zinc-400`) | zero `[all]` (`onetool/no-raw-colors` lint) |
| Arbitrary type sizes (`text-[13px]`) outside the ramp | zero `[all]` |
| Inter, Arial, or a bare system stack as the display face | zero — OneTool is **Outfit** `[all]` |
| Accent colors per surface beyond the token roles | 1 `[all]` |
| Corner-radius systems per surface | 1 (from `--radius`) `[all]` |
| Gray temperature per surface (warm vs cool) | 1 `[all]` |
| `z-index` literals like `9999` outside the known modal stack | zero `[all]` |
| Middle dot (`·`) per metadata line | max 1 `[all]` |
| Eyebrows / kickers on a page | Workspace: only as section labels (11px uppercase semibold `muted-foreground`, one per section, above a hairline); never above a page title. Landing: ≤ `ceil(sections/3)` |
| Consecutive image+text zigzag sections | max 2 `[landing-only]` |
| Marquees per page | max 1 `[landing-only]` |
| Primary CTA label | ≤3 words, one line, never wraps `[all]` |
| Distinct labels for the same intent on one page | 1 `[all]` |

## Typography

- No Inter, Arial, Helvetica, or "closest installed font" as the display voice. OneTool web is **Outfit** (`--font-outfit`); mobile follows `apps/mobile/lib/theme.ts`. `[all]` *(Note: impeccable's craft-floor lists Outfit among reflex training-data faces — the charter overrides it. Outfit is a decided brand choice, not a default.)*
- No second type family without a role only it can perform. No serif display "because it's a creative brief" — the single most-tested AI tell. `[all]`
- Never inject a serif word into a sans headline (or vice versa) for emphasis — emphasize with weight or italic **of the same family**. `[all]`
- No gradient text. Emphasis comes from weight, size, or color. `[all]`
- No all-caps subheaders everywhere; no Title Case On Every Header. `[all]`
- Don't build hierarchy from size alone — size **+ weight + space** as a set. Only using 400/700 (no 500/600) is a defect. `[all]`
- Body measure 45–75ch, target 65–75ch. Tune line-height inversely with measure. `[all]`
- Tracking is size-specific: tighten large display text (−0.02 to −0.03em, hard floor −0.04em), body near 0. A single fixed `letter-spacing` is wrong somewhere. `[all]`
- Numbers in a column, money, timers, and counters use `tabular-nums`. Proportional figures that shift on update are a defect. `[all]`
- Never size a form input below 16px — iOS Safari force-zooms. Body text floor is 16px; 14px only for genuinely secondary text. `[all]`
- Orphan words in headings — use `text-wrap: balance` (headings) / `pretty` (body). `[all]`
- Italic display words with descenders (`y g j p q`) need `leading-[1.1]` minimum plus bottom reserve; `leading-none` clips them. `[landing-only]`
- Never combine paragraph spacing **and** first-line indent. `[all]`
- Light text on dark surfaces needs three-axis compensation: more line-height, more tracking, one weight step. `[all]`

## Color

- Never gray text on a colored or tinted surface — tint the secondary text from the surface hue or the foreground. `[all]`
- Never pure `#000`/`#fff` as a ground; always tint. `[all]`
- No purple→blue "AI gradient", neon cyan, or an oversaturated accent. Saturation ceiling ~80%. `[all]`
- No neon or outer glows. Depth comes from an inner border or a tinted shadow. `[all]`
- One gray temperature per surface — never mix warm and cool grays. `[all]`
- One accent, used consistently; a second accent introduced mid-page is a lock violation. `[all]`
- Dark mode is designed, never a mechanical inversion. Both themes are checked, with alpha composited before judging contrast. `[all]`
- No page-theme flips — one theme for the whole surface, no dark section dropped into a light page. `[all]` (a single deliberate color-block device is allowed `[landing-only]`)
- Color is never the only code — pair with lightness, shape, icon, or label. Red/green alone for error/success fails. `[all]`
- Prefer explicit token colors over chains of translucent overlays; alpha makes contrast context-dependent. `[all]`
- Avoid the premium-consumer default palette (cream `#f5f1ea`-family grounds + brass/oxblood accents + near-black `#1a1714` text) and the near-black + one-neon-accent + glowing-edges cluster. Both are model-default look families, not choices. `[landing-only]`

## Layout & composition

- Three equal feature cards in a row as the section pattern. Use a 2-column zigzag, an asymmetric split, or a scroll-pinned sequence instead. `[landing-only]`
- Everything centered and symmetrical; a centered hero when the variance dial is high. `[landing-only]`
- Same-size icon+heading+text cards used as page *structure*. Cards are the lazy container. `[all]`
- **Nested cards are always wrong.** A card inside a card is a defect on every surface. `[all]`
- The hero-metric template (big number / small label / supporting stats / accent) as a scaffold. `[landing-only]`
- Kicker/eyebrow above a page or card *title*. `[all]` — In the workspace an uppercase 11px semibold `muted-foreground` label may head a form section or a detail panel (one per section, followed by a hairline); that's a section label, not a kicker. Capped, not banned, on landing.
- Section numbers (`01/02/03`, `001 · Capabilities`, `Phase 01`) unless the sequence carries information the reader needs. `[all]`
- No `height: 100vh` — use `min-h-[100dvh]`; `h-screen` breaks on mobile browser chrome. `[all]`
- No missing max-width container; no hardcoded pixel widths on text containers. Budget 30–40% extra width for translated strings; use logical properties (`margin-inline-start`) for RTL. `[all]`
- Flex/grid children need `min-width: 0` / `min-height: 0` or they overflow. `[all]`
- Cognitive-load ceilings: ≤4 items per group, ≤4 visible choices at a decision point, ≤5 top-level nav items, 1 primary action + 1–2 secondary + the rest in a menu. 5–7 is pushing it; 8+ is overloaded. `[all]`
- More space above a heading than below it; tight groups, generous separation. Read computed values, don't eyeball. `[all]`
- Use the documented spacing scale — no one-off values. `[all]`
- DOM and focus order must match visual order at every breakpoint. `[all]`
- No horizontal scroll at any viewport; no fixed widths that break on mobile. `[all]`
- Touch targets ≥44×44px. `[all]`
- Cards in a row forced to equal height by flex, with buttons floating at different vertical positions. Bottom-align the actions; align the feature lists. `[all]`
- Inconsistent vertical rhythm between side-by-side elements; mathematically-correct alignment that reads optically wrong. Trust the eye over the arithmetic. `[all]`
- Symmetrical vertical section padding with awkward floating gaps — "mathematically perfect" spacing is its own tell. `[landing-only]`
- Content that jumps as async data arrives. Reserve the space. `[all]`
- Arbitrary `z-index` values. Define a scale (10 / 20 / 30 / 50) and stay in it; note `ui/modal.tsx` portals at `z-[9999]`, so overlays meant to sit above it need an explicit higher step. `[all]`
- Repeating one layout family down the page. `[landing-only]` — **workspace repetition is the point**; consistency across list pages is a feature, not a defect. `[see charter exemption]`

## Surfaces & effects

- Generic card look (1px border + soft shadow + white background) applied to everything. Prefer `border-t`, `divide-y`, or negative space; reserve card primitives for where elevation genuinely means something. `[see charter exemption]` — ReUI frame/card stay valid containers; the direction is fewer cards, not zero.
- The "ghost card": declare elevation **once** — a border *or* a shadow, never a 1px border under a wide soft shadow. `[all]`
- Shadows carry an offset **and** a soft blur, tinted to the background hue. A zero-offset colored halo is decoration, not depth. No pure-black shadows on light grounds. `[all]`
- Hard offset shadows (`box-shadow: 4px 4px 0`) outside a genuinely neobrutalist context. `[landing-only]` and only deliberately.
- Glass/blur as decoration rather than a chosen effect. Never stack a light translucent surface on another. `[all]`
- Frosted tokens (`frostedBg`/`frostedBorder`) may style chrome but **cannot carry state** — selected/active needs a solid `primary` border or fill. `[all]`
- Colored `border-left`/`border-right` above 1px on cards, list items, callouts, or alerts (the "side-stripe" tell). `[all]`
- Sparklines, progress rings, and soft-shadowed rounded rectangles standing in as fake content. `[all]`
- Div-based fake product screenshots or fake dashboard UI — the #1 LLM-design tell. Use a real screenshot, a real component preview, or nothing. `[landing-only]`
- Monospace as a "technical" costume. Reserve mono for code, data, and measurements. `[all]`
- Unicode glyphs or emoji standing in for an icon system. Icons are drawn — one library, one stroke weight, one size rhythm. Web ships both `lucide-react` and `@heroicons/react`; mixing families inside one view is a finding — match the surrounding surface. `[all]`
- Cliché icon metaphors (rocket = launch, shield = security). `[all]`
- Hand-rolled decorative SVGs, sketch/doodle-style illustration, `feTurbulence` grain. OneTool has an isometric Illustration system — use it. `[all]`
- Decorative `repeating-linear-gradient` stripes or grid overlays with no motif underneath. `[see charter exemption]` — the charcoal rail and header, the grey canvas with 16px corners, and the landing blueprint language are established signature chrome; respect their tokens, don't restyle ad hoc. The workspace canvas is flat paper; the dot-grid and the header notch are retired.
- Decorative status dots. `[see charter exemption]` — StatusBadge's status→color map and its dots are the product language. Never re-map status→color locally; never add a *decorative* dot that carries no state.
- A tinted full-row background to mark a status. Do: the StatusBadge in its own cell; the row stays neutral. `[all]`
- A sixth status role. Do: map the new status to success / warning / danger / info / neutral in `status-badge.tsx`; the vocabulary is closed. `[all]`
- Several competing colored values in one row. Do: one strong indicator per row, everything else muted. `[all]`
- A card grid for more than ~20 records. Do: a data-grid; cards stop scanning at that count. `[all]`
- A tooltip carrying primary content (the value, the instruction). Do: tooltips hold definitions only; put the content on the page. `[all]`
- More than one primary button in view. Do: one primary, one or two secondary, the rest in a menu. `[all]`
- A toast for a blocking error. Do: an inline message above the affected content, with a retry. Toasts are for async results only. `[all]`
- A spinner over data already on screen during a refresh. Do: a thin progress bar and keep the stale data visible. Skeletons are for first load only. `[all]`
- A "create" CTA on a filtered-to-nothing empty state. Do: "Clear filters"; the create CTA belongs to the true empty state. `[all]`
- `will-change` applied broadly or left on at rest. `[all]`
- No custom mouse cursors. `[all]`

## Motion

One-liners; the full bar, values, and review format live in `motion.md`.

- No animation on keyboard-initiated or 100+/day actions (⌘K, shortcuts, core nav). `[all]`
- No `ease-in` on UI; no bounce/elastic easing by reflex; no `transition: all`. `[all]`
- No `scale(0)` entrances; no `transform-origin: center` on a trigger-anchored popover. `[all]`
- No animating `width`/`height`/`top`/`left`/margins. Accordions use `grid-template-rows: 0fr→1fr`. `[all]`
- No zero-duration state changes and no missing `:active` feedback on pressables. `[all]`
- No missing `prefers-reduced-motion` handling — and no global `0.01ms` kill switch that destroys useful feedback. `[all]`
- No repeating the same entrance animation on every section; one authored moment, not scattered effects. `[landing-only]`
- No scroll cues (`Scroll ↓`, animated mouse wheel), no `window.addEventListener('scroll')` for scroll-driven effects. `[landing-only]`
- No animation on functional data the user is reading or acting on. `[all]`

## Copy & content

- Zero em-dashes in visible copy — house style, binary, no "use sparingly" allowance. Also no en-dash separators. `[all]`
- No filler verbs or AI clichés: Elevate, Seamless, Unleash, Next-Gen, Revolutionize, Game-changer, Delve, Tapestry, "In the world of…". `[all]`
- No "Oops!", no exclamation marks in success messages, no AI-cute phrasing. `[all]`
- No placeholder identities: John/Jane Doe, Acme Corp, Nexus, SmartFlow, Lorem Ipsum, the same avatar for multiple users, identical dates across records. Use realistic field-service names and varied data. `[all]`
- No fake-perfect numbers (`99.99%`, `50%`, `$100.00`, `1234567`) and no fake-precise ones (`92%`, `4.1×`, `48k`) unless real or explicitly labeled as sample data. `[all]`
- Never invent claims — prices, customers, benchmarks, capabilities the product doesn't have. Label illustrative values honestly. `[all]`
- Active voice; controls name their action; verb consistency across a flow (button "Publish" → toast "Published"). `[all]`
- Errors name the problem **and** the recovery, in plain language, near the source, without wiping the form. No raw error codes shown to users. `[all]`
- One copy register per surface. Section headline ≤8 words, sub-paragraph ≤25 words. `[landing-only]`
- Quotes ≤3 lines; attribution is name + role (+ optional company), never name only; real typographic quotes. `[landing-only]`
- Cut every sentence in half, then again. Say it once — no header restating the intro. `[all]`
- Poetic/meta micro-labels: "Field notes", "Quietly in use at", "Currently on the bench", locale/time/weather strips, fake version stamps (`v0.6.2`, `Build 0048`), fake live counters ("412 of 800"), fake photo credits. `[all]`
- Pluralization goes through a real i18n path, never `count !== 1 ? 's' : ''`. `[all]`
- AI-generated content presented as if a human wrote it. Assistant output, AI-drafted emails, and AI-suggested values are labeled as such. `[all]`
- Component patterns shipped in their default state because they were the first suggestion: the always-one-filled-one-ghost button pair, the pill "New"/"Beta" badge, the 3-tower pricing table, the 3-card carousel with dots, the 4-column footer link farm, the sun/moon theme toggle, the accordion FAQ. Each is fine when chosen; none is fine by reflex. `[landing-only]`

## Code smells

- Div soup — use semantic HTML; heading levels never skip. `[all]`
- Inline styles mixed with utility classes; arbitrary `z-index: 9999`; commented-out dead code; unused imports; orphaned CSS. `[all]`
- Banned imports (ESLint-enforced): `@radix-ui/*`, `react-aria-components`, `tailwind-variants`, `@intentui/*`, `ui/styled`. There is no `Styled*` layer. `[all]`
- Local currency formatters or `/100` on a stored amount — money goes through `formatCurrency` / `formatMoney` / `apps/mobile/lib/format.ts`. `[all]`
- Local status→color maps — always `domain/StatusBadge`. `[all]`
- Tailwind v4: the v3 `border-[--var]` form generates **nothing** silently. Use `border-(--var)`. `[all]`
- Set-state-in-effect (an ESLint **error** in both web and mobile) and continuous values driven through React state. `[all]`
- Hand-rolling what the component ladder already provides — check vendored `ui/` → ReUI registry → vendor → build in `domain/`. `[all]`
- A system-wide token or abstraction invented for a single local exception. `[all]`
- Missing cleanup: event listeners, subscriptions, timers, in-flight requests on unmount. `[all]`
- No double-submit guard; no optimistic update with rollback where the charter promises "fast by feel". `[all]`
- Client-side validation trusted alone — always validate server-side too. `[all]`
- Missing `alt` text, missing meta tags / favicon, dead `href="#"` links, no custom 404. `[all]`
- Missing states shipped as stubs: skeleton (shaped like the real layout, not a generic spinner), empty (composed, with the Illustration system + `domain/EmptyState`), error, success. `[all]`
