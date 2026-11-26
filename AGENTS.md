# AGENTS.md

## Project overview

OneTool is a business management platform for small field-service businesses (cleaning, landscaping, HVAC, trades). Manages clients, projects, quotes, invoices, tasks, email, e-signatures, payments, and analytics.

**Tech stack:** Next.js 16 / React 19, Tailwind CSS 4, ReUI design system (vendored base-nova primitives over **Base UI**; Radix is retired and lint-blocked), Convex (real-time backend), Clerk (auth), Stripe Connect (payments), Resend (email), BoldSign (e-signatures), React Native + Expo (mobile), @convex-dev/agent (AI assistant), pnpm + Turborepo.

## Critical architecture

### Multi-tenant data isolation

All business data is scoped to `orgId`. This is a **security boundary**: every query and mutation filters by organization.

### Authentication pattern

Build Convex functions with the custom builders in `packages/backend/convex/lib/factories.ts`:

```typescript
import { userMutation, userQuery, optionalUserQuery } from "./lib/factories";

export const update = userMutation({
	args: { ... },
	handler: async (ctx, args) => {
		// ctx is pre-authenticated and org-scoped: ctx.user, ctx.orgId, plus
		// ctx.orgEntity(table, id)          org-checked get-or-throw
		// ctx.can / ctx.requireLevel        RBAC permission-level checks
		// ctx.gateRead / ctx.applyReadScope / ctx.scopedToActor   read scoping
	},
});
```

- `userQuery`/`userMutation`: authenticated user with an active org required. `optionalUserQuery`: yields `{ user: null, orgId: null }` instead of throwing, so guard before use. `systemMutation`: internal, takes an explicit `orgId` arg (webhooks/crons/automations).
- Raw `query(` from `_generated/server` is reserved for deliberately public endpoints (portal, community pages, telemetry). Import `mutation`/`internalMutation` from `lib/triggers.ts` (drop-in replacements that route writes through the trigger registry). `builderEnforcement.test.ts` fails the suite otherwise.

**Routing rules:** Admins land on `/home`, members on `/projects`. Members cannot access `/home`. Users without an org redirect to `/organization/complete`.

### Accessing Convex from the frontend

```typescript
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";

const clients = useQuery(api.clients.list);
const createClient = useMutation(api.clients.create);
```

### Key constraints

