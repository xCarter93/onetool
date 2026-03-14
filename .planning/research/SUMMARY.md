# Project Research Summary

**Project:** CSV Import Wizard
**Domain:** Multi-step data import wizard with AI-assisted column mapping
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

The CSV Import Wizard is a full-page multi-step wizard that replaces the existing modal-based import flow in OneTool. The project requires no architectural reinvention — it extends existing infrastructure (Mastra AI agent, `bulkCreate` mutation, PapaParse, shadcn/ui) with a proper step-by-step UX pattern. The core pattern is a single `useImportWizard` hook that owns all state across four steps (Upload, Map, Review, Import), with each step as a pure props consumer. Three new dependencies are needed (`react-dropzone`, `@tanstack/react-virtual`, `fuse.js`) and two new backend functions (`clients.listNamesForOrg`, `clientContacts.bulkCreate`).

The recommended approach is to build in strict dependency order: wire the hook and layout first, add the Convex queries/mutations in parallel, then build each step sequentially since each step consumes the output of the previous one. The AI mapping differentiator (GPT-4o via Mastra) is already working — the wizard's value comes from surfacing it properly with manual override capability and honest confidence scores. An embedded variant for onboarding reuses the same wizard with a single `embedded` prop, making it a thin follow-on rather than a separate build.

The critical risks are all pre-existing bugs in the current codebase: the `analyze-csv` route sends full CSV content to GPT-4o (cost/timeout risk), the route has no auth check (abuse risk), `bulkCreate` bypasses plan limits (billing integrity risk), and `dynamicTyping: true` corrupts phone numbers. Every one of these must be fixed during wizard construction, not deferred. Duplicate detection must use fuzzy matching (fuse.js) from day one — exact-match "duplicate detection" will be reported as broken immediately by users migrating from other CRMs.

## Key Findings

### Recommended Stack

The stack is almost entirely composed of libraries already in the project. PapaParse handles client-side CSV parsing, Zod handles per-row validation, TanStack Table handles the preview table, and Mastra + GPT-4o handles AI column mapping. Three targeted additions fill the gaps: `react-dropzone` for accessible drag-and-drop upload, `@tanstack/react-virtual` for virtualized scrolling in the review table (required for 100+ row imports), and `fuse.js` for client-side fuzzy duplicate detection.

See `.planning/research/STACK.md` for full details.

**Core technologies:**
- `papaparse` 5.5.2: CSV parsing — already installed, parse client-side only (not in AI route)
- `react-dropzone` 15.0.0: Drag-and-drop upload zone — v15 supports React 19
- `@tanstack/react-virtual` 3.13.x: Virtualized review table — needed for large file imports
- `fuse.js` 7.1.0: Fuzzy duplicate detection — zero deps, configurable threshold
- `Mastra + GPT-4o`: AI column mapping via `/api/analyze-csv` — already built, needs fixes

### Expected Features

The feature set is well-defined with clear MVP boundaries. The existing modal must be fully replaced before any optional features ship. Onboarding embed and contact import are high-value fast-follows but must not block the MVP.

See `.planning/research/FEATURES.md` for full details.

**Must have (table stakes):**
- File upload with drag-and-drop — users expect this from modern import UIs
- AI column mapping with manual override — core differentiator, already built
- Data preview before import — show what will be imported before committing
- Per-row error reporting — "3 failed" with no context is unacceptable
- Template CSV download — reduces support burden for new users
- Progress indicator during import — feedback on long operations
- Import results summary — X succeeded, Y failed, Z skipped

**Should have (competitive):**
- Per-row duplicate detection with skip/merge choice — fuzzy matching, user-controlled resolution
- Embedded onboarding import — 40% of users take the "import my data" path
- Flat-column contact import — import contacts alongside client in one step
- PostHog analytics instrumentation — instrument wizard funnel throughout

**Defer (v2+):**
- Excel (.xlsx) import — CSV covers 95% of use cases
- Partial import (valid rows succeed, invalid skip) — all-or-nothing acceptable with good error reporting
- Real-time cell editing in review table — scope explosion

### Architecture Approach

All wizard state lives in a single `useImportWizard` hook; step components are pure props consumers. This directly addresses the existing modal's problem of 8 uncoordinated `useState` calls. The wizard renders inside a dedicated route (`/clients/import`) with an `embedded` prop for onboarding reuse. Two new Convex functions are required: a lightweight `clients.listNamesForOrg` query (returns only `{ _id, companyName }` for duplicate detection) and a `clientContacts.bulkCreate` mutation. The `clients.bulkCreate` mutation needs a plan-limit pre-check added.

