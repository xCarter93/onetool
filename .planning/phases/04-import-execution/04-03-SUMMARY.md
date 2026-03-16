---
phase: 04-import-execution
plan: 03
subsystem: ui
tags: [nextjs, react, csv-import, cleanup]

# Dependency graph
requires:
  - phase: 04-02
    provides: Import wizard at /clients/import with batched execution
provides:
  - Single import entry point at /clients/import with no old modal code
  - Clean onboarding page with simple link to import wizard
affects: [05-contact-import]

# Tech tracking
tech-stack:
  added: []
  patterns: [navigation-based import entry instead of modal]

key-files:
  created: []
  modified:
    - apps/web/src/app/(workspace)/clients/page.tsx
    - apps/web/src/app/(workspace)/organization/complete/page.tsx
  deleted:
    - apps/web/src/app/(workspace)/clients/components/csv-import-sheet.tsx
    - apps/web/src/app/(workspace)/clients/components/csv-import-step.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx

key-decisions:
  - "Simple link stub in onboarding page -- Phase 5 will build full embedded import experience"

patterns-established:
  - "Import entry via router.push navigation instead of inline modal"

requirements-completed: [INT-01, INT-04]

# Metrics
duration: 3min
completed: 2026-03-16
---

# Phase 04 Plan 03: Remove Old Modal Import Summary

**Replaced old modal CSV import with router navigation to /clients/import wizard, deleted 3 superseded component files**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T00:01:50Z
- **Completed:** 2026-03-16T00:04:48Z
- **Tasks:** 2
- **Files modified:** 5 (2 modified, 3 deleted)

## Accomplishments
- Import button on /clients page now navigates to /clients/import instead of opening modal
- Onboarding page uses simple link to import wizard instead of embedded CsvImportStep
- Deleted csv-import-sheet.tsx, csv-import-step.tsx, and step-preview-import.tsx (995 lines removed)
- All CSV import handler functions and state removed from onboarding page

## Task Commits

Each task was committed atomically:

1. **Task 1: Redirect import button and remove modal from clients page** - `249683f` (feat)
2. **Task 2: Delete old import modal component files** - `31446e0` (chore)

## Files Created/Modified
- `apps/web/src/app/(workspace)/clients/page.tsx` - Import button navigates to wizard, modal references removed
- `apps/web/src/app/(workspace)/organization/complete/page.tsx` - Simple link to /clients/import replaces CsvImportStep
- `apps/web/src/app/(workspace)/clients/components/csv-import-sheet.tsx` - DELETED
- `apps/web/src/app/(workspace)/clients/components/csv-import-step.tsx` - DELETED
- `apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx` - DELETED

## Decisions Made
- Simple link stub in onboarding page rather than full embedded experience -- Phase 5 (INT-02) will build the proper embedded import

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Old import code fully removed, single entry point at /clients/import
- Phase 5 can build embedded import experience for onboarding without conflicts

---
*Phase: 04-import-execution*
*Completed: 2026-03-16*
