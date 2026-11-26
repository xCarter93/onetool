# OneTool design charter

The single source of truth for UI/UX work in this repo. Every design skill loads this first.
Deeper guidance lives in the sibling reference modules (see `sources-map.md`).

The current look is the September 2026 workspace redesign: DRUIDS proportions (Datadog's
design system) on OneTool's blue, Outfit, and Base UI components. The numbers below are what
the CSS ships, not what a reference PDF says. When code and charter disagree, fix one and say
which.

## Cheatsheet

Answer the question here first; read the rest of the charter for the reasoning.

**I need to show...**

| Need | Use | Rules in |
| --- | --- | --- |
| A status | `domain/StatusBadge` (never a local map) | `patterns.md` §3 |
| A list of records | `reui/data-grid` with a prebuilt TanStack table | `patterns.md` §2 |
| Nothing yet / filter matched nothing | `domain/EmptyState` + Illustration system; different CTAs | `patterns.md` §4 |
| First load / refresh | Skeleton shaped like the layout / thin progress bar, never a spinner | `patterns.md` §4 |
| An async result | `useToast()` (never for a blocking error) | `patterns.md` §6 |
| A short focused task | Base UI dialog; long forms get a drawer or page | `patterns.md` §5 |
| A single date | `ui/date-picker` | charter ladder |
| Money | `formatCurrency` / `formatMoney`, `tabular-nums` | charter tokens |
| A chart | `chart-1`…`chart-6` tokens + `ChartStripeDefs`; `dataviz` skill for method | charter tokens |
| A workspace page | `workspace-page` + `workspace-page-header`, then the family's classes | shell section, `patterns.md` §1 |

**What color / size do I use for...**

| Element | Token or value |
| --- | --- |
| Body text, secondary text | `foreground`, `muted-foreground` |
| Interactive, selected, links, focus ring | `primary` (readable action blue, not the logo blue) |
| Status tint / text-on-tint | `{success,warning,danger,info}-soft` / `-foreground` |
| Toast surface | `toast` / `toast-foreground` / `toast-muted` / `toast-border`: a dark surface in both themes (`--invert` in light). Status is the full-height icon block (`success/warning/danger/info` fill, `toast-accent-foreground` icon), never tinted text on the surface |
| Structure | `border` hairlines only at edges: under the page header, under the tab strip, between table rows, inside a card (footer, cell dividers), along a side rail. On record detail pages (client, project, quote, invoice, series), sections separate by spacing (32px main column, 24px sidebar) and a plain 13/600 heading, not by a rule under the heading or a `Separator` between blocks. Form sections keep their legend hairline. Discrete child records are bordered cards |
| Type ramp | `text-2xs` (11) / `xs` (12) / `sm` (13 body) / `base` (15) / `lg` / `xl` / `2xl`; page title 24. No arbitrary sizes |
| Controls | Write `h-8`; the theme renders buttons 28px (30px in the workspace), inputs 30px, and 36–40px below 768px |
| Radius | Controls, badges, tabs, tooltips, toasts 4px. Panels, popovers, dialogs 8px. Sheets 0. Set by the theme, not by class |
| Elevation | Borders for cards and panels; `shadow-sm` on child record cards (related records, sidebar billing and PDF cards); `shadow-floating` popovers; `shadow-overlay` modals. Nothing else |
| Motion | `ease-out-quint` enter/exit, `ease-in-out` moves, `ease-drawer` drawers |
| Icons | lucide, 16 inline (14 inside a 28px control) / 20 standalone / 24 header |

**Which page layout?** List (explorer), Detail, Dashboard, or Form (configuration);
`patterns.md` §1. None of them fits → re-examine, you probably want one of them.

**What absolutely not?** Raw hex or palette utilities in components (lint warns), a second
radius scale, a local status map, a sixth status role, a tinted full row, a toast for a
blocking error, a spinner over data that's already on screen, more than one primary button in
view, a resting card with a shadow, em-dashes in visible copy. Full list in `anti-slop.md`.

## Who this is for

Small field-service business owners (cleaning, landscaping, HVAC, trades). On the go, not
desk-bound, coming from spreadsheets. They want to look professional to their clients while
spending as little time in the app as possible. Brand personality: friendly, modern,
approachable. A smart teammate, never a corporate tool or a toy.

