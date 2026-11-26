# Mobbin research — pulling real-world reference UI

How to use the Mobbin MCP (`mcp__mobbin__search_screens` / `search_flows` / `search_sections`)
as the reference layer before designing new UI. The tools return inline images — actually look
at them; never judge a result from its metadata alone.

## When to research (and when not to)

- **Do** research before designing a new surface, a pattern OneTool hasn't built before
  (e.g. a scheduling board, a bulk-edit toolbar), or a redesign where the current UI
  underperforms. 2–3 searches is the sweet spot; this is calibration, not a mood board.
- **Skip** it for small tweaks inside an established OneTool pattern — the charter and the
  existing screens are the reference there.
- References inform structure and interaction patterns. Tokens, components, and voice still
  come from the charter — never copy a reference's palette or typeface.

## Which tool

| Tool | Use for | Notes |
| --- | --- | --- |
| `search_screens` | A single screen/view (dashboard, detail page, settings form, invoice view) | `platform` required: `web` for workspace/portal/landing, `ios` for mobile. `limit` ≤ ~8 to keep context sane; `mode: "deep"` (default) for nuanced queries. |
| `search_flows` | Multi-step journeys (onboarding, checkout/payment, record creation wizards) | Default `limit: 5` is right. Good for portal payment and onboarding work. |
| `search_sections` | Marketing/landing page sections (pricing, hero, FAQ, footer) | No platform param. Landing work only. |

## Writing queries that work

- Describe **one** screen/flow/section in plain language, naming the elements and their
  relationships: "invoice detail page with line items table, payment status, and pay button" —
  not "modern clean invoice ui".
- Never combine intents ("dashboard and settings"), use negations ("without ads"), or vague
  style words ("modern", "clean", "beautiful") — search each screen separately.
- Name a specific product to filter to it: "Stripe dashboard payments list", "Notion sidebar
  navigation". For OneTool workspace work, Stripe/Notion/Linear queries are the house-aligned
  starting points; for field-service domain patterns try Jobber, Housecall Pro, ServiceTitan.
- Put platform in the parameter, never the query text.

## Using the results

1. Examine the returned images; discard mismatches without comment.
2. Pick 2–3 references and note *specifically* what each earns its place for (layout skeleton,
   empty-state treatment, density rhythm, a control pattern) — one line each.
3. Cite each referenced screen as a markdown link to its `mobbin_url` in your design brief so
   Patrick can open it.
4. Translate, don't transplant: re-express the borrowed structure in OneTool tokens and the
   component acquisition ladder (see `ONETOOL-DESIGN.md`).

## Example (workspace feature)

Designing a "team schedule" view →
`search_screens(query: "team schedule calendar with technician rows and job blocks", platform: "web")`,
then `search_screens(query: "Jobber schedule dispatch view", platform: "web")`. Compare
against the existing home calendar (ReUI event-calendar-2) before inventing a new grammar.
