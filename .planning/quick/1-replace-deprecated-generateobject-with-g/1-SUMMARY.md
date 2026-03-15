---
phase: quick
plan: 1
subsystem: ai
tags: [ai-sdk, generateText, mastra, csv-import, tailwind]

requires:
  - phase: 01.1
    provides: mapSchemaTool with generateObject pattern
provides:
  - "mapSchemaTool migrated to AI SDK 6.0 generateText + Output.object pattern"
  - "Preview table horizontal overflow fix in CSV import wizard"
affects: [csv-import, mastra-tools]

tech-stack:
  added: []
  patterns: ["generateText + Output.object for AI SDK 6.0 structured output"]

key-files:
  created: []
  modified:
    - apps/web/src/mastra/tools/map-schema-tool.ts
    - apps/web/src/mastra/tools/map-schema-tool.test.ts
    - apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx

key-decisions:
  - "Used Output.object wrapper with null guard for generateText nullable return type"

patterns-established:
  - "generateText + Output.object: AI SDK 6.0 pattern for structured LLM output with null safety"

requirements-completed: [QUICK-01]

duration: 2min
completed: 2026-03-15
---

# Quick Task 1: Replace Deprecated generateObject Summary

**Migrated mapSchemaTool to AI SDK 6.0 generateText + Output.object pattern and fixed CSV import preview table overflow**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T13:13:48Z
- **Completed:** 2026-03-15T13:15:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced deprecated generateObject with generateText + Output.object (AI SDK 6.0)
- Added null output guard for generateText nullable return type
- Updated all 9 test mocks and assertions to match new API
- Fixed preview table horizontal overflow with min-w-0 on outer container

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate map-schema-tool from generateObject to generateText + Output.object** - `5c67543` (feat)
2. **Task 2: Fix preview table horizontal overflow** - `02790ea` (fix)

## Files Created/Modified
- `apps/web/src/mastra/tools/map-schema-tool.ts` - Replaced generateObject with generateText + Output.object, added null output guard
- `apps/web/src/mastra/tools/map-schema-tool.test.ts` - Updated all mocks from generateObject to generateText, changed resolved value key from object to output
- `apps/web/src/app/(workspace)/clients/import/components/step-preview-import.tsx` - Added min-w-0 to outer container to bound table width

## Decisions Made
- Used Output.object wrapper with explicit null guard (throw on null output) to handle generateText's nullable return, which feeds into the existing try/catch for llmFailed fallback

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

---
*Quick Task: 1*
*Completed: 2026-03-15*