References: Datadog's DRUIDS for proportions and structure (borders do the work, one page
header, tables over card grids), Stripe Dashboard (clean, trustworthy), Notion (flexible,
content-first). Anti-references: generic SaaS card grids, Salesforce density, bare/brutalist
workspace, anything that reads "AI-generated template."

DRUIDS is built for engineers who stare at it all day. Our users want in and out. Take its
structure and shape rules; do not take its row heights, facet rails on every page, or its
"if it feels airy, halve it" reflex. Medium-high density, not Datadog density.

## Surface modes: classify before designing

State the mode in one line before any design work (`Reading this as: <surface> / <mode>`).
The mode sets the dials; never let landing-page boldness bleed into the workspace.

| Surface | Where | Stance | Variance | Motion | Density |
| --- | --- | --- | --- | --- | --- |
| **Workspace** | `apps/web/src/app/(workspace)` | Calm, content-over-chrome. Consistency IS the feature. User data is the star. | Low (3) | Low (2) | Medium-high (6) |
| **Public app pages** | auth, help, legal, community, support | Same theme as the workspace, larger reading text, 32px titles, 16px inputs. | Low (3) | Low (2) | Medium (5) |
| **Landing / marketing** | `apps/web/src/app/(marketing)`, Remotion scenes | Bold allowed (blueprint/wireframe-chassis language, neobrutalist accents). Signature moments earn their place. The only routes outside the shared theme. | High (7-8) | Medium (5-6) | Low (4) |
| **Client portal** | portal routes, quotes/invoices clients see | Professional output. Polished, trustworthy, printable. The client judges the business by it. | Low (3) | Low (2) | Medium (5) |
| **Mobile** | `apps/mobile` | Picture frame: web's graphite rail over a rounded canvas card, web components inside it, the native iOS 26 glass tab bar and native controls for interaction. See "Mobile shell" below. | Low (3) | Low (2) | Medium (5) |
| **Email / PDF** | react-email templates, quote/invoice PDFs | Static, exact, brand-consistent. No motion, bulletproof rendering. | Low | None | Medium |

Design principles (all surfaces): 1) Content over chrome. 2) Obvious over clever.
3) Fast by feel (optimistic updates). 4) Professional output. 5) Calm density.
The behavioral laws behind them (choice count, target size, grouping, timing, memory,
end-of-flow) are translated into web and mobile rules in `ux-laws.md`.

## Where the theme lives

Three CSS files, in cascade order. The last two are imported unlayered, so they beat every
Tailwind utility and every `reui-nova.css` rule. Write classes as if the defaults applied and
let the theme land the final value.

| File | Scope | Owns |
| --- | --- | --- |
| `app/globals.css` | everything | `@theme` token map, landing blueprint tokens, base `:root`/`.dark` values (only the landing still renders these) |
| `app/app-theme.css` | `body.style-nova:not(:has(.dc-landing))`, plus `.dark` variant | the app palette, control sizes, radii, shadows, table and menu treatments. Covers auth, help, legal, portal, community, the workspace, and anything portaled to body (dialogs, Sonner, Clerk popovers) |
| `(workspace)/workspace-theme.css` | `body…:has(.workspace-zone)`, split `html:not(.dark)` / `html.dark` | rail and canvas colors, workspace-only overrides, the `workspace-*` layout classes, the md+ type re-point, mobile touch sizes |

Portal routes get the app theme but not the workspace layer. A `.dc-landing` element anywhere
on the page turns the whole theme off (the marketing page and the reel lightbox do this on
purpose).

Embedded UI reads the same values: Clerk through `var()` in `lib/clerk-appearance.ts`
(4px radius), Stripe Elements through explicit light and dark hex because its iframe cannot
read our CSS variables. That Stripe file is the one sanctioned place for hex outside the theme
files.

## Tokens: never invent values

Canonical files: the three above. Mobile: `apps/mobile/lib/theme.ts` (`useTokens()`).

### Color

Use semantic role tokens only. Never hardcode hex or oklch in components; never pure
#000/#fff; never a Tailwind palette utility (`text-red-600`, `stroke-emerald-500`).