See `.planning/research/ARCHITECTURE.md` for full component tree, data flow, and build order.

**Major components:**
1. `useImportWizard` hook — owns all wizard state, step navigation, guards
2. `ImportWizard` — orchestrator component rendering the active step
3. `StepUpload` — file drop zone, template download, BOM stripping, PapaParse parsing
4. `StepMapColumns` — AI suggestions display, manual override dropdowns, confidence scores
5. `StepReview` — virtualized table with fuse.js duplicate flags, per-row skip/import decision
6. `StepPreviewImport` — import execution, progress, per-row results display
7. `clients.listNamesForOrg` (Convex query) — lightweight org client list for duplicate detection
8. `clientContacts.bulkCreate` (Convex mutation) — batch contact creation after client import

### Critical Pitfalls

Ten pitfalls were identified, all verified against the actual codebase. Every critical one must be addressed during wizard construction.

See `.planning/research/PITFALLS.md` for full details with file locations and line numbers.

1. **Full CSV sent to GPT-4o** — send only headers + 5-10 sample rows; parse full file client-side with PapaParse
2. **No auth on `/api/analyze-csv`** — add Clerk auth check at route entry before any AI call
3. **`bulkCreate` bypasses plan limits** — add pre-check in review step and enforce in mutation
4. **`dynamicTyping: true` corrupts phone numbers** — set to `false` in `parse-csv-tool.ts`, treat all CSV values as strings
5. **Hard-coded confidence score (0.8)** — surface per-field confidence from actual AI response instead of overriding
6. **Per-row errors not surfaced** — frontend must read `error` strings from `bulkCreate` response array
7. **UTF-8 BOM corrupts first column header** — strip BOM before parsing: `content.replace(/^\uFEFF/, '')`
8. **Exact-match duplicate detection** — use fuse.js with normalized names from day one
9. **No `maxDuration` on analyze-csv route** — add `export const maxDuration = 30;` to prevent Vercel 504s
10. **Contact fields missing from all three layers** — schema fields, AI instructions, and mutation must all update together

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — Hook, Layout, and Backend
**Rationale:** The `useImportWizard` hook and Convex backend functions have no dependencies on each other and no dependencies on any step component. These can be built in parallel and must exist before any step can be wired up. This phase also includes the critical infrastructure fixes (auth, dynamicTyping, BOM, maxDuration, token truncation) that affect every subsequent step.
**Delivers:** Working wizard shell with navigation, all bug fixes in the existing AI route, and backend functions needed by later steps
**Addresses:** Template CSV download (in StepUpload), wizard navigation skeleton
**Avoids:** Pitfalls #2, #4, #5, #6, #7, #9, #10 (infrastructure fixes before any new step code)

### Phase 2: Upload and Mapping Steps (Steps 1 and 2)
**Rationale:** Upload must come before mapping because mapping consumes parsed headers. These two steps form a natural unit — file parsing flows directly into AI analysis. The existing `analyze-csv` route already works; this phase wires it into the new step UI with proper confidence display and manual override.
**Delivers:** Users can upload a CSV, get AI column suggestions, manually override any mapping, and see a live data preview
**Uses:** `react-dropzone`, PapaParse, Mastra/GPT-4o, `@tanstack/react-table`
**Implements:** `StepUpload`, `StepMapColumns`, `ColumnMappingRow`, `DataPreviewPanel`
**Avoids:** Pitfalls #1 (real confidence scores), #4 (truncated AI input)

### Phase 3: Review Step with Duplicate Detection (Step 3)
**Rationale:** Review depends on completed column mapping (to know which field is "company name") and the `clients.listNamesForOrg` query built in Phase 1. Duplicate detection must use fuzzy matching from launch — do not ship exact-match as a placeholder.
**Delivers:** Virtualized review table showing all rows with duplicate flags and per-row skip/import toggles; plan limit pre-check blocks over-limit imports before they reach the backend
**Uses:** `fuse.js`, `@tanstack/react-virtual`, `clients.listNamesForOrg` Convex query
**Implements:** `StepReview`, `DuplicateResolver`, `RowReviewTable`
**Avoids:** Pitfalls #3 (plan limit pre-check), #8 (fuzzy not exact matching)

