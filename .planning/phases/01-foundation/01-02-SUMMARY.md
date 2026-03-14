---
phase: 01-foundation
plan: 02
subsystem: api
tags: [convex, query, clients, contacts, csv-import]

# Dependency graph
requires:
  - phase: none
    provides: existing clients.ts and clientContacts.ts patterns
provides:
  - clients.listNamesForOrg query for duplicate detection
  - clientContacts.bulkCreate confirmed callable for contact import
affects: [03-mapping, 05-contact-import]

# Tech tracking
tech-stack:
  added: []
  patterns: [lightweight projection query returning only needed fields]

key-files:
  created: []
  modified:
    - packages/backend/convex/clients.ts
    - packages/backend/convex/clients.test.ts
    - packages/backend/convex/clientContacts.ts

key-decisions:
  - "Used getOptionalOrgId (not getCurrentUserOrgId) for listNamesForOrg to match existing list query pattern"
  - "Excluded archived clients from listNamesForOrg since they should not trigger duplicate warnings during import"

patterns-established:
  - "Lightweight projection query: query full docs then .map() to return only needed fields"

requirements-completed: [UPLD-02, UPLD-03, MAP-04, MAP-05]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 1 Plan 2: Backend Queries for CSV Import Summary

**Lightweight clients.listNamesForOrg query for duplicate detection and clientContacts.bulkCreate confirmed for Phase 5 contact import**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-14T20:48:52Z
- **Completed:** 2026-03-14T20:50:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added clients.listNamesForOrg query returning only {_id, companyName} per client, org-scoped and excluding archived
- 4 new tests covering empty state, field projection, org isolation, and archived exclusion
- Removed deletion TODO from clientContacts.bulkCreate confirming it as needed for Phase 5
- All 343 backend tests passing (22 test files)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests for listNamesForOrg** - `1727d79` (test)
2. **Task 1 (GREEN): Implement listNamesForOrg query** - `04b0967` (feat)
3. **Task 2: Remove bulkCreate deletion TODO** - `7533729` (chore)

_Note: Task 1 used TDD with RED/GREEN commits._

## Files Created/Modified
- `packages/backend/convex/clients.ts` - Added listNamesForOrg query (lightweight projection for duplicate detection)
- `packages/backend/convex/clients.test.ts` - Added 4 tests for listNamesForOrg (empty, projection, isolation, archived)
- `packages/backend/convex/clientContacts.ts` - Removed deletion TODO from bulkCreate, updated JSDoc

## Decisions Made
- Used getOptionalOrgId (not getCurrentUserOrgId) for listNamesForOrg to match existing list query pattern -- returns empty array instead of throwing when no auth context
- Excluded archived clients from listNamesForOrg since they should not trigger duplicate warnings during CSV import

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- clients.listNamesForOrg is ready for Phase 3 (mapping) to use for fuzzy duplicate matching
- clientContacts.bulkCreate is confirmed callable for Phase 5 (contact import)
- All backend tests continue to pass

## Self-Check: PASSED

All files verified present. All 3 task commits verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-14*
