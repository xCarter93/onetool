# Phase 2: Upload and Mapping - Research

**Researched:** 2026-03-15
**Domain:** CSV upload UX, AI column mapping display, client-side CSV template generation
**Confidence:** HIGH

## Summary

Phase 2 enhances the existing upload and mapping wizard steps that were structurally built in Phase 1. The existing codebase already has functional drag-drop upload (`CsvUploadZone`), AI-powered column mapping (`mapSchemaTool` with GPT-5 nano), manual override dropdowns (`ColumnMappingRow`), and a data preview panel (`DataPreviewPanel`). This phase focuses on UX polish: adding a template CSV download, displaying per-field confidence scores, auto-advancing after analysis, summary banners, type mismatch warnings, and required-field gating on the Continue button.

All code changes are client-side React enhancements to existing components. No new backend functions, API routes, or database schema changes are required. The `FieldMapping` type already carries a `confidence` number, the `CLIENT_SCHEMA_FIELDS` constant provides all field metadata, and the `useImportWizard` hook manages wizard state including step navigation.

**Primary recommendation:** Enhance existing components in-place -- add confidence indicators to `ColumnMappingRow`, summary banner to `StepMapColumns`, template download to `StepUpload`, auto-advance logic to `useImportWizard`, and type mismatch warnings to `DataPreviewPanel`. No new files needed except possibly a small utility for template CSV generation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Template CSV download link placed below the drag-drop upload zone (inside StepUpload, beneath CsvUploadZone)
- Template includes ALL CLIENT_SCHEMA_FIELDS columns (required + optional client, contact, property fields)
- Human-readable headers derived from field keys (e.g., "Company Name" not "companyName")
- Includes 1 example data row with realistic values
- Generated dynamically client-side from CLIENT_SCHEMA_FIELDS -- no static file
- Download triggers a CSV blob download (no server call needed)
- Confidence display: color-coded indicator, green "High" (>=0.7), amber "Low" (<0.7)
- No raw percentage shown -- just color + label
- Low-confidence mappings keep AI's suggestion, marked "Low" to signal review
- Manual override replaces confidence indicator with checkmark/"Manual" label
- Summary banner above mapping list: "8 of 12 columns mapped (3 high confidence, 2 low confidence, 4 skipped)"
- Keep existing right-side DataPreviewPanel with click-to-select behavior
- Preview updates instantly when mapping dropdown changes
- Show inline data type mismatch warning in preview panel
- When no column selected, show mapping summary stats instead of empty state
- Auto-advance to mapping step after successful AI analysis (~1s delay)
- On AI failure: error banner with "Try again" + upload different file + proceed unmapped
- Back button on mapping step returns to upload step -- no inline re-upload
- Next button disabled if required fields (companyName, status) not mapped -- shows "Map required fields to continue"

### Claude's Discretion
- Exact auto-advance delay timing (0.5-1.5s range)
- Summary banner visual design and layout
- Data type mismatch detection logic (which types to check, tolerance for edge cases)
- Human-readable header name generation logic (camelCase to Title Case, handling dot-namespaced fields)
- Animation/transition when auto-advancing between steps

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPLD-01 | User can drag-and-drop or click to upload a .csv file with size validation | Already implemented in `CsvUploadZone` -- validation for .csv extension and 5MB max. Phase 2 ensures it works end-to-end with auto-advance |
| UPLD-04 | User can download a template CSV with human-readable column headers derived from schema | New feature: generate CSV blob from `CLIENT_SCHEMA_FIELDS`, convert camelCase/dot-notation to Title Case headers, include example row, trigger browser download |
| UPLD-05 | User can view an inline schema guide showing required/optional fields and expected data types | Already implemented in `CsvSchemaGuide` component -- collapsible panel with required/optional fields grouped. No changes needed |
| MAP-01 | System auto-maps CSV columns to schema fields using AI with real per-field confidence scores | AI mapping with real confidence already works via `mapSchemaTool` (GPT-5 nano). Phase 2 adds UI display: color-coded High/Low indicators per row, summary banner |
| MAP-02 | User can manually override or remove any column mapping via dropdown | Already implemented in `ColumnMappingRow` with grouped Select dropdown and `__skip__` option. Phase 2 adds "Manual" checkmark indicator when user overrides |
| MAP-03 | User can see a live data preview panel that updates as mappings change | Already implemented in `DataPreviewPanel`. Phase 2 adds: type mismatch warnings, summary stats when no column selected |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.x | Component UI | Already in project |
| Next.js 16 | 16.x | App framework | Already in project |
| Tailwind CSS 4 | 4.x | Styling | Already in project |
| shadcn/ui | latest | UI components (Select, Badge) | Already used throughout |
| lucide-react | latest | Icons | Already used in all import components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PapaParse | latest | CSV generation (unparse) | Template CSV download -- already in project for parsing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PapaParse unparse | Manual CSV string building | PapaParse already imported, handles quoting/escaping edge cases |
| Blob download | Server-side CSV generation | Client-side is simpler, no API call needed, always in sync with schema |

