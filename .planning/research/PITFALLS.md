# Pitfalls Research: CSV Import Wizard

**Research Date:** 2026-03-14
**Confidence:** HIGH — All pitfalls verified against actual codebase

## Critical Pitfalls

### 1. Hard-coded confidence score hides real AI uncertainty
- **Location:** `apps/web/src/app/api/analyze-csv/route.ts` line 115
- **Issue:** Writes `confidence: 0.8` for every analysis response regardless of actual per-field confidence from Mastra agent
- **Warning signs:** Users trust bad mappings because confidence looks high
- **Prevention:** Surface per-field confidence from AI response, don't override with static value
- **Phase:** Mapping step (Step 2)

### 2. Batch import silently fails with no per-row breakdown
- **Location:** `apps/web/src/app/(workspace)/clients/components/csv-import-sheet.tsx`
- **Issue:** Treats `bulkCreate` as pass/fail. Backend returns `{ success, error }` per row but frontend never reads error strings — just counts by array index
- **Warning signs:** User sees "3 failed" with no explanation
- **Prevention:** Display per-row errors in results step with row number + field + reason
- **Phase:** Import step (Step 4)

### 3. Plan limits NOT checked in `bulkCreate`
- **Location:** `packages/backend/convex/clients.ts` — `bulkCreate` mutation
- **Issue:** Single `clients.create` checks free-tier limit (10 clients). `bulkCreate` calls `createClientWithOrg()` directly, bypassing limits entirely
- **Warning signs:** Free-tier users import unlimited clients
- **Prevention:** Pre-check remaining capacity before import, enforce in mutation
- **Phase:** Review step (pre-check) + Import step (enforce)

### 4. Full CSV content sent to GPT-4o
- **Location:** `/api/analyze-csv` route
- **Issue:** Entire raw CSV string appended to agent prompt. A 500-row file generates enormous token costs and may exceed context window
- **Warning signs:** Slow analysis, high OpenAI bills, timeouts on large files
- **Prevention:** Send only headers + first 5-10 sample rows to AI. Parse full file client-side with PapaParse
- **Phase:** Upload step (Step 1)

### 5. No `maxDuration` on analyze-csv route
- **Location:** `apps/web/src/app/api/analyze-csv/route.ts`
- **Issue:** Mastra multi-step agent call takes 15-25 seconds. Vercel default timeout (10-15s) causes frequent failures
- **Warning signs:** "504 Gateway Timeout" on production
- **Prevention:** Add `export const maxDuration = 30;` to route file
- **Phase:** Upload step (Step 1)

### 6. `dynamicTyping: true` corrupts phone numbers
- **Location:** `apps/web/src/mastra/tools/parse-csv-tool.ts`
- **Issue:** PapaParse `dynamicTyping: true` converts `0412345678` to integer `412345678`, destroying leading zeros. Field-service businesses always have phone numbers
- **Warning signs:** Phone numbers missing leading zeros after import
- **Prevention:** Set `dynamicTyping: false`, treat all CSV values as strings, let schema validation handle type coercion
- **Phase:** Upload step (Step 1)

### 7. UTF-8 BOM from Excel corrupts first column header
- **Issue:** Excel exports UTF-8 CSVs with BOM prefix (`\uFEFF`). First header becomes `\uFEFFCompany Name`, silently failing exact-match mapping on the most common required field
- **Warning signs:** First column never auto-maps despite obvious name match
- **Prevention:** Strip BOM before parsing: `content.replace(/^\uFEFF/, '')`
- **Phase:** Upload step (Step 1)

### 8. Duplicate detection needs fuzzy matching from day one
- **Issue:** Exact string matching misses "ACME Inc." vs "Acme Inc" vs "Acme Incorporated" — all common variations from years of inconsistent CRM data
- **Warning signs:** Users report duplicates created despite "duplicate detection"
- **Prevention:** Use fuse.js with normalized company names (lowercase, strip suffixes like Inc/LLC/Ltd)
- **Phase:** Review step (Step 3)

### 9. Flat contact columns silently dropped without backend changes
- **Issue:** `CLIENT_SCHEMA_FIELDS` doesn't include contact fields. AI agent instructions don't mention them. `bulkCreate` mutation doesn't accept them. All three layers must update
- **Warning signs:** Contact columns appear in CSV but disappear after import
- **Prevention:** Update schema fields, AI instructions, and mutation in the same phase
- **Phase:** Must be coordinated across mapping + import steps

### 10. Auth missing on `/api/analyze-csv`
- **Location:** `apps/web/src/app/api/analyze-csv/route.ts`
- **Issue:** Route calls GPT-4o with no authentication check. Any unauthenticated caller can trigger expensive AI processing
- **Warning signs:** Unexpected OpenAI costs, abuse
- **Prevention:** Add Clerk auth check at route entry: `const { userId } = auth(); if (!userId) return new Response("Unauthorized", { status: 401 });`
- **Phase:** Upload step (Step 1)

## Pitfall Priority by Phase

| Phase | Pitfalls to Address |
|-------|-------------------|
| Step 1 (Upload) | #4 (limit AI input), #5 (maxDuration), #6 (dynamicTyping), #7 (BOM), #10 (auth) |
| Step 2 (Mapping) | #1 (real confidence scores), #9 (contact field definitions) |
| Step 3 (Review) | #3 (plan limit pre-check), #8 (fuzzy duplicate matching) |
| Step 4 (Import) | #2 (per-row errors), #3 (plan limit enforce), #9 (contact creation) |
