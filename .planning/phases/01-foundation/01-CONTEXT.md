# Phase 1: Foundation - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Working wizard shell with all infrastructure in place — state hook, step navigation, backend queries/mutations, and every pre-existing bug fixed before any step UI is built. The `/clients/import` route renders a multi-step wizard that advances/retreats between steps.

</domain>

<decisions>
## Implementation Decisions

### Starting point
- Cherry-pick only the import-related files from the `client-import-page` branch onto staging — NOT a full branch merge
- The branch has many unrelated changes (landing page, community page, sidebar). Only bring over: `apps/web/src/app/(workspace)/clients/import/` directory, `apps/web/src/app/(workspace)/clients/import/utils/transform-csv.ts`, and the `StyledStepBreadcrumbs` component if not already on staging
- Keep the old `csv-import-sheet.tsx` modal on staging — it stays until Phase 4 when the new wizard officially replaces it

### State hook restructure
- Extract wizard state from `ImportWizard` component into a dedicated `useImportWizard` hook before fixing bugs
- Hook manages: step navigation (URL-synced via `?step=`), file/analysis/mapping/import state, and action handlers (handleFileSelect, handleMappingChange, handleImport)
- Hook does NOT manage: validation/canContinue logic, footer button configuration — those stay in the component
- Keep the existing step structure: upload → map → review → preview (4 steps, same names)

### Bug fixes (in place after restructure)
- UPLD-02: Strip UTF-8 BOM before parsing CSV content
- UPLD-03: Set `dynamicTyping: false` in PapaParse config (currently `true` in `transform-csv.ts`)
- MAP-04: Send only headers + sample rows to AI route, not full CSV content
- MAP-05: Add Clerk auth check to `analyze-csv/route.ts` + set `maxDuration` to prevent Vercel timeouts

### Backend functions
- Add `clients.listNamesForOrg` Convex query — returns just `{_id, companyName}` for the org (used later for duplicate detection in Phase 3)
- `clientContacts.bulkCreate` already exists — verify it's callable and meets Phase 5 needs

### Old modal
- Do NOT delete `csv-import-sheet.tsx` or related old modal components in this phase
- Phase 4 success criteria explicitly handles removal of old import entry point

### Claude's Discretion
- Exact file cherry-pick list from the branch (may need supporting components like CsvUploadZone, CsvSchemaGuide)
- BOM stripping implementation approach
- Auth middleware pattern for the API route (Clerk's `auth()` or middleware-level)
- `maxDuration` value for the analyze-csv route
- How many sample rows to send to AI (3-5 is typical)

</decisions>

<specifics>
## Specific Ideas

- User explicitly wants to avoid building from scratch — use the existing branch scaffolding as the foundation
- The `useImportWizard` hook should be a clean separation but not over-engineered — it owns state and handlers, component owns rendering and validation display

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets (from `client-import-page` branch)
- `ImportWizard` component: Full 4-step wizard with URL-synced navigation, step guards, footer buttons
- `ImportStepNav`: Uses `StyledStepBreadcrumbs` for step progress display
- `StepUpload`, `StepMapColumns`, `StepReviewValues`, `StepPreviewImport`: Step UI components
- `transform-csv.ts`: `parseCsvData()` and `buildImportRecords()` utilities
- `StickyFormFooter`: Shared component for wizard footer actions
- `useFeatureAccess`: Premium gating hook (already used in branch page.tsx)

### Reusable Assets (on staging)
- `csv-import-sheet.tsx`: Old modal — keep as-is, reference for patterns
- `csv-import.ts` types: `CsvImportState`, `FieldMapping`, `CsvAnalysisResult`, `CLIENT_SCHEMA_FIELDS`
- `analyze-csv/route.ts`: API route — needs auth + headers-only + maxDuration fixes
- `csv-import-agent.ts`: Mastra AI agent — no changes needed in Phase 1
- `clients.bulkCreate`: Existing mutation
- `clientContacts.bulkCreate`: Existing mutation

### Established Patterns
- URL-synced step navigation via `useSearchParams` and `router.replace`
- Step guard: redirects to upload if `analysisResult` is null on later steps
- `StickyFormFooter` pattern for multi-step form actions
- Convex `useQuery`/`useMutation` for backend integration
- Clerk auth via `auth()` helper in API routes

### Integration Points
- `/clients/import` route — new full-page wizard
- `/api/analyze-csv` route — AI analysis endpoint (needs fixes)
- `packages/backend/convex/clients.ts` — add `listNamesForOrg` query
- `packages/backend/convex/clientContacts.ts` — verify `bulkCreate` mutation

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-14*
