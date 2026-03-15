---
phase: 02-upload-and-mapping
plan: 04
subsystem: ui
tags: [react, tailwind, csv-import, validation, ux]

# Dependency graph
requires:
  - phase: 02-upload-and-mapping
    provides: floating required-field banner and mapping step UI
provides:
  - inline required-field validation indicators in mapping step
  - unmappedRequiredFields computation as reusable Set
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline validation: display field-level errors contextually rather than floating banners"

key-files:
  created: []
  modified:
    - apps/web/src/app/(workspace)/clients/import/components/import-wizard.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-map-columns.tsx

key-decisions:
  - "Extracted unmappedRequiredFields as separate useMemo for prop passing and reuse in canContinue"

patterns-established:
  - "Inline validation pattern: contextual warning blocks with field-name badges replace floating generic banners"

requirements-completed: [MAP-03]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 02 Plan 04: Inline Required-Field Validation Summary

**Replaced floating generic banner with inline warning block listing each unmapped required field by name with red "Required" badges**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T15:13:23Z
- **Completed:** 2026-03-15T15:15:46Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed floating "Map required fields to continue" banner from import-wizard.tsx
- Added inline warning block in step-map-columns.tsx that lists each unmapped required field with a red "Required" badge
- Extracted unmappedRequiredFields computation as a separate useMemo, passed as prop to StepMapColumns
- Warning block appears below MappingSummaryBanner and auto-hides when all required fields are mapped

## Task Commits

Each task was committed atomically:

1. **Task 1: Compute unmapped required fields and render inline validation** - `67b82ad` (feat)

## Files Created/Modified
- `apps/web/src/app/(workspace)/clients/import/components/import-wizard.tsx` - Extracted unmappedRequiredFields Set, removed floating banner, passed new prop
- `apps/web/src/app/(workspace)/clients/import/components/step-map-columns.tsx` - Added unmappedRequiredFields prop and inline warning block with field-name badges

## Decisions Made
- Extracted unmappedRequiredFields as separate useMemo (rather than computing inline in canContinue) for clean prop passing to StepMapColumns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT test 6 gap (inline required-field validation) is now addressed
- All existing UAT tests (1-5, 7-8) should remain unaffected as Continue button disable logic is unchanged

---
*Phase: 02-upload-and-mapping*
*Completed: 2026-03-15*

## Self-Check: PASSED