**Installation:**
No new packages needed. PapaParse is already a dependency (used in `parseCsvData`).

## Architecture Patterns

### Existing Project Structure (relevant files)
```
apps/web/src/
  app/(workspace)/clients/
    import/
      components/
        import-wizard.tsx     # Main wizard container
        step-upload.tsx       # Upload step -- ADD template download
        step-map-columns.tsx  # Map step -- ADD summary banner
        column-mapping-row.tsx # Mapping row -- ADD confidence indicator
        data-preview-panel.tsx # Preview -- ADD type mismatch, summary stats
      hooks/
        use-import-wizard.ts  # Wizard state -- ADD auto-advance
      utils/
        transform-csv.ts     # CSV parsing utilities
    components/
      csv-upload-zone.tsx     # Drag-drop zone (no changes needed)
      csv-schema-guide.tsx    # Schema reference (no changes needed)
  types/
    csv-import.ts             # Types + CLIENT_SCHEMA_FIELDS
```

### Pattern 1: Template CSV Generation (Client-Side Blob Download)
**What:** Generate a CSV file dynamically from `CLIENT_SCHEMA_FIELDS` and trigger browser download
**When to use:** Template download button in StepUpload

```typescript
// Source: PapaParse docs + standard Blob download pattern
import Papa from "papaparse";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";

function toHumanReadableHeader(fieldKey: string): string {
  // "companyName" -> "Company Name"
  // "contact.firstName" -> "Contact First Name"
  const withoutDot = fieldKey.replace(/\./g, " ");
  return withoutDot
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function downloadTemplateCsv() {
  const fields = Object.entries(CLIENT_SCHEMA_FIELDS);
  const headers = fields.map(([key]) => toHumanReadableHeader(key));
  const exampleRow = fields.map(([key, info]) => {
    // Generate realistic example value based on field type/name
    // ... see Code Examples section
  });

  const csv = Papa.unparse({ fields: headers, data: [exampleRow] });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "onetool-client-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}
```

### Pattern 2: Confidence Indicator Display
**What:** Color-coded badge next to each mapping row showing High/Low/Manual
**When to use:** In `ColumnMappingRow` component

```typescript
// Determine indicator state
type ConfidenceState = "high" | "low" | "manual" | "skipped";

function getConfidenceState(
  mapping: FieldMapping,
  isManuallyOverridden: boolean
): ConfidenceState {
  if (mapping.schemaField === "__skip__") return "skipped";
  if (isManuallyOverridden) return "manual";
  return mapping.confidence >= 0.7 ? "high" : "low";
}
```

### Pattern 3: Tracking Manual Overrides
**What:** Track which columns the user has manually changed to distinguish from AI suggestions
**When to use:** In `useImportWizard` hook state

```typescript
// Add to wizard state
const [manualOverrides, setManualOverrides] = useState<Set<string>>(new Set());

// In handleMappingChange, mark column as manually overridden
const handleMappingChange = (csvColumn: string, newSchemaField: string) => {
  setManualOverrides(prev => new Set(prev).add(csvColumn));
  // ... existing mapping update logic
};
```

### Pattern 4: Auto-Advance After Analysis
**What:** Automatically navigate to mapping step after successful AI analysis
**When to use:** In `useImportWizard.handleFileSelect`

```typescript
// After successful analysis, auto-advance with delay
setState(prev => ({ ...prev, isAnalyzing: false, analysisResult, mappings }));

// Auto-advance to map step after brief delay
setTimeout(() => {
  navigateTo("map");
}, 1000); // ~1s delay per user decision
```

