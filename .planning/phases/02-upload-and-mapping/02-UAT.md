---
status: diagnosed
phase: 02-upload-and-mapping
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md
started: 2026-03-15T15:00:00Z
updated: 2026-03-15T15:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Template CSV Download
expected: On the client import page (/clients/import), the upload step shows a "Download Template" link. Clicking it downloads a CSV file containing all client schema fields as column headers with example data.
result: pass

### 2. CSV Upload and AI Auto-Advance
expected: After uploading a valid CSV file, the AI analysis runs and the wizard automatically advances to the mapping step (~1 second after analysis completes). No manual "Next" click required.
result: pass

### 3. Confidence Indicators on Mapping Rows
expected: On the mapping step, each mapping row shows a color-coded confidence indicator: green for High confidence, amber for Low confidence. If you manually change a mapping, a blue checkmark appears indicating manual override.
result: pass

### 4. Mapping Summary Banner
expected: Above the mapping list on the map step, a summary banner displays counts: how many columns are mapped, how many are high confidence, low confidence, and skipped.
result: pass

### 5. Data Preview Panel
expected: When no column is selected in the mapping step, the preview panel shows an overview with mapping stats. When a specific column is selected, it shows sample data and any type mismatch warnings (e.g., text in a numeric field).
result: pass

### 6. Required Field Validation on Continue
expected: On the mapping step, if required fields (like client name) are not mapped, the Continue button is disabled and a message appears explaining which required fields need mapping.
result: issue
reported: "disabling the save button works, but the error message should be displayed inline with the required field indicating that it's required to be mapped before proceeding"
severity: minor

### 7. AI Failure Error Banner
expected: If the AI analysis fails (e.g., network error or bad response), an error banner appears on the upload step with three action buttons: Retry Analysis, Clear File, and Proceed Without Mapping.
result: pass

### 8. Proceed Unmapped After AI Failure
expected: After AI failure, clicking "Proceed Without Mapping" advances to the mapping step with all CSV columns visible but set to "Skip" (unmapped). You can then manually assign each column to a client field.
result: pass

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Required field validation message appears inline with the required field indicating it must be mapped before proceeding"
  status: failed
  reason: "User reported: disabling the save button works, but the error message should be displayed inline with the required field indicating that it's required to be mapped before proceeding"
  severity: minor
  test: 6
  root_cause: "Required-field validation is a single floating banner in import-wizard.tsx (lines 212-218) positioned fixed above footer. The canContinue logic computes which required fields are unmapped but only derives a boolean - never passes granular info to ColumnMappingRow. No per-row inline validation exists."
  artifacts:
    - path: "apps/web/src/app/(workspace)/clients/import/components/import-wizard.tsx"
      issue: "Floating banner shows generic message; unmapped required field set not passed to children"
    - path: "apps/web/src/app/(workspace)/clients/import/components/step-map-columns.tsx"
      issue: "Does not accept or forward unmapped required field info to rows"
    - path: "apps/web/src/app/(workspace)/clients/import/components/column-mapping-row.tsx"
      issue: "No prop or UI for inline 'Required' indicator on unmapped required rows"
  missing:
    - "Remove floating banner, pass unmapped required field set down to StepMapColumns and ColumnMappingRow"
    - "Add inline 'Required' text/badge on mapping rows where the target schema field is required but unmapped"
  debug_session: ".planning/debug/required-field-inline-validation.md"
