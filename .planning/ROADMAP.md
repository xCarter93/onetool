# Roadmap: Client Import Wizard Redesign

## Overview

The import wizard is built in strict dependency order. Phase 1 fixes pre-existing bugs and creates the shared state hook and backend functions that every subsequent step depends on. Phases 2-4 build the four wizard steps sequentially — each step's output feeds the next, so they cannot be parallelized. Phase 5 adds the fast-follow features (onboarding embed, contact import, analytics) that require the full wizard to be working before they can layer on top.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Wizard hook, layout, backend functions, pre-existing bug fixes, and UAT gap closure
- [ ] **Phase 2: Upload and Mapping** - File upload step and AI column mapping step wired end-to-end
- [ ] **Phase 3: Review** - Duplicate detection, per-row validation, and plan limit pre-check
- [ ] **Phase 4: Import Execution** - Import step with progress, results, and old modal replacement
- [ ] **Phase 5: Fast Follows** - Onboarding embed, contact import, and analytics instrumentation

## Phase Details

### Phase 1: Foundation
**Goal**: The wizard has a working shell with all infrastructure in place — state hook, step navigation, backend queries/mutations, and every pre-existing bug fixed before any step UI is built
**Depends on**: Nothing (first phase)
**Requirements**: UPLD-02, UPLD-03, MAP-04, MAP-05, MAP-06
**Success Criteria** (what must be TRUE):
  1. The `/clients/import` route renders a multi-step wizard shell with step navigation that advances and retreats between steps
  2. The `analyze-csv` API route requires authentication — unauthenticated requests receive a 401 and no AI call is made
  3. PapaParse parses all CSV values as strings — a phone number like `07911123456` is not converted to a number
  4. The AI route receives only headers and sample rows, not full CSV content, and has `maxDuration` set to prevent Vercel timeouts
  5. The `clients.listNamesForOrg` Convex query and `clientContacts.bulkCreate` mutation exist and are callable
  6. The CSV mapper recognizes contact fields (first name, last name, email, phone) and property fields (address, city, state, zip code) from uploaded CSVs
**Plans:** 4 plans (2 complete, 2 gap closure)

Plans:
- [x] 01-01-PLAN.md — Cherry-pick wizard files, extract useImportWizard hook, fix pre-existing bugs
- [x] 01-02-PLAN.md — Add clients.listNamesForOrg query and verify clientContacts.bulkCreate
- [x] 01-03-PLAN.md — Gap closure: replace Mastra agent loop with direct tool calls, add frontend timeout
- [ ] 01-04-PLAN.md — Gap closure: add contact/property fields to schema mapper and group UI dropdown

### Phase 01.1: Leverage Mastra tool call for column mapping (INSERTED)

**Goal:** Replace deterministic synonym/substring column mapping with LLM-powered mapping via AI SDK generateObject and GPT-5 nano, keeping the tool's external interface unchanged
**Requirements**: None (inserted urgent phase)
**Depends on:** Phase 1
**Plans:** 2/2 plans complete

Plans:
- [x] 01.1-01-PLAN.md — Rewrite mapSchemaTool internals with generateObject LLM call, delete deterministic code, add unit tests
- [ ] 01.1-02-PLAN.md — Gap closure: fix silent LLM failure signaling and csv-import-sheet API contract mismatch

### Phase 2: Upload and Mapping
**Goal**: Users can upload a CSV file, receive AI column mapping suggestions with real confidence scores, manually override any mapping, and see a live preview of the mapped data before proceeding
**Depends on**: Phase 1
**Requirements**: UPLD-01, UPLD-04, UPLD-05, MAP-01, MAP-02, MAP-03
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop or click to upload a .csv file, with validation rejecting oversized or non-CSV files
  2. User can download a template CSV with human-readable headers derived from the schema
  3. User can view an inline schema guide listing which fields are required vs optional with expected data types
  4. After upload, each CSV column shows an AI-suggested field mapping with a real per-field confidence score (not a hardcoded 0.8)
  5. User can override any column mapping via a dropdown and see the data preview panel update immediately to reflect the change
**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — Utility functions (template CSV, confidence state, type mismatch) with tests + upload step enhancements
- [ ] 02-02-PLAN.md — Auto-advance, manual override tracking, confidence indicators, summary banner, and preview panel enhancements

### Phase 3: Review
**Goal**: Users can inspect all rows before committing — seeing validation errors per row, duplicate flags with skip/import choice per flagged row, and a plan limit warning if the import would exceed their quota
**Depends on**: Phase 2
**Requirements**: REV-01, REV-02, REV-03, REV-04, REV-05
**Success Criteria** (what must be TRUE):
  1. Each invalid row shows the exact field name and reason for the error (e.g., "email: must be a valid email address")
  2. User sees a warning before proceeding if importing would exceed their plan's client limit
  3. Rows that fuzzy-match existing client names are flagged as potential duplicates, with a per-row toggle to skip or import that row
  4. The review table renders without lag for files with 100+ rows (virtualized scrolling)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Import Execution
**Goal**: Users can commit the import and see exactly what happened — progress during the operation, and a per-row result for every row showing success, failure with reason, or skipped — and the old modal import is gone
**Depends on**: Phase 3
**Requirements**: IMP-01, IMP-02, IMP-03, INT-01, INT-04
**Success Criteria** (what must be TRUE):
  1. During import, a visible progress indicator shows how many rows have been processed out of the total
  2. After import completes, each row shows its outcome: succeeded, failed (with the reason), or skipped as a duplicate
  3. The `bulkCreate` mutation enforces plan limits server-side — an import that would exceed limits is rejected even if the pre-check was bypassed
  4. The clients page no longer shows the old modal CSV import sheet — the import entry point links to the new wizard
  5. The old modal import component files have been deleted from the codebase
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Fast Follows
**Goal**: The wizard is reachable from onboarding, supports importing contact data alongside clients from flat CSV columns, and all wizard steps emit PostHog events for funnel analysis
**Depends on**: Phase 4
**Requirements**: IMP-04, IMP-05, INT-02, INT-03
**Success Criteria** (what must be TRUE):
  1. From the onboarding flow, user can access a simplified embedded version of the import wizard without leaving the onboarding page
  2. A CSV with contact columns (contact name, email, phone) results in client contact records created for each imported client
  3. PostHog receives events for import started, each step transition, import completed, and import errors — visible in the PostHog dashboard
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 1.1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/4 | Gap closure | - |
| 1.1. LLM Column Mapping | 1/2 | Gap closure | - |
| 2. Upload and Mapping | 0/2 | Planned | - |
| 3. Review | 0/TBD | Not started | - |
| 4. Import Execution | 0/TBD | Not started | - |
| 5. Fast Follows | 0/TBD | Not started | - |