- **Payment validation**: Payment amounts must sum exactly to invoice total. Strict validation, no tolerance.
- **Monetary unit**: All money is stored as **dollars** (numeric, may be fractional); cents exist only at the Stripe API boundary. Canonical modules: backend math in `packages/backend/convex/lib/money.ts` (roundCents, sumMoney, computeQuoteTotals/computeInvoiceTotals, dollarsToCents); web display in `apps/web/src/lib/money.ts` `formatCurrency` (portal components import `formatMoney` from `lib/portal/format`); mobile in `apps/mobile/lib/format.ts`. Use these formatters everywhere; ESLint blocks local currency formatters and `/100` on a stored amount in web and mobile. Stored quote/invoice `subtotal`/`total` stay in sync with line items via `syncQuoteTotals`/`syncInvoiceTotals` (called from every line-item mutation); record-level amounts display exact cents, stats/charts may use `{ whole }`/`{ compact }`.
- **Triggers maintain derived state**: the registry in `lib/triggers.ts` wraps `ctx.db` in every mutation builder and keeps the `@convex-dev/aggregate` tables (dashboard stats) and the `searchText` search digests (`lib/searchText.ts`, global ⌘K search) correct on every write. Deliberate exceptions, leave them as they are: quote/invoice line-item tables are untriggered (`syncQuoteTotals`/`syncInvoiceTotals` run manually at bulk boundaries; O(n²) cascade risk) and `emitStatusChangeEvent` is always called manually. In tests, create records via the public API so triggers fire. Raw `t.run` inserts leave aggregates uninitialized and rows without `searchText` (convex-test's search emulation throws on such rows).
- **Event bus**: Entity status changes emit events via `emitStatusChangeEvent()` in `eventBus.ts`, which trigger workflow automations. Cascading automations have recursion depth limits.
- **Sequential numbering**: Quote and invoice numbers come from the per-org `orgCounters` row via `nextQuoteNumber`/`nextInvoiceNumber` in `lib/orgCounters.ts`; a manually typed number goes through `reserveQuoteNumber`/`reserveInvoiceNumber` so the counter moves past it.
- **Plan limits**: Free plan is metered, not capped: 20 client sends/month (+10 bonus in months with a Stripe collection), 5 e-signatures/month, 10 assistant messages/UTC-day, 5 saved reports, 2,000 CSV import rows lifetime; clients and projects are unlimited. Seats: 5 free / 20 business, Clerk-enforced. Business-only switches: automations, routing, QuickBooks, AI report generation, portal badge removal. Enforced via `lib/entitlements.ts` (`isFeatureAllowed`/`requireMeter`); advertised rows come from `lib/planMatrix.ts` (`PLAN_MATRIX`), and every pricing surface renders from it.
- **Assistant access**: users may use the AI assistant if they are EITHER on the paid plan OR have the manual metadata override flag (`org.clerkPlanSlug` / metadata flags, see `lib/permissions.ts`).

## Testing

Run tests after major backend changes. Framework: Vitest + convex-test, edge-runtime environment. Tests live in `packages/backend/convex/**/*.test.ts`. Read existing tests and `test.helpers.ts` for setup patterns.

## Standing rules

- **Patrick opens every PR.** Commit when asked. Leave pushing new branches and opening or merging PRs to him.
- **Git conservatism.** Create branches, stash, reset, or `git checkout <file>` only when asked. Before any branch switch or merge with uncommitted work, state what is uncommitted and confirm the plan.
- **External dashboards belong to Patrick.** For anything that needs the Clerk, Stripe, Vercel, Convex or Apple dashboards, a CLI login, or a secret: stop and give him the exact steps or commands.
- **Patrick handles visual verification.** Wire the real thing and let him screenshot-test it; skip browser automation and throwaway preview routes. Exception: performance measurement through the Chrome DevTools MCP (traces, emulation, console/network reads, heap snapshots).
- **Performance work starts with the `performance` skill.** It picks the browser, React or Convex lane.
- **Regression-proof your fixes.** When a bug report says a previous fix didn't hold, reproduce it or add a regression test first, and say what pixel or behavior changed so the fix is checkable.
- **Build before commit.** Run `pnpm build` from the repo root before committing non-trivial changes. Typecheck and tests are not a substitute.
- **Terse code comments.** One short line for a non-obvious constraint, gotcha, or the reason behind a decision. If a comment explains what the code does, rename or restructure the code instead.
- **Minimum code that solves the stated problem.** Add an abstraction, option or error path when its second concrete use arrives.
- **Docs before memory.** For an unfamiliar or fast-moving API, read the official docs first (`convex-docs`, `stripe-docs`, the stack skills), and check whether the logic already exists in the codebase.
- **Confirm features from the source.** Before calling a product feature unconfirmed, grep `packages/help-content` and `PLAN_MATRIX`.
- **Help content freshness.** When a change alters user-visible behavior on a surface documented in `packages/help-content` (route → article map: `apps/web/src/lib/help/route-help.ts`; category → source map: `.agents/skills/help-audit/references/sources.md`), update the matching help article in the same change, or record the gap in `.planning/help-center-fact-gaps.md` if you can't verify the new copy. New workspace pages need a `route-help.ts` entry. Run `help-audit` after large feature work.
- **Human-facing prose goes through `unslop`**: docs, help articles, UI and marketing copy, emails, commit and PR text. Subagent hand-backs are exempt.

## Workflow

- **Plan gate.** Before the first edit of any change that touches more than one file, a schema, auth, payments, or a dependency install or upgrade, run the `plan-gate` skill and wait for Patrick's approval.
- **Delegate early.** Hand an investigation expected to take more than 8 tool calls, any poll loop (image generation, CI, deploys), and any set of independent prototypes to subagents before the first read. Check the file and line behind every subagent claim you act on.
- **Cross-model review.** The reviewer is the other provider's flagship at high reasoning effort: GPT Sol when you are Claude, Claude Fable when you are Sol. `sol-loop` reviews a risky diff before commit. `council` settles an architecture decision; its members are Claude Fable and GPT Sol.
- **Close-out.** `ship` builds, reviews and commits. `pr-triage` validates review-bot findings. `babysit-pr` watches a PR through CI and review bots. Two overrides to it here: treat CodeRabbit as a reviewer to wait for, and report findings to Patrick, pushing fixes only when he asks.

## Shell and editing

- Quote globs: `--include='*.tsx'`. zsh aborts on an unquoted glob with no match.
- Change tracked files with the edit tool so hooks see the change; keep `sed -i` and heredoc rewrites for generated files.
- Run eslint from `apps/web`; the repo root has no config.

## Mobile

For work under `apps/mobile`, load `expo-overview` first; it routes to the other `expo-*` and `eas-*` skills. `clerk-expo` covers auth, `vercel-react-native-skills` and `react-native-best-practices` cover React Native patterns and performance. Mobile mirrors the web component conventions in `frontend-skill`.

## Design

All UI/UX work routes through the project design skills: **`design-new`** (any UI that doesn't exist yet: pages, screens, components, sections), **`design-improve`** (restyle, polish or de-slop existing UI), **`design-review`** (review only, P0–P3 findings and Block/Approve). Invoke the matching skill before writing or changing any JSX.

The design law is `.agents/design-sources/ONETOOL-DESIGN.md` (charter): surface-mode dials, token rules, component ladder, motion constants, quality floor, and **House exemptions** that override generic design advice (StatusBadge tinted colors, data-grid hairline rows, Base UI modals, and workspace repetition are features to keep). Sibling modules: `motion.md`, `anti-slop.md`, `review-checklist.md`, `research-mobbin.md`, `sources-map.md` (routing and trust notes for every underlying source).

The design skills load the underlying sources with the correct scoping, so reach them only through those skills: the frontend-design and impeccable plugins, the vendored emil, taste and ui-ux-pro-max sources, and the Mobbin MCP. Two hard trust rules from `sources-map.md`: `/impeccable init` stays unrun (it writes a competing design doc next to the charter), and ui-ux-pro-max is used only through `search.py` domain/stack CSV lookups (its `--design-system`/`--persist` recommender must not write into the repo).

### Users and brand

Users are small field-service business owners (cleaning, landscaping, HVAC, trades): on the go, coming from spreadsheets, wanting to look professional fast. Workspace UI is calm, Stripe-Dashboard/Notion-inspired, content over chrome. Landing may go bolder, and that stays out of the workspace. Brand voice, principles and anti-references live in the charter.

### Web component system

```
src/components/ui/      ← vendored ReUI base-nova primitives (owned source, Base UI under the
                           hood; hand-edits allowed but branding belongs in tokens or domain/)
src/components/reui/    ← CLI-installed ReUI components (data-grid, frame, badge, …)
src/components/domain/  ← OneTool wrappers: StatusBadge (canonical status→color map),
                           EmptyState, SegmentedControl. Use these for statuses.
src/components/shared/  ← real app components (GlassCard, PillTabs, MultiSelector,
                           SortableList, TagsInput, DatePicker consumers, …)
```

- There is **no Styled\* layer**. Import base primitives (`ui/button`, `ui/badge`, …) or `domain/` wrappers directly. ESLint blocks `@radix-ui/*`, `react-aria-components`, `tailwind-variants`, `@intentui/*`, and `ui/styled` imports.
- Tables and lists use `components/reui/data-grid` (pass a prebuilt TanStack `table`); single-date fields use `ui/date-picker`; toasts go through `useToast()` (sonner-backed, colored variants, `loading()` for slow flows); area charts use the `ChartStripeDefs` diagonal-stripe fill from `components/charts/`.
- **Adding a component:** check vendored `ui/` first → ReUI registry (`pnpm dlx shadcn@latest add @reui/<name>`) → vendor from ReUI GitHub → else build in `domain/` on existing primitives.

### Accessibility

WCAG 2.1 AA. Contrast in both themes, keyboard nav, `prefers-reduced-motion`, screen reader compatible (Base UI foundations).

## Agent skills

Skills live in `.agents/skills/`. The ones written for this repo are tracked in git. Third-party ones are pinned in `skills-lock.json` and gitignored: restore them in a fresh checkout or worktree with `npx skills experimental_install`, and add or update them with `npx skills add <repo> -s <name>` and `npx skills update`. A new repo-owned skill needs its two allowlist lines in `.gitignore`.

### Issue tracker

Issues are GitHub Issues on `xCarter93/nextjs-onetool` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when first needed. See `docs/agents/domain.md`.
