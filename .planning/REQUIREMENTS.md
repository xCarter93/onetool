# Requirements: Client Import Wizard Redesign

**Defined:** 2026-03-14
**Core Value:** Users can reliably import their existing client data into OneTool with minimal manual effort

## v1 Requirements

### Upload & Parsing

- [x] **UPLD-01**: User can drag-and-drop or click to upload a .csv file with size validation
- [x] **UPLD-02**: System strips UTF-8 BOM before parsing to prevent header corruption
- [x] **UPLD-03**: System parses all CSV values as strings (no dynamicTyping) to preserve phone numbers
- [x] **UPLD-04**: User can download a template CSV with human-readable column headers derived from schema
- [x] **UPLD-05**: User can view an inline schema guide showing required/optional fields and expected data types

### Column Mapping

- [x] **MAP-01**: System auto-maps CSV columns to schema fields using AI (Mastra/GPT-4o) with real per-field confidence scores
- [x] **MAP-02**: User can manually override or remove any column mapping via dropdown
- [x] **MAP-03**: User can see a live data preview panel that updates as mappings change
- [x] **MAP-04**: System sends only headers + sample rows to AI (not full CSV content)
- [x] **MAP-05**: AI analysis route requires authentication and has maxDuration configured
- [x] **MAP-06**: Contact fields (name, email, phone) are recognized and mappable from flat CSV columns

### Review & Validation

- [x] **REV-01**: System validates each row against schema and displays per-row errors with field name and reason
- [x] **REV-02**: System pre-checks plan limits and warns user if import would exceed capacity (N/A: import is paid-only, limit check redundant)
- [x] **REV-03**: System detects potential duplicate clients using fuzzy matching (fuse.js) against existing org clients
- [x] **REV-04**: User can choose to skip or import each flagged duplicate row
- [x] **REV-05**: Review table is virtualized for performance with 100+ row files

### Import Execution

- [x] **IMP-01**: System imports clients in batches with a visible progress indicator
- [x] **IMP-02**: System displays per-row results (success, failed with reason, skipped as duplicate)
- [x] **IMP-03**: System enforces plan limits in bulkCreate mutation (not just pre-check)
- [ ] **IMP-04**: System creates client contacts from flat CSV columns after client records are created
- [ ] **IMP-05**: New clientContacts.bulkCreate mutation handles batch contact creation

### Integration

- [x] **INT-01**: Old modal CSV import sheet on clients page replaced with link to new wizard
- [ ] **INT-02**: Import wizard accessible from onboarding flow as embedded simplified version
- [ ] **INT-03**: PostHog tracks import started, step progression, completion, and errors
- [x] **INT-04**: Existing old import modal components removed after new wizard is deployed

## v2 Requirements

### Enhanced Import

- **ENH-01**: Partial import — valid rows succeed while invalid rows are skipped and reported
- **ENH-02**: Excel (.xlsx) file support
- **ENH-03**: Project import alongside client import
- **ENH-04**: Import history — view past imports with undo capability

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-merge duplicates | Silent data corruption risk — users must choose per-row |
| Real-time cell editing in review | Turns wizard into spreadsheet — scope explosion |
| Multi-row contact grouping | Complex parsing, flat columns cover standard export pattern |
| Mobile app import | Web only for v1 |
| Excel format support | CSV covers 95% of use cases, defer to v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UPLD-01 | Phase 2 | Complete |
| UPLD-02 | Phase 1 | Complete |
| UPLD-03 | Phase 1 | Complete |
| UPLD-04 | Phase 2 | Complete |
| UPLD-05 | Phase 2 | Complete |
| MAP-01 | Phase 2 | Complete |
| MAP-02 | Phase 2 | Complete |
| MAP-03 | Phase 2 | Complete |
| MAP-04 | Phase 1 | Complete |
| MAP-05 | Phase 1 | Complete |
| MAP-06 | Phase 2 | Complete |
| REV-01 | Phase 3 | Complete |
| REV-02 | Phase 3 | Complete (N/A) |
| REV-03 | Phase 3 | Complete |
| REV-04 | Phase 3 | Complete |
| REV-05 | Phase 3 | Complete |
| IMP-01 | Phase 4 | Complete |
| IMP-02 | Phase 4 | Complete |
| IMP-03 | Phase 4 | Complete |
| IMP-04 | Phase 5 | Pending |
| IMP-05 | Phase 5 | Pending |
| INT-01 | Phase 4 | Complete |
| INT-02 | Phase 5 | Pending |
| INT-03 | Phase 5 | Pending |
| INT-04 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 — phase mapping added after roadmap creation*
