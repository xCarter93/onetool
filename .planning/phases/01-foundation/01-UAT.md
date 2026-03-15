---
status: resolved
phase: 01-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md]
started: 2026-03-14T21:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Navigate to Import Wizard
expected: Go to /clients/import. The page loads with a multi-step wizard showing step breadcrumbs (Upload, Map Columns, Review, Preview). The first step (Upload) is active.
result: pass

### 2. Upload a CSV File
expected: On the Upload step, drag-and-drop or click to select a CSV file. The file is parsed and an AI analysis request fires. You should see a loading/analysis status indicator while the AI processes column mappings.
result: pass

### 3. AI Column Mapping Suggestions
expected: After AI analysis completes, the wizard advances (or enables advancing) to the Map Columns step. Column mapping rows appear with AI-suggested mappings between CSV headers and OneTool schema fields (e.g., company name, email, phone).
result: issue
reported: "It seems to be taking a long time to analyze, it's been a couple of minutes and I'm still seeing the loading state"
severity: major

### 4. Column Mapping Interaction
expected: On the Map Columns step, each CSV column shows a dropdown to select a schema field. A data preview panel shows sample values for the selected column. You can change mappings via the dropdowns.
result: skipped
reason: Blocked by AI analysis issue in Test 3

### 5. Review Step
expected: Advancing to the Review step shows a validation summary and a mapping table confirming which CSV columns map to which fields.
result: skipped
reason: Blocked by AI analysis issue in Test 3

### 6. Preview Step
expected: Advancing to the Preview step shows a table of transformed data (how the imported records will look). An import button/trigger is visible.
result: skipped
reason: Blocked by AI analysis issue in Test 3

### 7. BOM-Safe CSV Parsing
expected: Upload a CSV file exported from Excel (which may include a BOM character). The first column header should display correctly without a leading special character or corruption.
result: skipped
reason: Blocked by AI analysis issue in Test 3

### 8. Phone/Zip Code Preservation
expected: Upload a CSV containing phone numbers (e.g., "0412345678") and zip codes (e.g., "01234"). In the preview, these values should appear as strings with leading zeros preserved, not as truncated numbers.
result: skipped
reason: Blocked by AI analysis issue in Test 3

## Summary

total: 8
passed: 2
issues: 1
pending: 0
skipped: 5

## Gaps

- truth: "AI column analysis completes and wizard advances to Map Columns step with suggested mappings"
  status: resolved
  reason: "User reported: It seems to be taking a long time to analyze, it's been a couple of minutes and I'm still seeing the loading state. OpenAI returned 500 server_error after 90860ms processing time (req_1f3b1cefb53042388983fb01900f5130)."
  severity: major
  test: 3
  root_cause: "Mastra agentic loop with agent.generate(maxSteps:10) makes 4+ sequential GPT-4o round-trips for purely deterministic logic (parseCsv, mapSchema, validateData). Takes 15-40+ seconds under good conditions, exceeded OpenAI timeout at 90s. parseCsv tool redundantly re-parses already-parsed data. Frontend fetch has no AbortController timeout."
  artifacts:
    - path: "apps/web/src/app/api/analyze-csv/route.ts"
      issue: "Orchestrates Mastra agent call; reconstructs CSV for redundant parsing; fragile tool result extraction by name strings"
    - path: "apps/web/src/mastra/agents/csv-import-agent.ts"
      issue: "Agent configured with 3 sequential tools and gpt-4o model - overkill for deterministic task"
    - path: "apps/web/src/mastra/tools/parse-csv-tool.ts"
      issue: "Redundant - re-parses data already parsed by frontend"
    - path: "apps/web/src/app/(workspace)/clients/import/hooks/use-import-wizard.ts"
      issue: "Missing AbortController/timeout on fetch call (line ~104)"
  missing:
    - "Replace Mastra agentic loop with direct deterministic tool calls (mapSchema + validateData)"
    - "Skip parseCsv tool entirely - data is already parsed by frontend"
    - "Add AbortController with 30s timeout on frontend fetch"
    - "If AI mapping desired for ambiguous columns, use single LLM call not agent loop"
  debug_session: ".planning/debug/ai-analysis-timeout.md"