| Role | Light | Dark | Notes |
| --- | --- | --- | --- |
| `primary` / `primary-foreground` | #0073ad / #fff | #38bdf8 / #171717 | The readable action blue. Buttons, links, focus ring, selection, active nav |
| `brand` | #00a6f4 | same | The logo blue. Marketing and the mark only; never an action color (fails AA on white) |
| `background` | #fff | #262626 | Outside the workspace |
| `--workspace-ground` (canvas) | #eef1f5 | #282828 | The grey paper every workspace panel sits on |
| `card` / `popover` | #fff | #2d2d2d / #333 app, #202020 workspace | Panels are lighter than the canvas in light, darker in dark |
| `border` | #e2e5ed (#cbd3de workspace) | #484848 (#3e3e3e workspace) | Solid grey hairlines, no alpha |
| `input` | #c2c8dd (#8592a3 workspace) | #787878 | Control outlines are stronger than panel borders |
| `foreground` / `muted-foreground` | #202e37 / #65717b (#586573 workspace) | #ededed / #b8b8b8 | |
| `muted` / `secondary` | #f9fafb / #f4f5f8 (#eef1f5 / #e6eaf0 workspace) | #303030 / #3a3a3a (#242424 workspace) | Table headers, toolbars, kanban lanes, secondary sections |
| `accent` / `accent-foreground` | #eaf7fe / #075985 | #163447 / #7dd3fc | Selected rows, info callouts |
| rail (`--workspace-rail`, text, muted, hover) | #242424, #ededed, #b8b8b8, #363636 | #151515, #ededed, #b8b8b8, #303030 | Neutral charcoal in both themes. Inside the rail, `primary` becomes #65caff on #171717 |
| dialog backdrop | #15192366, no blur | same | |

Status pairs (solid / `-foreground` text-on-tint). The `-soft` tint is a 10% mix of the solid.

| Status | Light | Dark |
| --- | --- | --- |
| success | #24813e / #17652e | #64ca80 / #85da9b |
| warning | #b86a00 / #875000 | #efb64f / #f4cb80 |
| danger | #cf263c / #ae1c30 | #fa7e8d / #ffa3ae |
| info | #0073ad / #075985 | #38bdf8 / #7dd3fc |

Dark-mode solid badges take #171717 text so they keep contrast. Solid means live status; soft
means historical context. Color the value, never the label. One strong indicator per row, and
never a tinted row.

Charts: light `#0073ad #0ea5e9 #38bdf8 #7dd3fc #bae6fd #008a91`, dark
`#38bdf8 #7dd3fc #0284c7 #bae6fd #e0f2fe #57c4c9`, through `chart-1`…`chart-6`. Area fills use
`ChartStripeDefs`. The `dataviz` skill supplies method; its placeholder palette does not.

Organization branding may override `primary` for a community page. Everything else stays.

### Type

Outfit on every web surface, applied on `<body>`. No separate heading face (`cn-font-heading`
is an empty hook). Roboto Mono is not used; mono is the system stack, for IDs and code only.

| Element | Size / weight | Where set |
| --- | --- | --- |
| Body on themed routes | 13px / 400 / 1.5 | app-theme |
| Workspace md+ re-point | `--text-sm` 13, `--text-base` 15 (`--text-xs` stays 12) | workspace-theme `.workspace-zone` |
| Page title (`workspace-page-header h1`) | 24 / 600 / -0.025em | workspace-theme |
| Dialog, sheet, drawer title | 18 / 600 | app-theme |
| Empty-state title | 16 | app-theme |
| Card, popover, frame title | 14 / 600 | app-theme |
| Section heading | 13 / 600 | workspace-theme |
| Form label | 12 / 600, sentence case, above the field | app-theme |
| Table header | 11 / 600 / uppercase / 0.025–0.035em | both |
| Sidebar group label | 10 / 600 / uppercase / 0.08em | workspace-theme |
| Metric value | 28 (26 in an explorer rail), `tabular-nums` | workspace-theme |
| Help and legal page title | 32 / 600 / tight | TSX (still `text-[32px]`; tokenize when touched) |
| Button text | 12 / 500 app, 13 workspace | both |

Rules: the ramp is `text-2xs / xs / sm / base / lg / xl / 2xl`; `text-[13px]` is a finding.
Build hierarchy from size + weight + space, not size alone. Use weight for hierarchy, never
to emphasize a word inside running text. Desktop body never reaches 16px; mobile inputs are
always 16px (Safari zoom). `tabular-nums` on money and any column of numbers. Nothing is
centered: text left, numbers right.

