# Phase 2: Upload and Mapping - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can upload a CSV file, receive AI column mapping suggestions with real confidence scores, manually override any mapping, and see a live preview of the mapped data before proceeding. This phase delivers the Upload step and Map Columns step of the wizard end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Template CSV download
- Download link placed below the drag-drop upload zone (inside StepUpload, beneath CsvUploadZone)
- Template includes ALL CLIENT_SCHEMA_FIELDS columns (required + optional client, contact, property fields)
- Human-readable headers derived from field keys (e.g., "Company Name" not "companyName")
- Includes 1 example data row with realistic values (e.g., "Acme Corp", "active", "John", "john@acme.com")
- Generated dynamically client-side from CLIENT_SCHEMA_FIELDS — no static file, always in sync with schema
- Download triggers a CSV blob download (no server call needed)

### Confidence score display
- Each mapping row shows a color-coded indicator: green "High" (>=0.7), amber "Low" (<0.7)
- No raw percentage shown — just the color + label for scannability
- Low-confidence mappings keep the AI's suggestion (not defaulted to "Do not import") but marked as "Low" to signal review needed
- When user manually overrides a mapping, replace the confidence indicator with a checkmark/"Manual" label
- Summary banner above the mapping list: "8 of 12 columns mapped (3 high confidence, 2 low confidence, 4 skipped)"

### Live data preview
- Keep existing right-side DataPreviewPanel: click a mapping row to see that column's sample values, mapped field info, required/optional status
- Preview updates instantly when a mapping dropdown changes (already partially works via React state)
- Show inline data type mismatch warning in preview panel if sample values don't match the mapped field type (e.g., invalid enum values, text in number field)
- When no column is selected, show mapping summary stats (total columns, mapped count, required fields coverage) instead of empty state

### Upload-to-mapping flow
- Auto-advance to mapping step after successful AI analysis (~1s delay for user to see success banner)
- On AI failure: error banner with "Try again" button (re-triggers analysis on same file) + option to upload different file + option to proceed with all columns unmapped (per Phase 1.1 decision)
- Back button on mapping step returns to upload step for re-uploading — no inline re-upload on mapping step
- Next button on mapping step is disabled if required fields (companyName, status) are not mapped — shows "Map required fields to continue" message

### Claude's Discretion
- Exact auto-advance delay timing (0.5-1.5s range)
- Summary banner visual design and layout
- Data type mismatch detection logic (which types to check, tolerance for edge cases)
- Human-readable header name generation logic (camelCase to Title Case, handling dot-namespaced fields)
- Animation/transition when auto-advancing between steps

</decisions>

<specifics>
## Specific Ideas

- Template download is contextual — lives right where users are thinking about file format, not buried in a separate guide
- Confidence display is binary (High/Low) not granular — users don't need to distinguish 72% from 85%
- Manual override gets a checkmark, creating a clear "reviewed" signal distinct from AI suggestions
- Preview panel serves dual purpose: column detail when selected, mapping summary when not

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CsvUploadZone` (`clients/components/csv-upload-zone.tsx`): Drag-drop upload with file/size validation — add template download link below it
- `CsvSchemaGuide` (`clients/components/csv-schema-guide.tsx`): Field reference — template download NOT here (user chose upload zone)
- `StepMapColumns` (`clients/import/components/step-map-columns.tsx`): Two-panel layout (mapping list + preview panel) — add summary banner above mapping list
- `ColumnMappingRow` (`clients/import/components/column-mapping-row.tsx`): Mapping row with Select dropdown — add confidence indicator
- `DataPreviewPanel` (`clients/import/components/data-preview-panel.tsx`): Right-side preview — enhance empty state with summary stats, add type mismatch warnings
- `useImportWizard` hook (`clients/import/hooks/use-import-wizard.ts`): Manages wizard state — add auto-advance logic after analysis success
- `CLIENT_SCHEMA_FIELDS` (`types/csv-import.ts`): Schema definition — use to generate template CSV dynamically
- `getFieldsByGroup()` (`types/csv-import.ts`): Groups fields by client/contact/property — useful for template header organization

### Established Patterns
- URL-synced step navigation via `useSearchParams` and `router.replace` in useImportWizard
- Mapping state managed in useImportWizard hook, passed to StepMapColumns as props
- `__skip__` sentinel value for "Do not import" columns
- FieldMapping type includes `confidence` number field (already in the type, just not displayed)

### Integration Points
- `StepUpload` receives `onFileSelect` callback — template download is a separate action (no callback needed)
- `ColumnMappingRow` needs new prop for confidence score display
- `DataPreviewPanel` needs enhancement for type mismatch detection and summary stats empty state
- `useImportWizard.handleFileSelect` — add auto-advance to mapping step after successful analysis
- `import-wizard.tsx` — add canContinue logic for required field mapping validation on map step

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-upload-and-mapping*
*Context gathered: 2026-03-15*
