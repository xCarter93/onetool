# Patterns

The catalog of page layouts, table and form specs, the status vocabulary, state rules, and
message surfaces. The charter's decision tables give the values; this file says how the pieces
compose. Ported from Datadog's DRUIDS guidelines with OneTool's numbers and exemptions.

## 1. Page patterns

Every workspace page is one of four. Name it in the brief. If none fits, re-examine the page;
you almost always want one of these.

| Pattern | Use when | Required pieces | Common mistakes |
| --- | --- | --- | --- |
| **List** | Many records of one type (clients, quotes, invoices, projects, tasks) | Page header (title, count, one primary action) · search + filters in one toolbar · `reui/data-grid` · selection tray · pagination or infinite scroll · both empty states | Cards instead of a grid past ~20 records; filters in a sidebar the page doesn't need; a second primary action |
| **Detail** | One record and everything attached to it | `sticky-detail-header` (breadcrumb, title, StatusBadge, ≤1 button + 1 secondary + kebab) · tabs for page state · stat row before any chart · `related-records-frame` (bordered `card` cards with `shadow-sm`, 8px gap) for children · side column in a `workspace-panel` box · `detail-drawer` for side edits · sections spaced 32px apart with plain headings | Hero banner; repeating the breadcrumb as the title; tabs that change location; a hairline under every section heading or a `Separator` between sections |
| **Dashboard** | Aggregates across records (home, reports) | Date range picker top-right · `highlight-metric-grid` stat row · charts from the `chart-*` tokens · every tile links to the list it summarizes | Widget shadows; tiles that don't drill down; a stat with no comparison period |
| **Form** | Create or configure one thing | Single column, max ~560px · sections with a heading + hairline · sticky footer (Cancel + primary) on long forms · validation on blur and submit | Two columns to save space; a modal for more than a handful of fields; a red Cancel |

Cross-cutting rules:

- **Page actions live in the page header; global actions live in the top bar.** Never swap.
- **Tabs are page state.** If switching the tab changes where you are, it is navigation and
  belongs in a breadcrumb or the sidebar.
- One primary button per view. The second most important action is a secondary button; the
  rest go in a kebab.
- Sticky elements offset from the 48px header; `.workspace-canvas` is the md+ scroller.
- Pages compose from the `workspace-*` classes in the charter's shell table: every page
  starts with `workspace-page` + `workspace-page-header`; a List adds `workspace-toolbar` and,
  only when it already has filters or summary metrics, `workspace-explorer` with a 240px rail;
  a Detail uses `workspace-detail` and `workspace-record-tabs`; a Dashboard uses
  `workspace-metrics*` and `workspace-panel`; a Form uses `workspace-panel` sections with
  `workspace-section-heading`.

## 2. Tables

`reui/data-grid` with a prebuilt TanStack table. Hairline row dividers are the house pattern.

- **Alignment** follows the charter's column table: text left, numbers and money right, never
  center. Header cells align with their column.
- **Density.** Default (`py-2` cells, 32px header, rows land around 36px) for lists the user
  reads. `dense: true` (`py-1.5`) for logs, run histories, and admin tables the user scans.
  Headers are 11px uppercase semibold on the `muted` fill. One density per page.
- **One status column** per table, always `StatusBadge`. A second status-like column (sync
  state, signature state) becomes text or an icon with a label.
- **Bold only the row's identifier** (client name, quote number). Everything else is regular
  weight; secondary metadata is `muted-foreground`.
- **Numbers** use `tabular-nums`; IDs and quote/invoice numbers use mono.
- **One timestamp format per table.** Relative ("2h ago") or absolute, not both.
- **Row actions** are a kebab in the last column, `size-7`, revealed on hover and focus.
- **Selection tray replaces the toolbar** while rows are selected: "3 selected · 247 total",
  bulk actions with the destructive one last, Esc clears. It never stacks under the toolbar.
- **No zebra striping, no tinted rows.** Emphasis is the badge in its cell.
- **States.** 5–8 skeleton rows on first load (`loadingMode: "skeleton"`), a thin progress bar
  on refresh with stale rows still visible, and the two empty states from §4.

## 3. Status vocabulary

Five roles, closed. `domain/StatusBadge` owns the map (`status-badge.tsx`). Mobile keeps its
own copy in `apps/mobile/lib/theme.ts` under the tone names `ok / info / warn / late / mute`
(same five roles, same order); when a key is added or moved on web, move it on mobile in the
same change. Known divergence to resolve: web maps `expired` to danger, mobile to mute.
A new status maps to an existing role; nobody adds a sixth.

| Role | Means | Current keys |
| --- | --- | --- |
| success | done, live, paid | active, completed, approved, paid |
| warning | waiting on someone, in flight | in-progress, pending, paused, paused_plan, signed |
| danger | stopped, late, refused | cancelled, overdue, declined, expired, revoked |
| info | scheduled, sent, not yet acted on | lead, planned, scheduled, sent, prospect, viewed |
| neutral | inert, historical | inactive, archived, draft, refunded |

Rules:

