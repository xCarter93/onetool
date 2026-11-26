# Review checklist

The operational pass a OneTool design review walks, in order, ending in a findings table and an explicit Block/Approve verdict.

**How to use it.** Work the sections top-down; a failure high in the list usually explains failures lower down. Every finding needs a `file:line` and a concrete fix — never a vibe. Check the charter's "House exemptions" before writing any finding: several generic rules do not apply here, and reporting them is itself a review defect. Don't re-litigate a documented deliberate tradeoff; note it and move on.

**Evidence to gather first.** Read the actual component files plus the tokens they consume (`apps/web/src/app/globals.css`, or `apps/mobile/lib/theme.ts`), the sibling screens the surface must stay consistent with, and any existing tests. Check both themes. Check 375 / 768 / 1280 widths. Never report a finding you haven't confirmed at its cited line — a mis-attributed finding costs more trust than a missed one. Patrick does the visual verification pass; don't spin up browser automation or throwaway preview routes.

**Surface-mode adjustments.** The same defect has different severity depending on the surface:

| | Workspace | Landing | Portal | Mobile |
|---|---|---|---|---|
| Novelty / variance | penalized — consistency wins | rewarded | penalized | penalized |
| Motion budget | 2/10 | 5–6/10 | 2/10 | 2/10 |
| Density | medium-high | low | medium | medium |
| Repetition across screens | a feature | a defect | a feature | a feature |
| Polish bar for client-facing output | n/a | brand | **highest** | n/a |

---

## 1. Direction & hierarchy

