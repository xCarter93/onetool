# Phase 1: Foundation - Research

**Researched:** 2026-03-14
**Domain:** Multi-step wizard infrastructure, CSV parsing, Next.js API route security, Convex backend queries
**Confidence:** HIGH

## Summary

Phase 1 establishes the import wizard shell by cherry-picking files from the `client-import-page` branch onto staging, extracting state into a dedicated hook, fixing four pre-existing bugs (BOM stripping, dynamicTyping, headers-only AI calls, auth on API route), and adding two backend functions. The existing branch code provides a complete 4-step wizard with URL-synced navigation, step guards, and footer actions -- the main work is restructuring it into a hook-based architecture and fixing the identified bugs.

All required libraries (PapaParse 5.5.3, Clerk 6.34.1, Next.js 16.0.10) are already installed. No new dependencies are needed. The bugs are straightforward to fix with well-documented approaches. The `StyledStepBreadcrumbs` component must be cherry-picked alongside the import files since it does not exist on staging.

**Primary recommendation:** Cherry-pick import files + StyledStepBreadcrumbs, extract `useImportWizard` hook, fix bugs in-place, add backend functions, verify with existing test infrastructure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Cherry-pick only the import-related files from the `client-import-page` branch onto staging -- NOT a full branch merge
- The branch has many unrelated changes (landing page, community page, sidebar). Only bring over: `apps/web/src/app/(workspace)/clients/import/` directory, `apps/web/src/app/(workspace)/clients/import/utils/transform-csv.ts`, and the `StyledStepBreadcrumbs` component if not already on staging
- Keep the old `csv-import-sheet.tsx` modal on staging -- it stays until Phase 4 when the new wizard officially replaces it
- Extract wizard state from `ImportWizard` component into a dedicated `useImportWizard` hook before fixing bugs
- Hook manages: step navigation (URL-synced via `?step=`), file/analysis/mapping/import state, and action handlers (handleFileSelect, handleMappingChange, handleImport)
- Hook does NOT manage: validation/canContinue logic, footer button configuration -- those stay in the component
- Keep the existing step structure: upload -> map -> review -> preview (4 steps, same names)
- UPLD-02: Strip UTF-8 BOM before parsing CSV content
- UPLD-03: Set `dynamicTyping: false` in PapaParse config (currently `true` in `transform-csv.ts`)
- MAP-04: Send only headers + sample rows to AI route, not full CSV content
- MAP-05: Add Clerk auth check to `analyze-csv/route.ts` + set `maxDuration` to prevent Vercel timeouts
- Add `clients.listNamesForOrg` Convex query -- returns just `{_id, companyName}` for the org
- `clientContacts.bulkCreate` already exists -- verify it's callable and meets Phase 5 needs
- Do NOT delete `csv-import-sheet.tsx` or related old modal components in this phase

