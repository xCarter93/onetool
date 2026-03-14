---
phase: 01-foundation
plan: 01
subsystem: ui
tags: [csv-import, wizard, react-hooks, papaparse, clerk-auth, mastra-ai]

# Dependency graph
requires: []
provides:
  - Multi-step import wizard shell at /clients/import with step navigation
  - useImportWizard extracted hook for wizard state management
  - BOM-safe CSV parsing with dynamicTyping disabled
  - Auth-protected AI analysis endpoint with maxDuration
  - StyledStepBreadcrumbs shared UI component
affects: [02-step-polish, 03-validation, 04-import-execution, 05-contacts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook extraction: wizard state in useImportWizard, UI logic stays in component"
    - "Headers-only AI: send only headers + 5 sample rows to AI route, not full CSV"
    - "BOM stripping: charCodeAt(0) === 0xFEFF check before PapaParse"

key-files:
  created:
    - apps/web/src/app/(workspace)/clients/import/hooks/use-import-wizard.ts
    - apps/web/src/app/(workspace)/clients/import/components/import-wizard.tsx
    - apps/web/src/app/(workspace)/clients/import/components/import-step-nav.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-upload.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-map-columns.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-review-values.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx
    - apps/web/src/app/(workspace)/clients/import/components/column-mapping-row.tsx
    - apps/web/src/app/(workspace)/clients/import/components/data-preview-panel.tsx
    - apps/web/src/app/(workspace)/clients/import/utils/transform-csv.ts
    - apps/web/src/app/(workspace)/clients/import/page.tsx
    - apps/web/src/components/ui/styled/styled-breadcrumbs.tsx
  modified:
    - apps/web/src/app/api/analyze-csv/route.ts

key-decisions:
  - "Hook extraction keeps canContinue and footer buttons in the component, per user decision"
  - "dynamicTyping: false preserves all CSV values as strings, transformValue handles type coercion downstream"
  - "Auth uses Clerk auth() matching all 6 existing API routes in the project"

patterns-established:
  - "useImportWizard hook pattern: state + navigation + handlers extracted, UI logic stays in component"
  - "CSV safety: BOM strip + dynamicTyping false as standard for all CSV parsing"

requirements-completed: [UPLD-02, UPLD-03, MAP-04, MAP-05]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 1 Plan 1: Import Wizard Foundation Summary

**Cherry-picked 11 wizard files from branch, extracted useImportWizard hook, and fixed 4 pre-existing bugs (BOM, dynamicTyping, headers-only AI, auth + maxDuration)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T20:48:41Z
- **Completed:** 2026-03-14T20:53:41Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Cherry-picked 11 import wizard files from client-import-page branch onto staging
- Extracted useImportWizard hook with step navigation, file/analysis/mapping/import state, and action handlers
- Fixed BOM stripping to prevent header corruption from Excel-exported CSVs
- Fixed dynamicTyping: false to preserve phone numbers and zip codes as strings
- Changed AI route to receive only headers + 5 sample rows instead of full CSV content
- Added Clerk auth guard and maxDuration = 60 to analyze-csv API route

## Task Commits

Each task was committed atomically:

1. **Task 1: Cherry-pick wizard files and extract useImportWizard hook** - `6973545` (feat)
2. **Task 2: Fix pre-existing bugs** - `dc93e40` (fix)

## Files Created/Modified
- `apps/web/src/app/(workspace)/clients/import/hooks/use-import-wizard.ts` - Extracted wizard state hook with step navigation, file/analysis/mapping/import state
- `apps/web/src/app/(workspace)/clients/import/components/import-wizard.tsx` - Wizard shell consuming useImportWizard hook, owns canContinue + footer buttons + rendering
- `apps/web/src/app/(workspace)/clients/import/components/import-step-nav.tsx` - Step breadcrumb navigation using StyledStepBreadcrumbs
- `apps/web/src/app/(workspace)/clients/import/components/step-upload.tsx` - Upload step with CsvUploadZone and analysis status
- `apps/web/src/app/(workspace)/clients/import/components/step-map-columns.tsx` - Column mapping step with preview panel
- `apps/web/src/app/(workspace)/clients/import/components/step-review-values.tsx` - Review step with validation summary and mapping table
- `apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx` - Preview step with transformed data table and import trigger
- `apps/web/src/app/(workspace)/clients/import/components/column-mapping-row.tsx` - Individual column mapping row with schema field select
- `apps/web/src/app/(workspace)/clients/import/components/data-preview-panel.tsx` - Side panel showing sample values for selected column
- `apps/web/src/app/(workspace)/clients/import/utils/transform-csv.ts` - CSV parsing with BOM stripping and dynamicTyping: false
- `apps/web/src/app/(workspace)/clients/import/page.tsx` - Route entry with Suspense boundary and premium access check
- `apps/web/src/components/ui/styled/styled-breadcrumbs.tsx` - Step breadcrumb UI component
- `apps/web/src/app/api/analyze-csv/route.ts` - Auth-protected AI analysis endpoint with maxDuration and headers-only input

## Decisions Made
- Hook extraction keeps canContinue and footer button configuration in the component per user decision, not in the hook
- dynamicTyping: false preserves all CSV values as strings; transformValue() handles type coercion based on schema field data types downstream
- Auth uses Clerk auth() pattern matching all 6 existing API routes in the project

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wizard shell is fully functional with hook-based state management
- All 4 infrastructure bugs fixed: BOM stripping, dynamicTyping, headers-only AI, auth + maxDuration
- Step UI components are ready for polish and enhancement in subsequent plans
- TypeScript compiles cleanly with no errors

## Self-Check: PASSED

All 13 created/modified files verified present. Both task commits (6973545, dc93e40) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-14*