### Pattern 5: Type Mismatch Detection
**What:** Check sample values against mapped field type and show warnings
**When to use:** In `DataPreviewPanel` when a column is selected

```typescript
function detectTypeMismatches(
  sampleValues: string[],
  fieldDef: { type: string; options?: readonly string[] }
): string[] {
  const mismatches: string[] = [];
  for (const val of sampleValues) {
    if (fieldDef.type === "enum" && fieldDef.options) {
      if (!fieldDef.options.includes(val)) {
        mismatches.push(`"${val}" is not a valid option`);
      }
    }
    if (fieldDef.type === "number" && isNaN(Number(val))) {
      mismatches.push(`"${val}" is not a number`);
    }
  }
  return [...new Set(mismatches)]; // Deduplicate
}
```

### Anti-Patterns to Avoid
- **Creating new components for each enhancement:** These are all modifications to existing components, not new ones. Keep changes in existing files.
- **Storing manual override state in each mapping object:** Use a separate `Set<string>` for manual overrides to avoid complicating the FieldMapping type that flows through the API.
- **Server-side template generation:** The template is purely derived from `CLIENT_SCHEMA_FIELDS` -- no server data needed.
- **Using `useEffect` for auto-advance:** Use `setTimeout` directly in the success handler. `useEffect` watching `analysisResult` creates timing issues and re-render dependencies.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV generation with proper escaping | Manual string concatenation | `Papa.unparse()` | Handles quoting, commas in values, special characters |
| Blob download trigger | Custom download logic | Standard Blob + `URL.createObjectURL` pattern | Well-established browser API, no library needed |
| CamelCase to Title Case | Complex regex | Simple `replace(/([A-Z])/g, " $1")` + dot handling | Covers all field name patterns in CLIENT_SCHEMA_FIELDS |

**Key insight:** All enhancements are UI-level changes to existing components. The data pipeline (CSV parsing, AI mapping, confidence scores) is already built and working.

## Common Pitfalls

### Pitfall 1: Auto-Advance Racing with State Updates
**What goes wrong:** `navigateTo("map")` fires before React has committed the `analysisResult` to state, causing the map step guard to redirect back to upload.
**Why it happens:** `setState` is async, `setTimeout` may fire before the next render.
**How to avoid:** Use `setTimeout` with enough delay (1s is fine) OR use a ref to track pending auto-advance and handle in the step guard.
**Warning signs:** Flickering between upload and map steps after analysis completes.

### Pitfall 2: Manual Override Tracking Lost on Re-Analysis
**What goes wrong:** User overrides mappings, then goes back and re-uploads -- old manual override set persists.
**Why it happens:** `manualOverrides` state not reset when new file is uploaded.
**How to avoid:** Clear `manualOverrides` in `handleFileSelect` alongside other state resets.
**Warning signs:** "Manual" badges showing on freshly AI-mapped columns.

### Pitfall 3: Template CSV Headers Out of Sync with Schema
**What goes wrong:** Template headers don't match what the AI mapper expects.
**Why it happens:** Template generation uses different header naming than schema field names.
**How to avoid:** Template headers are for humans. The AI mapper uses the actual CSV headers (whatever the user uploads). The template is guidance, not a contract. Document this clearly.
**Warning signs:** N/A -- not actually a functional problem, just a UX concern.

### Pitfall 4: Dot-Namespaced Fields in Header Conversion
**What goes wrong:** "contact.firstName" becomes "Contact.first Name" instead of "Contact First Name".
**Why it happens:** The dot isn't treated as a word separator in the camelCase-to-Title conversion.
**How to avoid:** First replace dots with spaces, then apply camelCase splitting.
**Warning signs:** Template CSV headers with dots or awkward casing.

### Pitfall 5: Continue Button Already Has Required Field Gating
**What goes wrong:** Duplicate validation logic -- existing `canContinue` in `import-wizard.tsx` already checks required fields for the map step.
**Why it happens:** Not reading existing code before adding new validation.
**How to avoid:** The existing `canContinue` logic in `import-wizard.tsx` (lines 43-55) already validates required fields and duplicate mappings. Just add the user-facing message ("Map required fields to continue") near the disabled Continue button.
**Warning signs:** Two separate required-field checks that could diverge.

## Code Examples

