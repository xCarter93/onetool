# Architecture Research: CSV Import Wizard

**Research Date:** 2026-03-14
**Confidence:** HIGH

## Component Architecture

### State Management: `useImportWizard` Hook

All wizard state lives in a single hook. Step components are pure props consumers.

```
useImportWizard()
├── file state (raw file, parsed rows, headers)
├── mapping state (AI suggestions, user overrides)
├── review state (duplicate flags, user decisions per row)
├── import state (progress, results, errors)
└── step navigation (current step, can-advance guards)
```

**Why one hook:** The current `CsvImportSheet` has 8 coordinated `useState` fields that all need reset together. A single hook with explicit action functions prevents state desync.

### Component Boundaries

```
ImportWizardPage (route: /clients/import)
├── ImportStepNav (breadcrumb navigation)
├── ImportWizard (orchestrator, uses useImportWizard)
│   ├── StepUpload (file drop, template download)
│   ├── StepMapColumns (AI mapping + manual overrides)
│   ├── StepReview (duplicate detection, per-row decisions)
│   └── StepPreviewImport (execute + results)
└── DataPreviewPanel (side panel, updates as mapping changes)
```

**Embedded variant:** Same `ImportWizard` with `embedded?: boolean` prop + `onComplete` callback. Onboarding wrapper is a thin shell around the same wizard.

### Presentational Components

- `ColumnMappingRow` — single column mapping with dropdown + confidence
- `DuplicateResolver` — per-row skip/merge choice UI
- `RowReviewTable` — virtualized table for large datasets
- `ImportResultsSummary` — success/fail/skip counts

## Data Flow

```
1. File upload
   → PapaParse extracts headers + all rows (client-side)
   → Headers + sample rows sent to /api/analyze-csv (Mastra)
   → AI returns field mappings with confidence scores

2. Column mapping
   → User reviews/overrides AI suggestions (client-side only)
   → Mapped data preview updates in real-time

3. Review
   → Fetch org client names via clients.listNamesForOrg (lightweight Convex query)
   → Fuse.js fuzzy match each row's company name against existing clients
   → Duplicates flagged, user chooses skip/import per row
   → Zod validates each row against schema, errors displayed per-row

4. Import
   → clients.bulkCreate with validated rows → returns { success, id }[] per row
   → For rows with contact columns: clientContacts.bulkCreate with returned client IDs
   → Per-row results displayed (success/fail/skipped)
```

## New Backend Requirements

### 1. `clients.listNamesForOrg` (query)
- Returns `{ _id, companyName }[]` only
- Uses existing `by_org` index
- Needed for duplicate detection without loading full client records

### 2. `clientContacts.bulkCreate` (mutation)
- Accepts array of `{ clientId, firstName, lastName, email, phone, isPrimary }`
- Creates contacts linked to newly-imported client IDs
- Needed because current `create` is single-record only

### 3. `clients.bulkCreate` updates
- Add plan-limit pre-check (currently bypassed)
- Accept and pass through contact data for sequential creation
- Chunk into batches of 50 for Convex mutation limits

## Build Order (Dependencies)

| Order | Component | Depends On | Can Parallel With |
|-------|-----------|------------|-------------------|
| 1 | `useImportWizard` hook + wizard layout | Nothing | — |
| 2 | `clients.listNamesForOrg` query | Nothing | Step 1 |
| 3 | Step 1: Upload + template download | Hook (step 1) | Step 2 |
| 4 | Step 2: AI mapping + overrides | Hook + upload step | — |
| 5 | Step 3: Review + duplicate detection | Hook + Convex query + fuse.js | — |
| 6 | `clientContacts.bulkCreate` mutation | Nothing | Steps 3-5 |
| 7 | Step 4: Import execution + results | All steps + both mutations | — |
| 8 | Replace old modal, update entry points | Full wizard working | — |
| 9 | Onboarding embedded version | Full wizard working | Step 8 |
| 10 | PostHog analytics instrumentation | All steps | Step 8-9 |
| 11 | Delete old modal components | New wizard deployed | — |

## Embedding Strategy

```typescript
// Full page version
<ImportWizardPage />  // Route: /clients/import

// Onboarding embedded version
<ImportWizard
  embedded={true}
  onComplete={(results) => advanceOnboarding()}
  onSkip={() => advanceOnboarding()}
/>
```

Differences in embedded mode:
- No page header/breadcrumbs (onboarding provides its own)
- Skip button always visible
- Simplified step nav (progress dots instead of breadcrumbs)
- `onComplete` fires instead of navigating to /clients
