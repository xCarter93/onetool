# Client Import Redesign

## What This Is

A complete redesign of OneTool's client import functionality — replacing the current modal-based CSV import sheet with a full-page, multi-step wizard. The new import experience supports smarter column mapping (AI-assisted), duplicate detection, contact/property import from flat CSV columns, and a downloadable template CSV. It will be the sole import entry point across the clients page and a simplified embedded version in onboarding.

## Core Value

Users can reliably import their existing client data into OneTool with minimal manual effort — the import wizard guides them through mapping, flags issues before they commit, and gets their data in correctly on the first try.

## Requirements

### Validated

- ✓ CSV file upload with drag-and-drop — existing
- ✓ AI-powered column mapping via Mastra/GPT-4o agent — existing
- ✓ Bulk client creation backend mutation (`clients.bulkCreate`) — existing
- ✓ Premium feature gating for import — existing
- ✓ Basic 4-step wizard UI scaffolding (upload, map, review, preview) — existing on `client-import-page` branch

### Active

- [ ] Complete the 4-step import wizard end-to-end (all steps wired up with real data)
- [ ] AI column mapping with user-editable overrides in step 2
- [ ] Review step that flags duplicates and lets user skip or merge per-row
- [ ] Flat-column contact/property import (contact name, email, phone as CSV columns alongside client data)
- [ ] Downloadable template CSV with human-readable column headers derived from schema
- [ ] Schema-driven field definitions (pull required/optional fields from schema, exclude system fields like IDs)
- [ ] Replace old modal import sheet on clients page with link/redirect to new wizard
- [ ] Embedded simplified import version within onboarding flow
- [ ] PostHog analytics tracking for import started, completed, and key steps
- [ ] Per-row error reporting so users see exactly what failed and why
- [ ] Duplicate detection during import (match on company name or other key fields)

### Out of Scope

- Project import — deferred, current UI shows "Coming soon"
- Multi-row contact import (one client across multiple rows) — flat columns only for v1
- Auto-merge duplicates without user confirmation — users must choose
- Mobile app import — web only

## Context

- The redesign is already in progress on the `client-import-page` branch with initial wizard scaffolding
- Current modal implementation lives in `apps/web/src/app/(workspace)/clients/components/csv-import-*.tsx`
- New wizard lives at `apps/web/src/app/(workspace)/clients/import/`
- Backend CSV analysis uses Mastra agent (`apps/web/src/mastra/agents/csv-import-agent.ts`) calling GPT-4o
- Mastra tools handle parsing (`parse-csv-tool.ts`), mapping (`map-schema-tool.ts`), and validation (`validate-data-tool.ts`)
- Client schema fields are defined in `apps/web/src/types/csv-import.ts` as `CLIENT_SCHEMA_FIELDS`
- Onboarding flow exists at `apps/web/src/app/(workspace)/onboarding/` — import needs to embed within it
- Existing `bulkCreate` mutation creates clients one-by-one in a loop; may need updates for contacts/properties/duplicates
- PostHog events `CSV_IMPORT_STARTED` and `CSV_IMPORT_COMPLETED` are defined but not currently tracked in UI

## Constraints

- **Tech stack**: Must use existing Convex backend, Mastra AI agent, and Next.js frontend patterns
- **Premium gating**: Import remains a premium-only feature
- **Schema source of truth**: Template CSV and field definitions should derive from `packages/backend/convex/schema.ts` to stay in sync
- **Backward compatibility**: Old import modal can be removed once new wizard is fully functional

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full-page wizard over modal | More space for multi-step flow, better UX for complex data mapping | — Pending |
| Keep AI mapping (Mastra/GPT-4o) | Already built and working, just needs polish | — Pending |
| Flat columns for contacts | Simpler CSV format, most common export pattern from other tools | — Pending |
| User-driven duplicate resolution | Prevents data loss, gives user control over merge vs skip | — Pending |
| Schema-derived template CSV | Stays in sync with backend schema automatically | — Pending |
| Embedded onboarding version | Streamlined experience without navigating away from onboarding | — Pending |

---
*Last updated: 2026-03-14 after initialization*