### Spacing

Tailwind's 4px steps as a ladder: `1–2` inside a control, `2` (8px) within a group, `4`
between fields, `6` (24px) between groups, `8` between sections. Page gutters 24px (16px on
mobile) with an 80px bottom reserve for the assistant pill. Panel insets 16px, 12px on dense
metric tiles. Don't reach for `3`, `5`, or `7` to split the difference.

### Radius

The theme pins radius per component. Class names are advisory; write the default
(`rounded-lg` on a card, `rounded-sm` on a control) and don't fight the theme.

| Component | Radius |
| --- | --- |
| Button, input, select, toggle, badge, kbd, tabs, tooltip, toast, menu item, stepper dot | 4px |
| Checkbox | 2px |
| Card, frame, panel, popover, menu, dialog, drawer, command, alert | 8px |
| Sheet, table rows, frame panels inside the workspace | 0 |
| Workspace canvas top corners | 16px |
| Sidebar inset at md+ | 12px |

Status badges are 4px, never pill-shaped. Circles remain only where they mean something:
avatars, status dots, switch thumbs, step indicators. Known quirk: `--radius` is 6px in the
theme while the components are 4/8, so a bare `rounded-lg` renders 6px until the theme rule
lands, and the alert is 8px on app routes but 4px inside the workspace. Both are follow-ups,
not a license to hand-type radii.

### Elevation

Borders do the structural work. "The page is a Mondrian, not a Trello board."

| Surface | Treatment |
| --- | --- |
| Card, panel, frame, control | 1px `border`, no shadow, no hover lift |
| Popover, menu, select, hover card, tooltip, toast | `shadow-floating` (`--popover-shadow`) |
| Dialog, alert dialog, drawer, sheet, command | `shadow-overlay` (`--dialog-shadow`) over the plain dimmed backdrop |

`shadow-raised` is retired. Nothing at rest carries a shadow.

### Sizing

| Control | App routes | Workspace | Below 768px |
| --- | --- | --- | --- |
| Button default / sm / lg / icon | 28 / 24 / 36 / 28 | 30 / 24 / 36 / 28 | 36 app, 40 workspace |
| Input, select, textarea min | 30 | 30 | 36 app, 40 workspace, 16px text |
| Menu row | min 28 | same | |
| Table header / cell | 32 / `py-2` | same | |
| Sidebar item | | 32 | 40 |
| Record tabs | | 40 | |
| Segmented control | | 28 | 40 |
| Badge | 20 (`h-5`) | same | |
| Data-grid row control | `size-7` (`size-6` dense) | same | |

Preserve the invalid, selected, focus-visible, disabled, and drag-target indicators whenever
you change decoration. Focus is a ring in `primary`; hover on inputs raises the border to
`muted-foreground`.

### Motion and z-index

Curves as utilities: `ease-out-quint`, `ease-in-out`, `ease-drawer`. Z-index ladder:
`z-(--z-sticky|dropdown|overlay|modal|above-modal)`.

### Icons

lucide only for new work (`@heroicons/react` is being retired). 16 (`size-4`) inline with
text and 14 inside a 28px control, 20 standalone or in a toolbar, 24 in a page header, 32–48
inside an empty state. Icons take `currentColor`. Always labelled in nav, table headers, and
form labels; icon-only buttons only for close / more / expand, with an `aria-label`.

### Gotchas

- Tailwind v4 CSS-var utilities are `border-(--var)`; the v3 `border-[--var]` form silently
  generates nothing. Check both themes.
- Frosted/glass tokens (`frostedBg`/`frostedBorder`) may style chrome but can NOT carry
  state. Selected/active needs a solid `primary` border or fill.
- Money renders through `formatCurrency` (`apps/web/src/lib/money.ts`), `formatMoney`
  (portal), or `apps/mobile/lib/format.ts`. Never a local formatter, never `/100`.
- Clerk's popovers redefine `--accent` as their button text color. Element classes passed to
  Clerk use `hover:bg-(--app-accent) hover:text-(--accent-fg)`, never `hover:bg-accent`.
