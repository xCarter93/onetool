---
phase: quick
plan: 3
subsystem: ui
tags: [react, import-wizard, step-merge, inline-editing]

requires:
  - phase: 02.1.1
    provides: editable cell state helpers and inline edit preview table
provides:
  - 3-step import wizard (Upload, Map columns, Review & Import)
  - Merged review + import step with import button and results mode
affects: [import-wizard, csv-import]

tech-stack:
  added: []
  patterns:
    - "StatusIcon component reused from step-preview-import as local component in step-review-values"
    - "isResultsMode toggle for dual-mode table (editable vs read-only)"

key-files:
  created: []
  modified:
    - apps/web/src/app/(workspace)/clients/import/components/import-step-nav.tsx
    - apps/web/src/app/(workspace)/clients/import/hooks/use-import-wizard.ts
    - apps/web/src/app/(workspace)/clients/import/components/import-wizard.tsx
    - apps/web/src/app/(workspace)/clients/import/components/step-review-values.tsx

key-decisions:
  - "StatusIcon copied as local component into step-review-values rather than extracting to shared module -- keeps change minimal"
  - "StickyFormFooter hidden entirely on review step since it manages its own import/results actions inline"

patterns-established:
  - "Review step self-contained: summary bar, filter tabs, editable table, import button, results mode all in one component"

requirements-completed: []

duration: 5min
completed: 2026-03-15
---

# Quick Task 3: Merge Review & Preview Import Steps Summary

**3-step import wizard merging review and preview into single "Review & Import" step with inline import button and results mode**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T20:37:39Z
- **Completed:** 2026-03-15T20:42:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Reduced import wizard from 4 steps to 3 (Upload, Map columns, Review & Import)
- Review step now includes import button with validation error gating and results mode
- StatusIcon shows per-row import success/warning/error after import completes
- step-preview-import.tsx is no longer referenced (kept on disk but unused)

## Task Commits

Each task was committed atomically:

1. **Task 1: Reduce step nav to 3 steps and update wizard hook** - `f4b9d3e` (feat)
2. **Task 2: Merge import functionality into step-review-values and update wizard** - `75c571b` (feat)

## Files Created/Modified
- `import-step-nav.tsx` - ImportStep type reduced to 3 values, label updated to "Review & Import"
- `use-import-wizard.ts` - STEP_ORDER reduced to 3 entries
- `import-wizard.tsx` - Removed StepPreviewImport import/case, passes import props to StepReviewValues, hides footer on review step
- `step-review-values.tsx` - Added StatusIcon component, import button with validation gating, results mode with read-only cells and "Go to Clients" link

## Decisions Made
- StatusIcon copied as local component into step-review-values rather than extracting to shared module -- keeps change minimal
- StickyFormFooter hidden entirely on review step since it manages its own import/results actions inline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Import wizard is fully functional with 3 steps
- step-preview-import.tsx can be deleted in a future cleanup task

---
*Quick Task: 3*
*Completed: 2026-03-15*