- **Shape:** `rounded-sm`, 11px, semibold, uppercase (Badge `radius="default"` plus the
  StatusBadge classes). Never `rounded-full` for a status.
- **Soft tint is the default appearance** and reads as the product language (charter
  exemption). Solid is reserved for a badge on a colored ground where the tint would vanish;
  solid success, info, and danger fills fail AA with white 11px text.
- **Color the value, not the label.** "Status: Overdue" colors "Overdue", never the word
  "Status". Never color a whole row or card.
- **One strong indicator per row.** If a row has a StatusBadge, nothing else in it carries a
  status color.
- **Rollups aggregate by severity:** danger > warning > info > success > neutral. A project
  with one overdue invoice rolls up as danger.
- **Number badges** are solid when the count is above zero and neutral at zero.
- Never color alone: the badge always carries its label text.

## 4. Empty, loading, error

Two empty states with opposite calls to action:

| State | Heading | CTA |
| --- | --- | --- |
| **True empty** ("nothing yet") | One line, sentence case, describes the situation: "No invoices yet" | Create the thing |
| **Filtered empty** ("nothing matched") | "No invoices match these filters" | "Clear filters", never create |

- Both use `domain/EmptyState` with the Illustration system; padding 32–48px; one primary CTA.
- Headings describe the situation, not the instruction. "No clients yet", not "Add your first
  client". No "Oops", no apology.
- **First load** is a skeleton shaped like the real layout. **Refresh** of data already on
  screen is a thin progress bar; the stale data stays visible. A spinner over populated data is
  a finding. Anything over ~300ms shows an indicator.
- **Errors** say what failed, why, and offer a retry. They render as an inline message above
  the affected content, not in place of it. A blocking error is never a toast (§6). Forms keep
  their values.
- Route-level `error.tsx` boundaries use the role tokens like everything else.

### Drawing a new empty-state illustration

Applies when adding a scene to `components/illustrations/registry.ts`. Adapted from Hairline's empty-state rules (`sources-map.md` §10).

- **Draw the absence, not a mood.** Pick the thing that holds or finds the records (a tray, a drawer, a magnifier over a blank sheet) and show it holding nothing. A record list may instead preview the records that will fill it, as `clients-none` does. Never a sad face, a shrug, or a question mark stamped on a box.
- **Empty is not blank.** The object is complete and composed. What's missing is what it would hold. A sparse or half-built scene reads as "still loading".
- **Judge the `sm` variant first.** `EmptyState` defaults to `sm` (56px wide) and most people never see more. If the object doesn't read there, redraw `sm` with fewer parts; never shrink `md`.
- **Lead the eye with the accent.** Put the accent on the part the eye should land on, not spread across the scene as decoration.
- **Bright silhouette, dim detail.** Prefer `illo-outline` for an object's outer edge and `illo-hair` for inner detail like rules and dividers. Faces are opaque and painted back to front, so no far edge shows through a near solid.
- **One idea per scene.** If you'd have to explain what the object is, pick a different object.

## 5. Forms

- Single column, max ~560px. Two columns only for fields that are one value split in two
  (city / state, first / last name).
- Labels above the field, `text-xs font-medium`, sentence case. Required fields get the
  asterisk; optional fields are not marked.
- Helper text is `text-xs text-muted-foreground` and only exists when it adds something the
  label doesn't say. The error message replaces the helper text in the same slot, so nothing
  jumps.
- Validate on blur and on submit. Nothing is red on first render.
- Sections are an uppercase 11px semibold `muted-foreground` label plus a hairline
  (`border-b`), never a card inside the form.
- Footer: Cancel then primary, right-aligned, sticky on long forms. Cancel is never red.
  Destructive actions live in their own section at the end, with a confirm dialog.
- Long forms get a page or a drawer. Base UI dialogs are fine for short focused edits
  (charter exemption); once a dialog needs scrolling, it should have been a drawer.
- Disabled means "you can't"; read-only means "this is what it is". Read-only fields keep
  full contrast.

## 6. Messaging surfaces

| Surface | Use for | Dismissal | Never for |
| --- | --- | --- | --- |
| **Toast** (`useToast()`) | Result of an async action: saved, sent, failed to send | Auto, 4–8s, plus a close button on every toast; `loading()` for slow flows. One summary toast per operation, never one per item | A blocking error; anything the user must read |
| **Inline message** | Persistent context on a page or above a table: sync failed, plan limit reached | Stays until resolved or dismissed | Success confirmation |
| **Dialog** | A short focused task or a confirmation | Explicit | Long forms; stacking on another dialog |
| **Tooltip** | A definition or a shortcut hint | Hover / focus out | Primary content; the only label of a control |
| **Confirm dialog** | Irreversible actions | Explicit | Reversible actions (use undo) |

Tone:

- Name the problem and the consequence: "Couldn't send the invoice. The client's email
  bounced." Not "Something went wrong".
- State what a destructive action does: "This deletes 4 line items. This can't be undone."
- Buttons start with the verb: "Delete quote", "Send invoice". Never "OK" or "Yes".
- Always offer the next step: retry, fix the field, contact support.
- Verb consistency across the flow: button "Send" → toast "Sent" → history "Sent by …".