- React Flow stamps `.light`/`.dark` on its own container. The base `:root`/`.light`/`.dark`
  token blocks in globals exclude `.react-flow` so the automations canvas keeps the workspace
  palette; the canvas paints `--workspace-ground` in both themes (with a dot grid, the one
  place it survives) so floating panels and node cards sit on it like cards on any other
  workspace page.
- Map markers and anything else drawn over imagery are opaque: `bg-card` disc with a 2px
  semantic ring, or solid `primary`. Never a `-soft` tint over a map.

## Shell and layout

Signature chrome, in order of what a user sees:

- **Rail.** 232px on desktop, 56px in icon mode, a 19rem sheet on mobile. Neutral charcoal in
  both themes through the `--workspace-rail*` tokens (there is no scoped `.dark` subtree, so
  `dark:` utilities inside the rail still follow the document theme). Items are 32px with a
  4px radius; the active item gets a 2px inset left bar in `primary` and weight 600. Group
  labels are 10px uppercase. The logo is inverted by a filter.
- **Header.** 48px, sticky, rail-colored, continuous with the rail. The ⌘K search sits
  centered at `lg+` (`max-w-xl`, `h-9`, on `--workspace-rail-hover`) and stretches below. Help,
  notifications, and settings icons on the right. The old header notch (`--notch-*`,
  `.header-notch`, `NotchedItem`) is retired and has no consumers.
- **Canvas.** `--workspace-ground` paper with 16px top corners rising out of the rail. Flat;
  the dot-grid is retired. `.workspace-canvas` is the md+ scroller and the sticky target.
- **Assistant pill.** Floats centered at the bottom of the canvas; pages keep an 80px bottom
  reserve for it.

Every workspace page composes from these classes (defined in `workspace-theme.css`). Use them
before writing layout Tailwind.

| Class | Sets |
| --- | --- |
| `workspace-page` | 24px gutters (16 mobile), 80px bottom padding, no max-width |
| `workspace-page-header` | title + description left, actions right, 16px gap, hairline below, 24px space after; description max 65ch |
| `workspace-toolbar` | search and view/action controls, 12/16 padding, hairline below, `muted` fill in light |
| `workspace-explorer` / `-rail` / `-results` | `240px 1fr` grid at ≥64rem with a 24px gap; the rail holds existing filters or summary metrics only |
| `workspace-panel` | 1px border, 8px radius, `card` fill |
| `workspace-section-heading` | 13/600 heading with optional actions, 12px below; no `border-b` on detail pages |
| `workspace-detail` | detail container; keeps the existing sticky-header contract; `--workspace-detail-rail-width` 360px for the side column, which is always a `workspace-panel` box with `workspace-detail-rail` (sticky 88px from the top, 24px below the stuck record header, and 24px below it at rest, capped at the viewport, scrolls internally), `px-5 py-4` inside, 24px grid gap |
| `workspace-metrics*` | bordered 8px container of 16px cells on a `--metric-columns` grid |
| `workspace-record-tabs` | underline tabs, 40px, 16px gap |
| `workspace-segments` | joined segmented buttons with square inner edges |

### Mobile shell

The phone is web's picture frame. Tokens live in `apps/mobile/lib/theme.ts` (`frame` for the
rail, `tokens` for the canvas, which now carries the workspace palette).

- **Rail.** `#242424` (dark `#151515`) owns the status bar, a 44px header (org chip on the
  left; Activity, notifications and avatar on the right as 36px square buttons with a 4px
  radius) and the sync line, which appears under the header only when there is something to
  say. It never scrolls or remounts during navigation.
- **Canvas.** A `#eef1f5` card, full width, with 16px top corners rising out of the rail. It
  runs to the foot of the screen and content scrolls under the tab bar. Every vertical scroll
  view in it sets `contentInsetAdjustmentBehavior="automatic"` (`CanvasScroll` does) so its
  last row scrolls clear of the bar and accessory. That scroll view is also the first child
  down each screen's first-child chain: UIKit finds it that way to minimize the tab bar, so a
  title or control row above a list goes inside the list as its header. Pushed screens slide
  inside it; the rail stays put. A top notch (two 26x31 ogee curves in the rail color) names
  the place: the date on Today, the tab name on other roots, a breadcrumb such as
  "Work > Client" on records.