### Claude's Discretion
- Exact file cherry-pick list from the branch (may need supporting components like CsvUploadZone, CsvSchemaGuide)
- BOM stripping implementation approach
- Auth middleware pattern for the API route (Clerk's `auth()` or middleware-level)
- `maxDuration` value for the analyze-csv route
- How many sample rows to send to AI (3-5 is typical)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPLD-02 | System strips UTF-8 BOM before parsing to prevent header corruption | BOM stripping pattern documented below -- strip `\uFEFF` from start of string before PapaParse |
| UPLD-03 | System parses all CSV values as strings (no dynamicTyping) to preserve phone numbers | PapaParse `dynamicTyping: false` -- single line change in `transform-csv.ts` |
| MAP-04 | System sends only headers + sample rows to AI (not full CSV content) | Extract headers + first 3-5 rows from parsed CSV, send subset to API route |
| MAP-05 | AI analysis route requires authentication and has maxDuration configured | Clerk `auth()` pattern documented; `export const maxDuration = 60` for route handler |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.0.10 | App framework, route handlers | Project framework |
| papaparse | ^5.5.3 | CSV parsing | Already used in `transform-csv.ts` |
| @clerk/nextjs | ^6.34.1 | Authentication in API routes | Project auth provider |
| convex | (workspace) | Backend functions | Project backend |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @onetool/backend | workspace | Convex API imports | All backend function calls |
| next/navigation | built-in | URL-synced step navigation | `useSearchParams`, `useRouter` |

### Alternatives Considered
None -- all libraries are already in the project. No new dependencies needed for Phase 1.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/src/app/(workspace)/clients/import/
  page.tsx                           # Route entry (premium gate, Suspense)
  components/
    import-wizard.tsx                # Wizard shell (renders steps, footer, validation)
    import-step-nav.tsx              # Step breadcrumbs (uses StyledStepBreadcrumbs)
    step-upload.tsx                  # Step 1 UI
    step-map-columns.tsx             # Step 2 UI
    step-review-values.tsx           # Step 3 UI
    step-preview-import.tsx          # Step 4 UI
    column-mapping-row.tsx           # Sub-component
    data-preview-panel.tsx           # Sub-component
  hooks/
    use-import-wizard.ts             # NEW: Extracted wizard state + handlers
  utils/
    transform-csv.ts                 # CSV parsing + record building
```

### Pattern 1: useImportWizard Hook Extraction
**What:** Extract all wizard state and action handlers from `ImportWizard` into a custom hook.
**When to use:** This is the core refactor of Phase 1.

The hook owns:
- `state: CsvImportState` (file, fileContent, entityType, isAnalyzing, analysisResult, mappings, isImporting, importResult)
- `currentStep: ImportStep` (derived from URL search params)
- `navigateTo(step)`, `goNext()`, `goBack()`, `startOver()`
- `handleFileSelect(file, content)`, `handleMappingChange(csvColumn, newSchemaField)`, `handleImportData()`
- `selectedMappingColumn` and `setSelectedMappingColumn`

The component retains:
- `canContinue` (computed from state + step, references `CLIENT_SCHEMA_FIELDS`)
- `footerButtons` (computed from state + step + canContinue)
- `renderStep()` (JSX rendering)

**Example signature:**
```typescript
export function useImportWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const bulkCreateClients = useMutation(api.clients.bulkCreate);

  const rawStep = searchParams.get("step");
  const currentStep: ImportStep = isValidStep(rawStep) ? rawStep : "upload";

  const [state, setState] = useState<CsvImportState>({...});
  const [selectedMappingColumn, setSelectedMappingColumn] = useState<string | null>(null);

  // ... navigation + handlers ...

  return {
    state,
    currentStep,
    selectedMappingColumn,
    setSelectedMappingColumn,
    navigateTo,
    goNext,
    goBack,
    startOver,
    handleFileSelect,
    handleMappingChange,
    handleImportData,
  };
}
```

### Pattern 2: Clerk Auth in API Route Handlers
**What:** Use `auth()` from `@clerk/nextjs/server` to protect API routes.
**When to use:** The `analyze-csv/route.ts` fix (MAP-05).

This is the established pattern in the project -- all 6 existing API routes use this exact approach.

**Example:**
```typescript
// Source: apps/web/src/app/api/stripe-connect/account/route.ts (existing pattern)
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 60; // seconds -- prevents Vercel timeout

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... rest of handler
}
```

### Pattern 3: Convex Org-Scoped Query
**What:** Query scoped to organization with minimal field return.
**When to use:** The `clients.listNamesForOrg` function.

**Example:**
```typescript
// Source: backend-skill pattern + existing clients.ts patterns
export const listNamesForOrg = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    const orgId = await getCurrentUserOrgId(ctx);

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    return clients.map((c) => ({
      _id: c._id,
      companyName: c.companyName,
    }));
  },
});
```

### Anti-Patterns to Avoid
- **Sending full CSV content to AI route:** The current code sends entire `csvContent` in the prompt string. This wastes tokens and risks hitting payload limits. Send only headers + 3-5 sample rows.
- **Mixing hook state with component rendering logic:** The hook should own state transitions; the component should own UI decisions (canContinue, button config).
- **Using `dynamicTyping: true` in PapaParse:** Silently converts phone numbers like `07911123456` to `7911123456` (drops leading zero). This is the UPLD-03 bug.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom parser | PapaParse (already installed) | Handles quoting, escaping, newlines in values |
| Auth check in API route | Custom JWT verification | `auth()` from `@clerk/nextjs/server` | Already integrated, handles token refresh |
| Step breadcrumbs | Custom stepper | `StyledStepBreadcrumbs` (cherry-pick from branch) | Already built with project design system |
| Sticky footer | Custom positioning | `StickyFormFooter` (exists on staging) | Already used in quotes/new, clients/new |

## Common Pitfalls

### Pitfall 1: UTF-8 BOM Corrupting First Header
**What goes wrong:** Excel-exported CSVs often start with `\uFEFF` (BOM). PapaParse treats this as part of the first header name, so `"Company Name"` becomes `"\uFEFFCompany Name"`. Mapping lookups then fail silently.
**Why it happens:** PapaParse does not strip BOM automatically during parsing.
**How to avoid:** Strip BOM from the raw string before passing to PapaParse:
```typescript
function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}
```
**Warning signs:** First column mapping never matches; AI returns "unknown" for first header.

### Pitfall 2: PapaParse dynamicTyping Corrupting Phone Numbers
**What goes wrong:** `dynamicTyping: true` causes PapaParse to parse `"07911123456"` as number `7911123456`, dropping the leading zero. Zip codes like `"01234"` become `1234`.
**Why it happens:** PapaParse applies `parseFloat()` to anything that looks numeric when `dynamicTyping` is true.
**How to avoid:** Set `dynamicTyping: false` in `parseCsvData()`. All values come through as strings. Type coercion happens later in `transformValue()` based on schema field data types.
**Warning signs:** Phone numbers missing leading zeros; zip codes truncated.

### Pitfall 3: Sending Full CSV to AI Route
**What goes wrong:** The AI agent prompt currently includes the entire CSV content. For large files (thousands of rows), this wastes tokens, slows response, and may exceed context limits.
**Why it happens:** The original implementation passes `csvContent` directly into the prompt string.
**How to avoid:** Parse the CSV on the client first, extract headers + 3-5 sample rows, and send only that subset to the API route. The full content stays client-side for later import.
**Warning signs:** Slow AI response; large request payload; API timeouts.

### Pitfall 4: Cherry-Pick Missing Dependencies
**What goes wrong:** Cherry-picking files from the branch without their component dependencies causes import errors at build time.
**Why it happens:** The import wizard files reference components that may only exist on the branch (e.g., `StyledStepBreadcrumbs`, `CsvUploadZone`).
**How to avoid:** Before cherry-picking, trace all imports from the target files. Confirm each imported module exists on staging or is included in the cherry-pick.
**Warning signs:** TypeScript import errors; build failures referencing missing modules.

### Pitfall 5: Vercel Function Timeout on AI Route
**What goes wrong:** The `analyze-csv` route calls an AI agent which can take 15-45 seconds. Vercel's default timeout is 10 seconds on Hobby plan, 60 seconds on Pro.
**Why it happens:** No `maxDuration` export on the route handler.
**How to avoid:** Export `maxDuration` at the top of the route file:
```typescript
export const maxDuration = 60; // seconds
```
**Warning signs:** 504 Gateway Timeout errors on production.

## Code Examples

### BOM Stripping Before Parse (UPLD-02)
```typescript
// In transform-csv.ts, modify parseCsvData:
export async function parseCsvData(
  fileContent: string
): Promise<Record<string, unknown>[]> {
  // Strip UTF-8 BOM if present (UPLD-02)
  const cleanContent = fileContent.charCodeAt(0) === 0xFEFF
    ? fileContent.slice(1)
    : fileContent;

  const Papa = (await import("papaparse")).default;
  const parseResult = Papa.parse(cleanContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // UPLD-03: preserve phone numbers
  });
  return parseResult.data as Record<string, unknown>[];
}
```

### Headers-Only AI Request (MAP-04)
```typescript
// In useImportWizard hook, modify handleFileSelect:
const handleFileSelect = useCallback(async (file: File, content: string) => {
  setState(prev => ({ ...prev, file, fileContent: content, isAnalyzing: true, ... }));

  try {
    // Parse CSV to extract headers + sample rows (MAP-04)
    const rows = await parseCsvData(content);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const sampleRows = rows.slice(0, 5);

    const response = await fetch("/api/analyze-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headers,
        sampleRows,
        entityType: "clients",
      }),
    });
    // ...
  } catch (err) { /* ... */ }
}, [toast]);
```

### Auth + maxDuration on API Route (MAP-05)
```typescript
// Source: Established project pattern from stripe-connect routes
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { mastra } from "@/mastra";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Auth check (MAP-05)
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { headers, sampleRows, entityType } = body;

  // Build prompt from headers + sample rows only (MAP-04)
  const csvSample = [
    headers.join(","),
    ...sampleRows.map((row: Record<string, string>) =>
      headers.map((h: string) => row[h] ?? "").join(",")
    ),
  ].join("\n");

  const agent = mastra.getAgent("csvImportAgent");
  const prompt = `Analyze this CSV file for ${entityType || "clients"} data. Parse the CSV, map the columns to the schema fields, and validate the data. Here's the CSV headers and sample rows:\n\n${csvSample}`;

  const response = await agent.generate(prompt, { maxSteps: 10 });
  // ... rest of handler
}
```

### clients.listNamesForOrg Query
```typescript
// Source: backend-skill patterns + existing clients.ts
import { query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./lib/auth";
import { getCurrentUserOrgId } from "./lib/auth";

export const listNamesForOrg = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUserOrThrow(ctx);
    const orgId = await getCurrentUserOrgId(ctx);

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    return clients.map((c) => ({
      _id: c._id,
      companyName: c.companyName,
    }));
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dynamicTyping: true` | `dynamicTyping: false` | This phase | All CSV values preserved as strings |
| Full CSV sent to AI | Headers + sample rows only | This phase | Faster, cheaper AI calls |
| No auth on analyze-csv | Clerk `auth()` guard | This phase | Prevents unauthenticated AI usage |
| Monolithic wizard component | Hook + component split | This phase | Cleaner state management |

## Open Questions

1. **Exact cherry-pick file list**
   - What we know: The wizard references `StyledStepBreadcrumbs`, `StickyFormFooter`, and step components. `StickyFormFooter` exists on staging. `StyledStepBreadcrumbs` does not.
   - What's unclear: Whether step components (StepUpload, etc.) import other branch-only components (e.g., `CsvUploadZone`, `CsvSchemaGuide`). Need to trace all imports.
   - Recommendation: During planning, trace the full import tree of all cherry-picked files. Include any missing dependencies in the cherry-pick list.

2. **API route prompt restructuring**
   - What we know: Currently the full CSV is embedded in the prompt. We need to send only headers + sample rows.
   - What's unclear: Whether the Mastra agent tools (`parseCsv`, `mapSchema`, `validateData`) need to be updated to work with the subset data instead of full content.
   - Recommendation: The agent tools likely need no change -- they receive the CSV content from the prompt. Just change what goes into the prompt.

3. **clientContacts.bulkCreate fitness for Phase 5**
   - What we know: It exists with args `{clientId, contacts[]}` where each contact has `firstName, lastName, email?, phone?, jobTitle?, isPrimary`. It's marked with a "TODO: Candidate for deletion" comment.
   - What's unclear: Whether Phase 5's batch import needs a different signature (e.g., accepting multiple clientIds in one call).
   - Recommendation: Remove the deletion TODO comment. The current signature works for Phase 5 (called once per client after client creation). No changes needed now.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via convex-test for backend, standard for web) |
| Config file | `packages/backend/vitest.config.ts` (backend), `apps/web/vitest.config.ts` (web) |
| Quick run command | `cd packages/backend && pnpm test:once` |
| Full suite command | `pnpm test` (from monorepo root, runs all via Turbo) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLD-02 | BOM stripped before CSV parse | unit | `cd packages/backend && pnpm vitest run --reporter=verbose` (N/A -- frontend util) | No -- Wave 0 |
| UPLD-03 | dynamicTyping false preserves strings | unit | Frontend unit test on `parseCsvData()` | No -- Wave 0 |
| MAP-04 | Only headers+samples sent to AI route | unit | Frontend unit test on request payload | No -- Wave 0 |
| MAP-05 | Unauthenticated requests get 401 | integration | Manual test or API test | No -- Wave 0 |
| N/A | `clients.listNamesForOrg` returns {_id, companyName} | unit | `cd packages/backend && pnpm vitest run clients.test.ts -x` | No -- Wave 0 (add to existing clients.test.ts) |
| N/A | `clientContacts.bulkCreate` is callable | unit | `cd packages/backend && pnpm vitest run clientContacts.test.ts -x` | Existing (clientContacts.test.ts) |

### Sampling Rate
- **Per task commit:** `cd packages/backend && pnpm test:once`
- **Per wave merge:** `pnpm test` (monorepo root)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/backend/convex/clients.test.ts` -- add test for `listNamesForOrg` query
- [ ] Frontend unit tests for BOM stripping and dynamicTyping -- may defer to manual verification if no web test infra for utils exists
- [ ] Verify `clientContacts.bulkCreate` test coverage in existing `clientContacts.test.ts`

## Sources

### Primary (HIGH confidence)
- Existing codebase: `apps/web/src/app/api/stripe-connect/account/route.ts` -- Clerk auth pattern in API routes
- Existing codebase: `apps/web/src/app/(workspace)/clients/import/` on `client-import-page` branch -- wizard implementation
- Existing codebase: `apps/web/src/app/api/analyze-csv/route.ts` -- current API route (no auth, no maxDuration)
- Existing codebase: `packages/backend/convex/clients.ts` -- existing bulkCreate, schema patterns
- Existing codebase: `packages/backend/convex/clientContacts.ts` -- existing bulkCreate mutation
- Existing codebase: `apps/web/src/types/csv-import.ts` -- types and schema field definitions
- Existing codebase: `apps/web/src/app/(workspace)/clients/import/utils/transform-csv.ts` -- `dynamicTyping: true` bug location

### Secondary (MEDIUM confidence)
- [Next.js Route Segment Config docs](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) -- `maxDuration` export pattern
- [Vercel Functions Duration docs](https://vercel.com/docs/functions/configuring-functions/duration) -- timeout limits by plan
- [PapaParse docs](https://www.papaparse.com/docs) -- `dynamicTyping` option behavior

### Tertiary (LOW confidence)
- [PapaParse BOM issue #830](https://github.com/mholt/PapaParse/issues/830) -- confirms PapaParse does not auto-strip BOM during parsing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- existing wizard code is the reference implementation; hook extraction is straightforward refactor
- Pitfalls: HIGH -- all bugs are confirmed by reading the actual code (dynamicTyping true, no auth, full CSV in prompt, no BOM handling)
- Cherry-pick scope: MEDIUM -- may discover additional branch-only dependencies during implementation

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable -- no external dependency changes expected)
