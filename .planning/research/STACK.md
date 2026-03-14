# Stack Research: CSV Import Wizard

**Research Date:** 2026-03-14
**Confidence:** HIGH

## Existing Dependencies (Already in Project)

| Library | Version | Use in Wizard |
|---------|---------|---------------|
| papaparse | 5.5.2 | CSV parsing (upload + template generation) |
| zod | 3.x | Per-row validation with `safeParse` |
| @tanstack/react-table | 8.x | Data preview tables |
| framer-motion | 12.x | Step transitions |
| Mastra + GPT-4o | — | AI column mapping via `/api/analyze-csv` |

## New Dependencies Needed

### react-dropzone 15.0.0
- **Why:** Proper drag-and-drop file upload zone with accessibility. v15 supports React 19.
- **Confidence:** HIGH
- **Install:** `pnpm add react-dropzone -F @onetool/web`

### @tanstack/react-virtual 3.13.x
- **Why:** Virtualized scrolling for review table with 100+ rows. Project has react-table but not the virtual companion.
- **Confidence:** HIGH
- **Install:** `pnpm add @tanstack/react-virtual -F @onetool/web`

### fuse.js 7.1.0
- **Why:** Client-side fuzzy matching for duplicate detection. 3.6M weekly downloads, zero deps, configurable threshold. Match against Convex client list fetched at wizard mount.
- **Confidence:** HIGH
- **Install:** `pnpm add fuse.js -F @onetool/web`

## What NOT to Use

| Library | Why Not |
|---------|---------|
| UploadThing | CSV import is client-side only, no file hosting needed |
| zod-csv | Zod v4's native `safeParse` on arrays already includes row index in error paths |
| export-to-csv | `Papa.unparse([headers])` + Blob + anchor click is 10 lines — no library needed |
| Flatfile/OneSchema | Third-party import services — overkill, adds vendor dependency, OneTool already has Mastra |
| xlsx/exceljs | Scope is CSV only, not Excel format support |

## Template CSV Generation

No library needed. Pattern:
```typescript
const csv = Papa.unparse([headers]); // Headers only
const blob = new Blob([csv], { type: "text/csv" });
// Trigger download via anchor click
```

## Key Technical Notes

- Duplicate detection runs 100% client-side (fetch org client names via lightweight Convex query, compare with fuse.js)
- Template CSV generation is a pure utility — share between full wizard and onboarding variant
- All 4 wizard steps buildable with existing UI components (shadcn/ui + Radix)