- [ ] **Surface mode declared.** The review opens with `Reading this as: <workspace|landing|portal|mobile|email> — <one-clause stance>.` The mode sets the variance/motion/density dials (charter table). Landing boldness in the workspace is a finding; workspace flatness on the landing page is also a finding.
- [ ] **Squint test.** Blur the detail: are the primary element, the secondary elements, and the major groups still identifiable, in that order? If everything reads at the same weight, hierarchy has failed.
- [ ] **AI-slop test.** "If someone told you an AI made this, would they believe it instantly?" If yes, name which tell from `anti-slop.md` gives it away. Failing it caps any score at 9.0 (Part 3).
- [ ] **Specificity test.** Could this screen be swapped into a different product in the same category with only a logo change? Authored-for-OneTool beats category-interchangeable.
- [ ] **One primary action per view.** 1 primary + 1–2 secondary; the rest goes in a menu. Two competing primaries is a finding. *(Von Restorff, Pareto — `ux-laws.md`.)*
- [ ] **Cognitive load.** ≤4 items per group, ≤4 visible choices at a decision point, ≤5 top-level nav items. 5–7 is pushing it (group or progressively disclose); 8+ is overloaded. *(Hick's, Miller's.)*
- [ ] **Content over chrome.** User data is the visual focus; the UI recedes. Decorative chrome competing with data is a finding.
- [ ] **Wayfinding.** The screen answers: where am I, where can I go, what's here, how do I get out. Current location is indicated in navigation. Back navigation exists and browser history isn't broken. *(Jakob's — conventions users already know.)*
- [ ] **Grouping & mapping.** Proximity implies relationship; a control sits near what it affects. If a label is needed to explain what a control does, the mapping is weak. Enclosure (a border, a tinted ground) beats proximity, so a box around unrelated items is a false group. *(Proximity, Similarity, Uniform Connectedness, Prägnanz.)*
- [ ] **Position by recall.** The first and last slots of a nav, menu, tab bar, or action list hold what the user must find (the primary and the way out); the middle holds the rest. A destructive item never sits first or last next to the primary. *(Serial Position.)*
- [ ] **Direct labels beat safe generic ones.** Name things for their contents ("Scheduled work", "Unpaid invoices"), not vague umbrellas.
- [ ] **Progressive disclosure.** The common path is visible first; advanced options sit one level deeper. Nothing requires the user to remember a value from a previous screen. *(Hick's, Tesler's — the complexity moved, it didn't vanish; check where it landed.)*
- [ ] **End-of-flow moment.** Every multi-step flow (send a quote, collect a payment, finish onboarding, complete an import) ends on a state that names what happened and what comes next. The last screen is never a spinner, a bare list, or a form with a fresh error. *(Peak-End.)*
- [ ] **Unfinished work stays visible.** Multi-step flows show where the user is; drafts, unsent quotes, half-done setup, and interrupted imports surface as resumable items rather than being saved silently or lost. *(Zeigarnik.)*

## 2. Tokens & consistency locks

- [ ] **Role tokens only.** `primary` / `secondary` / `accent` / `muted` / `success` / `warning` / `danger` / `info` (+ their `-fg` counterparts). Zero raw hex or oklch in components. Zero pure `#000`/`#fff`.
- [ ] **One radius scale** per surface, derived from `--radius`. Mixed radius systems in one view is a finding.
- [ ] **One gray temperature.** No warm grays next to cool grays.
- [ ] **One accent.** A second accent introduced mid-page is a lock violation.
- [ ] **Both themes checked.** Light and dark, with `.dark` overrides in `globals.css`. Composite alpha before judging any contrast pair.
- [ ] **Tailwind v4 var syntax.** `border-(--var)` / `bg-(--var)` / `ease-(--var)`. The v3 `border-[--var]` form generates nothing, silently, with no lint or type error — grep for `-[--`.
- [ ] **Frosted can't carry state.** `frostedBg`/`frostedBorder` (~1.1:1 and ~1.3:1 composited) may style chrome but must never indicate selected/active. Selection needs a solid `primary` border or fill.
- [ ] **Spacing scale.** The charter ladder (2 within a group, 4 between fields, 6 between groups, 8 between sections), no one-off values. More space above a heading than below it. Read the computed values.
- [ ] **Z-index scale.** `z-(--z-sticky|dropdown|overlay|modal|above-modal)`, not arbitrary literals. `ui/modal.tsx` portals at `z-[9999]` — anything that must sit above it takes `--z-above-modal`.
- [ ] **Type scale.** The ramp `text-2xs/xs/sm/base/lg/xl/2xl`, no arbitrary `text-[Npx]`. Hierarchy built from size **+ weight + space**. Weights beyond 400/700 are in play where the design calls for them. `tabular-nums` on money and any column of numbers.
- [ ] **Elevation and alignment from the charter's decision tables.** Surface → border/radius/shadow; column → alignment/format. A card with a shadow (other than a child record card's `shadow-sm`), a centered column, or a hand-typed `cubic-bezier` is a finding.
- [ ] **Page pattern named.** List, Detail, Dashboard, or Form (`patterns.md` §1), with its required pieces present. Page actions sit in the page header; tabs are page state, not navigation.
- [ ] **Signature chrome respected.** The charcoal rail and 48px header (`--workspace-rail*` tokens, dark in both themes), the grey canvas with 16px top corners, no ad-hoc restyle, no dot-grid, no notch. Pages compose from the `workspace-*` classes. `.workspace-canvas` is the md+ scroller (sticky/scrollspy target); `min-h-screen` on a page root breaks sticky.

## 3. Components

- [ ] **Acquisition ladder followed.** Vendored `ui/` → ReUI registry (`pnpm dlx shadcn@latest add @reui/<name>`) → vendor from ReUI GitHub → build in `domain/` on existing primitives. Hand-rolling something ReUI already provides is a finding.
- [ ] **StatusBadge for every status.** No local status→color mapping anywhere. (Files: `domain/status-badge.tsx`, `domain/empty-state.tsx` — kebab-case; grep the filename, not the component name.)
- [ ] **`reui/data-grid` for tables/lists**, given a prebuilt TanStack table. Hairline row dividers here are correct — do **not** report them.
- [ ] **`ui/date-picker`** for single-date fields; **`useToast()`** (sonner-backed, colored variants, `loading()` for slow flows) for toasts; **`ChartStripeDefs`** diagonal-stripe fill for area charts; **`domain/EmptyState`** + the Illustration system for empty states.
- [ ] **Money through the canonical formatters** — `formatCurrency` (`apps/web/src/lib/money.ts`), `formatMoney` (portal), `apps/mobile/lib/format.ts`. Never a local formatter (ESLint-blocked), never `/100` on a stored amount (not linted; grep for it). Record-level amounts show exact cents; stats/charts may use `{ whole }`/`{ compact }`. Numeric columns use `tabular-nums`.
- [ ] **No banned imports.** `@radix-ui/*`, `react-aria-components`, `tailwind-variants`, `@intentui/*`, `ui/styled`. There is no `Styled*` layer.
- [ ] **One icon family per view.** Web ships both `lucide-react` and `@heroicons/react`; mixing them in one view gives inconsistent stroke weights. No emoji or Unicode glyphs as icons.
- [ ] **No nested cards.** Card primitives only where elevation genuinely means something; the workspace direction is fewer cards. Elevation declared once — border *or* shadow, never a 1px border under a wide soft shadow.
- [ ] **Modals used deliberately.** Base UI modals/popovers/sheets are sanctioned for confirmations and editors — do **not** report "avoid modals" generically. Do report a modal used for a task that needs neither interruption nor protected focus.
- [ ] **Repetition is not a defect in the workspace.** Consistency with sibling screens is the feature. Anti-repetition rules are landing-only.

## 4. States & accessibility

- [ ] **All eight interaction states** present: default, hover, active/pressed, focus-visible, disabled, loading, error, selected. Hover ≠ focus — keyboard users never see hover.
- [ ] **Focus never removed without a replacement.** `:focus-visible` ring on every interactive element. *(Critical severity in both source corpora: "Never Remove Outline", "Outline Replacement".)*
- [ ] **Keyboard navigation.** Tab order matches visual order; no traps; a skip-to-content link exists on public surfaces.
- [ ] **Accessible names.** Icon-only buttons carry `aria-label`; every form control has a real `<label>` (or `aria-label`) — placeholder-as-label is never acceptable. *(Critical.)*
- [ ] **Contrast AA in both themes.** 4.5:1 body, 3:1 large text (≥24px, or ≥18.67px bold) and 3:1 for controls, icons, and focus indicators. Verify computed pairs, not by eye. Never gray text on a colored surface.
- [ ] **Color is never the only signal.** Pair with icon, shape, or text — red/green alone fails.
- [ ] **Full state cycle shipped, not stubbed.** Skeletons shaped like the real layout (not a generic spinner); composed empty states; inline errors that say what to do next; explicit success feedback. Anything over ~300ms shows a loading indicator. *(Doherty — our 300ms indicator threshold is deliberately tighter than the 400ms response ceiling.)*
- [ ] **Two empty states, two CTAs.** True-empty ("No invoices yet") offers create; filtered-empty offers "Clear filters", never create. Refresh of data already on screen shows a thin progress bar, not a skeleton or spinner. (`patterns.md` §4.)
- [ ] **Right messaging surface.** Async results → toast; blocking errors → inline message above the content with a retry; destructive actions → confirm dialog that states the consequence; tooltips hold definitions only. (`patterns.md` §6.)
- [ ] **Errors are recoverable.** Message names the problem and the recovery, sits near the source, doesn't wipe the form, and is announced (`role="alert"` / `aria-live`). No raw error codes.
- [ ] **Input tolerance.** Fields accept the human forms of a value (a phone number with spaces or dashes, money typed with `$` and commas, a pasted address with line breaks, trailing whitespace in an email) and normalize on the way in; what the app emits is strict and canonical. Rejecting a value the user can plainly read as valid is a finding. *(Postel's.)*
- [ ] **Destructive actions.** Undo beats confirmation for anything reversible; confirm only the genuinely irreversible. Submit buttons disable while in flight — no double submission.
- [ ] **Reduced motion honored** — gentler, not zero (see §5).
- [ ] **Responsive.** No horizontal scroll at any viewport; touch targets ≥44×44px; body text ≥16px on mobile; form inputs never below 16px (iOS force-zoom); space reserved for async content so nothing jumps; `min-h-[100dvh]` not `h-screen`. *(Fitts's — on mobile also check the primary action is in the bottom thumb zone, see `ux-laws.md`.)*
- [ ] **Images and metadata.** Descriptive `alt` on meaningful images, optimized formats (WebP, right dimensions), title/description/og:image present, a favicon, and a custom 404 on public surfaces. `viewport` meta is `width=device-width, initial-scale=1`.
- [ ] **Alignment of grouped items.** Cards in a row bottom-align their actions and align their feature lists; nothing floats at a different vertical position because flex stretched it.
- [ ] **AI content labeled.** Assistant output, AI-drafted email, and AI-suggested field values are visibly marked as AI-generated — never presented as the user's or a human's writing.
- [ ] **Plan gating matches reality.** Gated surfaces reflect `lib/permissions.ts`; a UI-only gate on something the backend doesn't enforce is worth flagging as a note, not a design finding.

## 5. Motion

Walk the review bar in `motion.md` §5 and fold its findings into the same table. The short version:

- [ ] Frequency gate passed — nothing animates on ⌘K, shortcuts, or 100+/day actions.
- [ ] Purpose nameable; curves from the canonical three (`ease` is fine for hover/color changes, `linear` for constant motion — see `motion.md` §2); UI durations under 300ms; exits ≈75% of entrances.
- [ ] `transform`/`opacity` only (accordions: `grid-template-rows: 0fr→1fr`); no `transition: all`; no `scale(0)`; origin-aware popovers via `var(--transform-origin)` — **centered modals exempt**.
- [ ] Rapidly-triggered UI uses transitions or springs, not `@keyframes`.
- [ ] `prefers-reduced-motion` handled without nuking useful feedback; hover motion gated behind `@media (hover: hover) and (pointer: fine)`.
- [ ] No continuous value driven through React state (set-state-in-effect is an ESLint **error** in web and mobile).
- [ ] Motion is budgeted, not sprayed: 1–2 animated elements per view, not everything that moves.
- [ ] Scroll behaves — smooth where it should be, no jumping, no hijacking, and the browser back button still works.
- [ ] Landing only: any Remotion or scroll-driven scene has a reduced-motion path at the embed site, and nonessential loops stop when offscreen.

## 6. Copy

- [ ] **Zero em-dashes** in visible copy. Zero en-dash separators. House style, binary.
- [ ] **Voice**: plain, professional, active. A smart teammate — never corporate, never a toy, never AI-cute.
- [ ] **Verb consistency across the flow**: button "Publish" → toast "Published" → history "Published by …".
- [ ] **One label per intent** across a surface — pick one of "Get in touch" / "Contact us" / "Let's talk", not several.
- [ ] **Primary CTA** ≤3 words, fits one line, never wraps.
- [ ] **No AI clichés**: Elevate, Seamless, Unleash, Next-Gen, Revolutionize, Delve, "In the world of…". No "Oops!", no exclamation marks in success messages.
- [ ] **No placeholder identities or fake data**: John Doe, Acme Corp, Lorem Ipsum, `99.99%`, identical dates, one avatar reused. Sample data is realistic and labeled as sample.
- [ ] **No invented claims** — prices, customers, benchmarks, or capabilities the product doesn't have.
- [ ] **Read every visible string aloud** for grammatical breaks, unclear referents, and forced metaphors.
- [ ] **Help content freshness.** If the change alters user-visible behavior on a surface in `packages/help-content` (route map: `apps/web/src/lib/help/route-help.ts`), the matching article is updated in the same change — or the gap is recorded in `.planning/help-center-fact-gaps.md`. New workspace pages need a `route-help.ts` entry.

## 7. Countable checks

Run these mechanically before writing the verdict; each is a grep or a count, not a judgment.

| # | Check | Threshold | Scope |
|---|---|---|---|
| 1 | `—` / `–` in visible copy | 0 | all |
| 2 | `bg-clip-text` gradient headings | 0 | all |
| 3 | Raw hex / `oklch(` in components | 0 | all |
| 4 | `-[--` (v3 CSS-var utility form) | 0 | all |
| 5 | `text-black` / `text-white` / `#000` / `#fff` as a ground | 0 | all |
| 6 | Font families in play beyond Outfit + mono | 0 | all |
| 7 | Radius systems per surface | 1 | all |
| 8 | Accent colors per surface | 1 | all |
| 9 | Icon families per view | 1 | all |
| 10 | Card nested inside a card | 0 | all |
| 11 | `z-index` literals outside the known modal stack | 0 | all |
| 12 | Interactive elements without a `:focus-visible` style | 0 | all |
| 13 | Icon-only buttons without `aria-label` | 0 | all |
| 14 | Inputs whose only label is a placeholder | 0 | all |
| 15 | `transition: all` / `ease-in` on UI / `scale(0)` | 0 | all |
| 16 | Animated `width`/`height`/`top`/`left`/margin (accordion `0fr→1fr` exempt) | 0 | all |
| 17 | Movement without a `prefers-reduced-motion` branch | 0 | all |
| 18 | Local currency formatters or `/100` on stored money | 0 | all |
| 19 | Local status→color maps (not `domain/StatusBadge`) | 0 | all |
| 20 | Banned imports (`@radix-ui`, `react-aria-components`, `tailwind-variants`, `@intentui`, `ui/styled`) | 0 | all |
| 21 | Touch targets under 44×44px | 0 | all |
| 22 | Horizontal overflow at 375px / 768px / 1280px | 0 | all |
| 23 | Middle dots (`·`) per metadata line | ≤1 | all |
| 24 | Eyebrows / kickers above a title | 0 everywhere; workspace section labels (11px uppercase, one per section) are not kickers. Landing ≤`ceil(sections/3)` | scoped |
| 25 | Consecutive zigzag sections / marquees per page | ≤2 / ≤1 | landing |
| 26 | `h-screen` / `100vh` on a full-height section | 0 (use `min-h-[100dvh]`) | all |
| 27 | Form inputs sized below 16px | 0 | all |
| 28 | `href="#"` dead links | 0 | all |
| 29 | Set-state-in-effect / continuous value in React state | 0 | all |
| 30 | Missing `alt` (or `alt=""` on a meaningful image) | 0 | all |
| 31 | Raw Tailwind palette utilities (`onetool/no-raw-colors`) | 0 new | all |
| 32 | Arbitrary type sizes `text-[Npx]` | 0 | all |
| 33 | Hand-typed `cubic-bezier(` (use `ease-out-quint` / `ease-in-out` / `ease-drawer`) | 0 | all |
| 34 | Centered table columns or headers | 0 | all |
| 35 | Primary buttons in one view | ≤1 | all |

**Write the missing rule.** When a finding is real but no row in this checklist, `anti-slop.md`, or `patterns.md` covers it, the fix includes adding the row. The rules grow from reviews; a finding that stays tacit gets re-shipped.

## 8. Output format

### Part 1 — findings table

One table, one row per finding, ordered **most severe first**. No "Before/After" prose lists.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| P0 | `apps/web/.../InvoiceRow.tsx:64` | Amount formatted with a local `toFixed(2)` helper | Import `formatCurrency` from `@/lib/money` |
| P0 | `.../Toolbar.tsx:31` | Icon-only button has no accessible name | Add `aria-label="Filter"` |
| P1 | `.../StatusChip.tsx:12` | Local status→color map duplicates StatusBadge | Replace with `domain/StatusBadge` |

Severity:

- **P0 — Blocking.** Prevents task completion, loses or misstates data, breaks the multi-tenant/permission story, or fails a Critical accessibility check (no accessible name, removed focus outline). Money formatted by hand is P0 — it misstates a number a business owner acts on.
- **P1 — Major.** WCAG AA violation, a broken interaction state, a feel-breaking motion regression, a charter/token violation, or a defect a user would contact support about.
- **P2 — Minor.** Annoyance with a workaround; inconsistency that doesn't block.
- **P3 — Polish.** Real but low impact — stagger, token consolidation, copy tightening.

Tie-break heuristic: *would a user contact support about this?* If yes, it is at least P1.

Rules for the table: cite `file:line` for everything; give the actual fix, not a category; pull exact values from `motion.md` §2 and the charter rather than approximating; never list a finding you haven't confirmed at its cited line; drop anything covered by a House exemption.

### Part 2 — verdict

One line, explicit, with a one-line rationale.

- **Block** — any P0 or P1; or a missing state cycle on a shipped surface; or copy that would embarrass the user in front of their client.
- **Approve** — no P0 or P1, states complete, both themes checked, reduced motion respected. P2/P3 may remain open and are listed as follow-ups.

Never announce a pass while the table still holds material findings, and never soften a verdict label — it is load-bearing. If the review is partial (one component, no runtime check), say so in the rationale rather than implying full coverage. Where feel genuinely can't be judged from code, say so and prescribe the check (slow-motion playback, both themes side by side, a real device) instead of guessing.

Hand off fixes to `design-improve`; this checklist does not edit code.

### Part 3. Score

Give a number only when someone asks for one. Score each area 0 to 10 with a one-line reason: visual design, motion, accessibility, copy, code quality, performance. Then give an overall.

**The hand-crafted gate.** An overall of 9.5 or higher says a person carefully made this. It needs all three:

- A skeptical designer shown the surface would not guess an AI made it. That's the AI-slop test in §1.
- None of the tells in `anti-slop.md` appear on the surface. Patterns covered by the charter's House exemptions don't count.
- It passes the specificity test. It couldn't move to another product in its category with only a logo swap.

Miss any one and the overall caps at 9.0. Name the tells that set the cap. A Block verdict also keeps the overall under 9.5.