### Template CSV Download Utility
```typescript
// Source: PapaParse docs for unparse + CLIENT_SCHEMA_FIELDS
import Papa from "papaparse";
import { CLIENT_SCHEMA_FIELDS } from "@/types/csv-import";

/**
 * Convert a schema field key to a human-readable CSV header.
 * "companyName" -> "Company Name"
 * "contact.firstName" -> "Contact First Name"
 * "property.streetAddress" -> "Property Street Address"
 */
export function fieldKeyToHeader(key: string): string {
  return key
    .replace(/\./g, " ")           // dots to spaces
    .replace(/([A-Z])/g, " $1")    // camelCase to spaces
    .replace(/\s+/g, " ")          // collapse multiple spaces
    .trim()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const EXAMPLE_VALUES: Record<string, string> = {
  companyName: "Acme Corp",
  status: "active",
  companyDescription: "Commercial cleaning services",
  leadSource: "referral",
  communicationPreference: "email",
  tags: "commercial, priority",
  notes: "Referred by Jane Smith",
  "contact.firstName": "John",
  "contact.lastName": "Smith",
  "contact.email": "john@acme.com",
  "contact.phone": "(555) 123-4567",
  "contact.jobTitle": "Owner",
  "property.propertyName": "Main Office",
  "property.propertyType": "commercial",
  "property.streetAddress": "123 Main St",
  "property.city": "Austin",
  "property.state": "TX",
  "property.zipCode": "78701",
  "property.country": "US",
};

export function downloadTemplateCsv() {
  const entries = Object.entries(CLIENT_SCHEMA_FIELDS);
  const headers = entries.map(([key]) => fieldKeyToHeader(key));
  const exampleRow = entries.map(([key]) => EXAMPLE_VALUES[key] ?? "");

  const csv = Papa.unparse({ fields: headers, data: [exampleRow] });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "onetool-client-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
```

### Confidence Indicator Component (in ColumnMappingRow)
```typescript
// Add to column-mapping-row.tsx
function ConfidenceIndicator({
  confidence,
  isManual,
  isSkipped,
}: {
  confidence: number;
  isManual: boolean;
  isSkipped: boolean;
}) {
  if (isSkipped) return null;

  if (isManual) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
        <Check className="w-3 h-3" />
        Manual
      </span>
    );
  }

  const isHigh = confidence >= 0.7;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        isHigh
          ? "text-green-600 dark:text-green-400"
          : "text-amber-600 dark:text-amber-400"
      )}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        isHigh ? "bg-green-500" : "bg-amber-500"
      )} />
      {isHigh ? "High" : "Low"}
    </span>
  );
}
```

### Summary Banner Component (in StepMapColumns)
```typescript
// Add above the mapping list in step-map-columns.tsx
function MappingSummaryBanner({ mappings }: { mappings: FieldMapping[] }) {
  const total = mappings.length;
  const skipped = mappings.filter(m => m.schemaField === "__skip__").length;
  const mapped = total - skipped;
  const highConf = mappings.filter(
    m => m.schemaField !== "__skip__" && m.confidence >= 0.7
  ).length;
  const lowConf = mapped - highConf;

  return (
    <div className="px-4 py-3 bg-muted/30 border border-border rounded-lg text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{mapped} of {total}</span>
      {" columns mapped"}
      {mapped > 0 && (
        <span>
          {" ("}
          {highConf > 0 && <span className="text-green-600">{highConf} high confidence</span>}
          {highConf > 0 && lowConf > 0 && ", "}
          {lowConf > 0 && <span className="text-amber-600">{lowConf} low confidence</span>}
          {(highConf > 0 || lowConf > 0) && skipped > 0 && ", "}
          {skipped > 0 && <span>{skipped} skipped</span>}
          {")"}
        </span>
      )}
    </div>
  );
}
```

