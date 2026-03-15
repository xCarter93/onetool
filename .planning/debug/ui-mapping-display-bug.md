---
status: investigating
trigger: "CSV Import UI Not Displaying LLM Mappings - API returns 12 mappings but UI shows 0 columns detected, 0% confidence"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: Two distinct bugs identified. Primary: LLM failure in mapSchemaTool is silently swallowed, returning empty mappings as 200 OK. Secondary: csv-import-sheet.tsx sends old API format (csvContent) instead of new format (headers/sampleRows).
test: Verify LLM call success/failure at runtime; verify csv-import-sheet.tsx request payload
expecting: If LLM fails at runtime, console.error in mapSchemaTool would fire; if csv-import-sheet.tsx sends wrong format, API returns 400
next_action: Add observability to mapSchemaTool execute to distinguish LLM success from graceful fallback; fix csv-import-sheet.tsx API contract

## Symptoms

expected: CSV import UI shows "Analysis complete - 12 columns detected, ~87% confidence" after uploading a CSV file
actual: UI shows "Analysis complete - 0 columns detected, 0% confidence"
errors: No visible errors in UI (the green success box renders, suggesting API returned 200 OK with valid CsvAnalysisResult shape)
reproduction: Upload a CSV file through the /clients/import wizard flow
started: After Phase 01.1 replaced deterministic column mapping with LLM-powered generateObject (commit f0b09a7)

## Eliminated

- hypothesis: Zod 4 safeParse strips or rejects valid output from mapSchemaTool
  evidence: Tested Zod 4.3.4 safeParse with the exact outputSchema and sample data - all validations pass, data preserved correctly. Zod 4 returns { success: true, data: ... } matching Mastra's expected interface.
  timestamp: 2026-03-15

- hypothesis: Mastra Tool wrapper alters return value shape
  evidence: Read Mastra core source (chunk-KGE3KAM7.js). Execute wrapper returns outputValidation.data which is schema.safeParse(output).data. No envelope wrapping. Route correctly accesses mapResult.mappings.
  timestamp: 2026-03-15

- hypothesis: API route returns wrong response shape
  evidence: Route builds CsvAnalysisResult with detectedFields: mapResult.mappings. The outputSchema shape {mappings, unmappedColumns, missingRequiredFields} is identical between old deterministic and new LLM versions. Route code only had a comment change in Phase 01.1.
  timestamp: 2026-03-15

- hypothesis: Frontend state management race condition
  evidence: handleFileSelect is a single async function with sequential setState calls. React useState updates trigger re-renders. No competing state updates identified.
  timestamp: 2026-03-15

- hypothesis: PapaParse returns non-string values causing Zod input validation failure
  evidence: Tested PapaParse with dynamicTyping: false - all values (including empty cells) are empty strings "", not null. Zod z.record(z.string(), z.string()) passes.
  timestamp: 2026-03-15

- hypothesis: FieldMapping type mismatch between API response and frontend
  evidence: mapSchemaTool outputSchema mapping items have {csvColumn, schemaField, confidence, dataType, isRequired, sampleValue} which matches the FieldMapping TypeScript interface exactly. JSON serialization preserves all fields.
  timestamp: 2026-03-15

## Evidence

- timestamp: 2026-03-15
  checked: Phase 01.1 commit diff (f0b09a7)
  found: Only 2 files changed - map-schema-tool.ts (rewritten from deterministic to LLM) and route.ts (comment-only change). The API route data flow is identical pre/post Phase 01.1.
  implication: Bug is in the new LLM-powered mapSchemaTool behavior, not in the route or frontend.

- timestamp: 2026-03-15
  checked: mapSchemaTool error handling (map-schema-tool.ts lines 201-211)
  found: When generateObject throws ANY error, the catch block returns { mappings: [], unmappedColumns: [...headers], missingRequiredFields: [...] }. This is a graceful fallback that produces a valid response with zero mappings.
  implication: If the LLM call fails (missing API key, timeout, network error), the API returns 200 OK with detectedFields: [] and confidence: 0 -- exactly matching the reported symptom.

- timestamp: 2026-03-15
  checked: API route error propagation (route.ts lines 52-57, 67-72)
  found: Route checks for Mastra ValidationError ({ error: true }) but does NOT check if mappings array is empty. An LLM failure produces a valid (but empty) result that passes all checks.
  implication: The route cannot distinguish between "LLM worked but found no mappings" and "LLM failed and we returned empty fallback". Both return 200 OK.

- timestamp: 2026-03-15
  checked: csv-import-sheet.tsx request payload (lines 64-67)
  found: Sends { csvContent: content, entityType } -- the OLD API format. The current route expects { headers, sampleRows, entityType }. This would cause a 400 error ("CSV headers array is required").
  implication: The Sheet-based import flow (used from /clients page sidebar) is completely broken after Phase 01.1 changes. This is a separate bug from the wizard flow.

- timestamp: 2026-03-15
  checked: use-import-wizard.ts request payload (lines 107-114)
  found: Correctly sends { headers, sampleRows, entityType } -- the NEW API format with parsed CSV data.
  implication: The wizard flow sends the correct request format. If the wizard shows 0 columns, the issue is in the API response, not the request.

- timestamp: 2026-03-15
  checked: step-upload.tsx display logic (lines 43-58)
  found: Shows "Analysis complete" green box when analysisResult is non-null and isAnalyzing is false. Displays analysisResult.detectedFields.length and Math.round(analysisResult.confidence * 100). For the symptom to occur, analysisResult must be set with detectedFields=[] and confidence=0.
  implication: The API DID return a 200 response with a valid CsvAnalysisResult shape, but with empty detectedFields.

## Resolution

root_cause: |
  TWO BUGS IDENTIFIED:

  **Bug 1 (Primary - Wizard Flow): Silent LLM failure produces empty-but-valid response**

  File: apps/web/src/mastra/tools/map-schema-tool.ts (lines 201-211)

  When the LLM call (generateObject) fails for any reason (missing OPENAI_API_KEY, timeout, network error, rate limiting), the catch block silently returns { mappings: [], unmappedColumns: [...], missingRequiredFields: [...] }. This "graceful fallback" produces a valid CsvAnalysisResult with detectedFields: [] and confidence: 0, which the UI correctly renders as "0 columns detected, 0% confidence".

  The API route does not distinguish between "LLM returned zero mappings" and "LLM failed". Both produce identical 200 OK responses.

  The old deterministic version never failed this way because it didn't depend on an external API call.

  **Bug 2 (Secondary - Sheet Flow): API contract mismatch in csv-import-sheet.tsx**

  File: apps/web/src/app/(workspace)/clients/components/csv-import-sheet.tsx (lines 64-67)

  The CsvImportSheet component sends { csvContent: content, entityType } which is the OLD API format. The current analyze-csv route expects { headers, sampleRows, entityType }. This causes a 400 error. The Sheet-based import flow is completely non-functional.

fix: |
  Bug 1 fix direction:
  - In the API route, check if mapResult.mappings is empty AND unmappedColumns contains all headers. This pattern indicates LLM failure vs genuine "no mappings found".
  - Alternatively, modify mapSchemaTool to throw or return an error indicator instead of silently falling back.
  - Add the LLM error message to the API response so the UI can display "AI analysis failed, please try again" instead of misleadingly showing "Analysis complete".

  Bug 2 fix direction:
  - Update csv-import-sheet.tsx handleFileSelect to parse CSV into headers/sampleRows before calling the API, matching use-import-wizard.ts pattern. Use parseCsvData from import/utils/transform-csv.ts.

verification: []
files_changed: []
