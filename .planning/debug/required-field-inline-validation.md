---
status: diagnosed
trigger: "Required-field validation message displays as floating text above StickyFormFooter instead of inline with each unmapped required mapping row"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: The required-field validation is rendered as a single floating banner in import-wizard.tsx rather than as per-row inline indicators in column-mapping-row.tsx
test: Read the rendering code for both components
expecting: Floating message in wizard, no per-row required indicators in mapping rows
next_action: Return diagnosis

## Symptoms

expected: Each required mapping row that is unmapped should show an inline "Required" indicator on that specific row
actual: A single floating message "Map required fields to continue" appears above the StickyFormFooter as a fixed-position banner
errors: No errors - this is a UX design issue
reproduction: Go to CSV import wizard, reach the "map" step with required fields unmapped
started: Original implementation - the inline indicators were never built

## Eliminated

(none needed - root cause identified on first pass)

## Evidence

- timestamp: 2026-03-15
  checked: import-wizard.tsx lines 212-218
  found: The required-field message is rendered as a fixed-position div (`fixed bottom-16 left-0 right-0 z-40`) between the step content and StickyFormFooter. It shows a single generic message "Map required fields to continue" when `currentStep === "map" && !canContinue`.
  implication: This is a page-level floating banner, not tied to individual rows.

- timestamp: 2026-03-15
  checked: import-wizard.tsx lines 48-60 (canContinue logic for "map" step)
  found: The wizard knows exactly which fields are required via `CLIENT_SCHEMA_FIELDS` and which are mapped via `state.mappings`. It computes `requiredFields` and `mappedFields` but only uses them to produce a boolean `allRequiredMapped`. This information is not passed to child components.
  implication: The data needed for per-row indicators exists but is not propagated to StepMapColumns or ColumnMappingRow.

- timestamp: 2026-03-15
  checked: column-mapping-row.tsx (full file)
  found: The component receives no prop indicating whether its mapped field is required OR whether validation has been attempted. It does know about `CLIENT_SCHEMA_FIELDS` (imported for the dropdown) and shows a red asterisk `*` next to required fields in the dropdown options, but has no inline validation indicator for unmapped required rows.
  implication: ColumnMappingRow has access to CLIENT_SCHEMA_FIELDS but doesn't use it for row-level validation display.

- timestamp: 2026-03-15
  checked: CLIENT_SCHEMA_FIELDS in csv-import.ts
  found: Required fields are `companyName` (required: true) and `status` (required: true). Each field has a `required` boolean property.
  implication: The required-field information is available and can be checked per-row by looking up `CLIENT_SCHEMA_FIELDS[schemaField]?.required`.

## Resolution

root_cause: |
  The required-field validation is implemented as a single floating banner in import-wizard.tsx (lines 212-218) using fixed positioning. It displays a generic "Map required fields to continue" message when any required field is unmapped. There are no per-row inline indicators in ColumnMappingRow to show which specific rows need mapping.

  The floating banner approach:
  - Lines 212-218 in import-wizard.tsx render a `fixed bottom-16` div with a generic message
  - The `canContinue` computation (lines 48-60) determines which fields are required and unmapped, but this granular information is never passed to child components
  - ColumnMappingRow has no concept of "this row is for a required field that is unmapped"

fix: |
  (diagnosis only - not applied)

verification: []
files_changed: []