### AI Failure Error Banner (in StepUpload)
```typescript
// Show when analysisResult exists but llmFailed is true, or when analysis errors
{analysisError && (
  <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg space-y-3">
    <p className="text-sm font-medium text-red-800 dark:text-red-200">
      AI analysis failed
    </p>
    <p className="text-xs text-red-600 dark:text-red-300">{analysisError}</p>
    <div className="flex gap-2">
      <Button intent="outline" size="sm" onClick={handleRetryAnalysis}>
        Try again
      </Button>
      <Button intent="outline" size="sm" onClick={() => /* clear file, stay on upload */}>
        Upload different file
      </Button>
      <Button intent="outline" size="sm" onClick={handleProceedUnmapped}>
        Continue without AI mapping
      </Button>
    </div>
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded 0.8 confidence | Real per-field LLM confidence scores | Phase 1.1 | Confidence is now real but not displayed in UI |
| `generateObject` (ai SDK) | `generateText` + `Output.object` | Phase 1.1 quick task | More reliable structured output extraction |
| Agent-based mapping | Direct tool execution | Phase 1 | Simpler, no LLM overhead for deterministic validation |

**Deprecated/outdated:**
- `generateObject` from ai SDK: Replaced with `generateText` + `Output.object` pattern (Phase 1.1 quick task)
- Hardcoded confidence scores: Already fixed in Phase 1.1

## Open Questions

1. **PapaParse unparse availability in client bundle**
   - What we know: PapaParse is dynamically imported in `parseCsvData` (`await import("papaparse")`). The `unparse` function should be available on the same module.
   - What's unclear: Whether `Papa.unparse` works correctly with the `{ fields, data }` format in the version installed.
   - Recommendation: Use same dynamic import pattern. If `unparse` issues arise, fall back to manual CSV string generation (simple for a 20-column template).

2. **Manual override state persistence across step navigation**
   - What we know: Current wizard state persists in `useState` -- survives step changes but not page refresh.
   - What's unclear: Whether `manualOverrides` Set needs to be stored alongside mappings.
   - Recommendation: Store as separate `Set<string>` in `useImportWizard` hook state. Reset on new file upload.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (edge-runtime environment) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm test:once` |
| Full suite command | `cd apps/web && pnpm test:once` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLD-01 | Upload zone validates .csv and file size | unit | `cd apps/web && pnpm vitest run src/app/\\(workspace\\)/clients/import/utils/template-csv.test.ts -x` | No -- Wave 0 |
| UPLD-04 | Template CSV contains all schema fields with human-readable headers | unit | Same as above | No -- Wave 0 |
| UPLD-05 | Schema guide displays required/optional fields | manual-only | N/A -- existing CsvSchemaGuide component, no changes needed | N/A |
| MAP-01 | Confidence display shows High (>=0.7) / Low (<0.7) | unit | `cd apps/web && pnpm vitest run src/app/\\(workspace\\)/clients/import/utils/confidence.test.ts -x` | No -- Wave 0 |
| MAP-02 | Manual override tracked and shown as "Manual" | unit | Same as above | No -- Wave 0 |
| MAP-03 | Type mismatch detection for enum and number fields | unit | `cd apps/web && pnpm vitest run src/app/\\(workspace\\)/clients/import/utils/type-mismatch.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm test:once`
- **Per wave merge:** `cd apps/web && pnpm test:once && cd ../../packages/backend && pnpm test:once`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/(workspace)/clients/import/utils/template-csv.test.ts` -- covers UPLD-04 (header generation, example values, CSV output)
- [ ] `src/app/(workspace)/clients/import/utils/confidence.test.ts` -- covers MAP-01, MAP-02 (confidence state logic)
- [ ] `src/app/(workspace)/clients/import/utils/type-mismatch.test.ts` -- covers MAP-03 (type mismatch detection)
- Note: Extract pure utility functions (fieldKeyToHeader, detectTypeMismatches, getConfidenceState) into utils/ files to make them independently testable

## Sources

### Primary (HIGH confidence)
- Existing codebase: All source files read directly -- `csv-import.ts`, `use-import-wizard.ts`, `import-wizard.tsx`, `step-upload.tsx`, `step-map-columns.tsx`, `column-mapping-row.tsx`, `data-preview-panel.tsx`, `csv-upload-zone.tsx`, `csv-schema-guide.tsx`, `map-schema-tool.ts`, `validate-data-tool.ts`, `transform-csv.ts`, `analyze-csv/route.ts`
- CONTEXT.md user decisions: All locked decisions from Phase 2 discussion session

### Secondary (MEDIUM confidence)
- PapaParse `unparse` API: Standard feature of PapaParse, verified available in installed version via existing import

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, no new dependencies
- Architecture: HIGH - All enhancements are modifications to existing components with well-understood patterns
- Pitfalls: HIGH - Identified from direct code analysis of existing wizard flow

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external API changes, all client-side)