- **Tab bar.** The native iOS 26 Liquid Glass bar from `expo-router/unstable-native-tabs`:
  Today, Work, Money and Routes, plus Search as the `role="search"` tab that splits off into
  its own circle. Tab icons are SF Symbols, tinted `primary` when selected. The bar minimizes
  on scroll down and reopens when the page is back at the top, even on pages too short for
  iOS to reopen it on its own (`useReopenTabBarAtTop` in `lib/shell-chrome.ts`, already wired
  into `CanvasScroll`). Glass never carries state on its own; selection is the system tint.
- **Accessory.** A glass strip above the tab bar (`NativeTabs.BottomAccessory`). On tab roots
  it holds "Ask OneTool…" (the assistant) and the + create menu. On records it is the action
  tray: one solid `primarySolid` pill for the primary action, up to two text secondaries, and
  the assistant sparkle. When the bar minimizes, the strip goes inline and shows only the
  sparkle and +, or the primary action and the sparkle. iOS renders two copies of it, so its
  state lives in `lib/shell-chrome.ts`, never in the component.
- **Search.** The Search tab is Work's search under a native search bar. Work itself is
  browse only.
- **Inside the canvas** use the web components: page header (24/600 title, hairline below),
  metric strips, joined segments (4px, 2px `indicator` underline on the selected segment),
  underline record tabs, bordered 8px panels with `lineSoft` row dividers, 11px uppercase
  table heads, the square lifecycle stepper, StatusBadge tints.
- **Native for interaction:** sheets, menus, context menus, long-press previews, date and
  value pickers, switches, swipe actions, alerts, pull to refresh. Web-styled for display.
- **Icons:** lucide everywhere we draw; SF Symbols in native menus and the native tab bar.
- **Full screen, no frame:** sign-in, onboarding, in-person signing and the community QR.
- **Retired:** the ink hero band, radial glow, dot grid, floating white dock, gradient orb,
  speed-dial FAB, and the drawn tab row and composer tier on the rail.
- **iPad:** the same frame on web's sidebar layout. The rail becomes a persistent sidebar,
  list and detail panes sit side by side on the canvas, the composer docks at the bottom of
  the canvas, and tray actions move into each pane header.

Do not force every page into an explorer rail. Use one only when the page already has
filters or summary content that belongs there. No invented metrics, filters, or headings.
DOM order matches visual order.

## Component acquisition ladder (web)

```text
src/components/ui/      vendored ReUI base-nova primitives (Base UI under the hood)
src/components/reui/    CLI-installed ReUI components (data-grid, frame, badge, …)
src/components/domain/  OneTool wrappers: StatusBadge (canonical status→color map),
                        EmptyState, SegmentedControl
src/components/shared/  real app components (GlassCard, PillTabs, MultiSelector, …)
```

Order: check vendored `ui/` → ReUI registry (`pnpm dlx shadcn@latest add @reui/<name>`) →
vendor from ReUI GitHub → build in `domain/` on existing primitives. Never hand-roll what
ReUI provides. Tables/lists = `reui/data-grid` (prebuilt TanStack table). Single dates =
`ui/date-picker`. Toasts = `useToast()` (sonner on the dark `toast` surface, status icon block, always a
close button, `loading()` for slow flows). Area charts = `ChartStripeDefs` diagonal-stripe fill from `components/charts/`.
Statuses ALWAYS through `domain/StatusBadge`; never re-map status→color locally.
ESLint blocks `@radix-ui/*`, `react-aria-components`, `tailwind-variants`, `@intentui/*`,
`ui/styled`. There is no Styled\* layer anymore.

## Decision tables

Surface → how it's separated from what's behind it. Pick the row; don't blend rows.

| Surface | Border | Radius | Shadow |
| --- | --- | --- | --- |
| Card / panel / frame | 1px `border` | 8px | none, at rest and on hover |
| Child record card (related records, sidebar billing and PDF cards) | 1px `border`, `card` fill | 8px | `shadow-sm`, so it sits on the page rather than in it |
| Dropdown / popover / combobox / menu | 1px `border` | 8px | `shadow-floating` |
| Tooltip | none | 4px | `shadow-floating` |
| Modal / dialog / command | none | 8px | `shadow-overlay` |
| Drawer / sheet | 1px on the inner edge | 0 | `shadow-overlay` |
| Table row | hairline `divide-y` | 0 | none |
| Control (button, input, select) | 1px `input` (buttons `border`) | 4px | none |
| Status badge | none | 4px, 11px uppercase semibold, soft tint | none |