### Phase 4: Import Execution and Results (Step 4)
**Rationale:** The final step depends on all review decisions being finalized. This phase also includes replacing the old modal and updating all entry points, since the new wizard must be the only import path before it can be considered "shipped."
**Delivers:** Import execution with per-row progress, per-row result display (success/fail/skipped), replacement of old `CsvImportSheet` modal, and updated navigation entry points
**Implements:** `StepPreviewImport`, `ImportResultsSummary`; deletes old modal components
**Avoids:** Pitfalls #2 (per-row error display), #3 (plan limit enforcement in mutation)

### Phase 5: Fast Follows — Onboarding Embed, Contact Import, Analytics
**Rationale:** These three features all require the full wizard to be working (Phase 4 complete). They are independent of each other and can ship in any order or in parallel. Onboarding embed is highest business value (conversion impact). Contact import requires coordinated changes to schema fields, AI instructions, and the `clientContacts.bulkCreate` mutation — must all ship together.
**Delivers:** Wizard embedded in onboarding flow; contact columns importable alongside client data; PostHog funnel instrumentation for all wizard steps
**Avoids:** Pitfall #9 (all three contact-import layers updated together)

### Phase Ordering Rationale

- Hook and backend functions are built first because every step depends on them — parallelizing hook + backend in Phase 1 removes the longest dependency chain
- Steps are built in sequential order (1 → 2 → 3 → 4) because each step's output is the next step's input; no step can be meaningfully tested standalone
- Infrastructure bug fixes are front-loaded into Phase 1 so they are never "deferred" — they affect every step and must not be discovered during step testing
- Old modal replacement is included in Phase 4 (not Phase 5) to avoid running two import paths simultaneously
- Contact import is deferred to Phase 5 because it requires coordinated multi-layer changes and must not slip as "close enough" if one layer is missed

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (Contact Import):** The `CLIENT_SCHEMA_FIELDS` definition, AI agent instructions, and `bulkCreate` mutation must all be updated atomically. The exact field names and mapping format need careful cross-referencing with the existing schema before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** All patterns are well-documented; the hook pattern and Convex query structure follow existing codebase conventions
- **Phase 2 (Upload/Mapping):** react-dropzone and PapaParse are mature, well-documented libraries with established usage patterns in the project
- **Phase 3 (Review):** fuse.js and TanStack Virtual have clear APIs; duplicate detection pattern is straightforward
- **Phase 4 (Import/Results):** Follows the existing `bulkCreate` mutation API; no new integrations

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries already in project or well-established; versions verified against React 19 compatibility |
| Features | HIGH | Competitor analysis done; MVP scope is clear with explicit anti-features documented |
| Architecture | HIGH | Verified against actual codebase structure; component boundaries and data flow are unambiguous |
| Pitfalls | HIGH | All 10 pitfalls verified against specific files and line numbers in the actual codebase |

**Overall confidence:** HIGH

### Gaps to Address

- **Fuse.js threshold tuning:** The right similarity threshold for company name matching (0.3? 0.4?) can only be validated with real user data. Start with 0.3 and expose as a configurable constant for easy adjustment.
- **Batch size for `bulkCreate`:** Research recommends chunks of 50 for Convex mutation limits. This should be validated against Convex documentation before implementation; the limit may have changed.
- **AI confidence score format:** The actual shape of Mastra's per-field confidence output needs to be inspected at implementation time — the current route discards it entirely, so the exact field path is unknown.

## Sources

### Primary (HIGH confidence)
- Actual codebase files — all pitfalls verified against specific file paths and line numbers
- `apps/web/src/app/(workspace)/clients/components/csv-import-sheet.tsx` — existing import modal
- `apps/web/src/app/api/analyze-csv/route.ts` — existing AI analysis route
- `packages/backend/convex/clients.ts` — existing `bulkCreate` mutation
- `apps/web/src/mastra/tools/parse-csv-tool.ts` — PapaParse configuration

### Secondary (MEDIUM confidence)
- Competitor feature audit (Jobber, Housecall Pro, HubSpot) — feature table in FEATURES.md
- react-dropzone v15 React 19 compatibility — release notes
- fuse.js 7.1.0 API documentation — fuzzy matching configuration

### Tertiary (LOW confidence)
- "40% onboarding import conversion" statistic — industry benchmark, not OneTool-specific data; treat as directional signal

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