Column type → how it's set. Applies to data-grids, detail label/value rows, and CSV exports.

| Column | Align | Format |
| --- | --- | --- |
| Text, names, titles | left | sentence case; bold only the row's identifier |
| Money | right | `formatCurrency`, `tabular-nums`, exact cents on records |
| Counts, quantities, percentages | right | `tabular-nums` |
| Dates, times | left | one format per table |
| IDs, numbers (quote #, invoice #) | left | mono, `tabular-nums` |
| Status | left | `StatusBadge`, one status column per table |
| Actions | right, last | one kebab `size-7`, shown on hover, always focusable |

Header cells align with their column. Nothing is centered.

## Motion constants

Full guidance: `motion.md`. The non-negotiables:

- Frequency governs existence: seen 100+×/day (shortcuts, ⌘K) → **no animation**; tens/day →
  minimal; occasional → standard; rare → delight budget.
- Curves: `cubic-bezier(0.23,1,0.32,1)` ease-out (entrances/exits), `cubic-bezier(0.77,0,0.175,1)`
  ease-in-out (moves), `cubic-bezier(0.32,0.72,0,1)` drawers. **Never `ease-in` on UI.**
- Budgets: press 100–160ms, tooltip 125–200ms, dropdown 150–250ms, modal/drawer 200–500ms;
  exits ≈ 75% of entrance. Nothing routine over 300ms.
- Animate `transform` and `opacity` only (accordions: `grid-template-rows 0fr→1fr`). Enter
  from `scale(0.9–0.97)` + fade, never `scale(0)`. Popovers origin-aware
  (`transform-origin: var(--transform-origin)`; Base UI provides it); centered modals exempt.
- No bounce/elastic easing. `prefers-reduced-motion` is a release gate, not a nice-to-have.

## Quality floor (all surfaces, non-negotiable)

- WCAG 2.1 AA contrast in **both** themes. Composite alpha before judging contrast.
- All interaction states: default, hover, active, focus-visible, disabled, loading, error,
  selected. Hover ≠ focus; keyboard users never see hover. Never remove outlines without a
  `:focus-visible` replacement.
- Full state cycle shipped, not stubbed: skeleton loaders shaped like the real layout (5–8
  rows for a table), composed empty states (Illustration system + `domain/EmptyState`, with a
  create CTA when the list is empty and a clear-filters CTA when a filter matched nothing),
  inline errors that say what to do next, success feedback.
- Forms: single column, labels above fields, required fields marked (not optional ones),
  validate on blur and submit, sticky right-aligned footer on long forms. Cancel is never red.
  Modals hold a handful of fields at most and never stack.
- Undo beats confirmation for reversible actions; confirm only the truly irreversible.
- Copy: plain, professional, active voice, verb-led buttons ("Delete client", not "OK");
  verb consistency across a flow (button "Publish" → toast "Published"); no "Oops", no
  apologies, no AI-cute phrasing, no "Seamless/Elevate/Unleash", no lorem names.

## House exemptions (do NOT "fix" these)

Generic anti-slop lists (see `anti-slop.md`) ban some patterns OneTool uses deliberately:

- **Status dots + tinted badges are semantic here.** StatusBadge's status→color map is the
  product language, not decoration.
- **Base UI modals/popovers/sheets are fine.** "Avoid modals" advice targets modal abuse,
  not our confirmation and editor patterns.
- **data-grid rows with hairline dividers are correct** for workspace tables.
- **Bordered panels on a grey canvas are the layout**, not "cards everywhere." A
  `workspace-panel` or ReUI frame is the container; what's banned is a shadowed card, a card
  inside a card, or a card grid standing in for a table.
- **Workspace repetition/consistency is intentional.** Anti-repetition and "take a bold
  risk" rules apply to landing/marketing only.
- **Signature chrome** is the charcoal rail, the continuous 48px header with centered search,
  and the grey canvas with 16px top corners. Respect the `--workspace-*` tokens; don't restyle
  ad hoc. The header notch and the canvas dot-grid are retired, not exemptions.
