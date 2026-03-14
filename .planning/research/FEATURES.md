# Features Research: CSV Import Wizard

**Research Date:** 2026-03-14
**Confidence:** HIGH

## Table Stakes (Must Have)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| File upload with drag-and-drop | Low | Already built |
| Column mapping (manual) | Medium | Users must be able to override AI suggestions |
| Data preview before import | Low | Show what will be imported |
| Per-row error reporting | Medium | Show exactly which rows failed and why |
| Template CSV download | Low | Human-readable headers, schema-derived |
| Progress indicator during import | Low | Users need feedback on long operations |
| Import results summary | Low | X succeeded, Y failed, Z skipped |

## Differentiators (Competitive Advantage)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| AI-powered column mapping | Already built | GPT-4o via Mastra — competitors require exact header match or manual mapping |
| Per-row duplicate detection with skip/merge choice | Medium | Jobber's only guidance is "make sure names match." User-controlled resolution is rare |
| Flat-column contact import | Medium | Import contacts alongside client data in one step |
| Embedded onboarding import | Medium | 40% of users take "import my data" path when offered during onboarding |
| Schema-driven field definitions | Low | Auto-generate template and validation from Convex schema |

## Anti-Features (Do NOT Build)

| Feature | Why Not |
|---------|---------|
| Auto-merge duplicates | Silent data corruption — users must choose per-row |
| Real-time cell editing in review table | Turns wizard into spreadsheet editor — scope explosion |
| Excel (.xlsx) import | Scope creep — CSV covers 95% of use cases |
| Partial import (valid rows succeed, invalid skip) | P2 — all-or-nothing is acceptable for v1 with good error reporting |
| Multi-row contact grouping | Complex parsing, flat columns cover the standard export pattern |

## Competitor Analysis

| Feature | Jobber | Housecall Pro | HubSpot | OneTool (Target) |
|---------|--------|--------------|---------|-----------------|
| CSV upload | Yes | Yes | Yes | Yes |
| AI column mapping | No | No | No | **Yes** |
| Duplicate detection | No | No | Yes (basic) | **Yes (fuzzy)** |
| Template download | Yes | Yes | Yes | Yes |
| Contact import | Separate | No | Yes | **Yes (same step)** |
| Onboarding import | No | No | Yes | **Yes** |

## Feature Dependencies

```
Template CSV ← Schema field definitions
Column mapping ← File upload + AI analysis
Duplicate detection ← Column mapping (need company name mapped) + Client list query
Contact import ← Column mapping (need contact fields mapped) + Backend mutation
Review step ← Duplicate detection + per-row validation
Import execution ← Review step approval
Onboarding embed ← Full wizard working
Analytics ← All steps (instrument throughout)
```

## MVP Definition

**Must ship together:**
1. Upload with template download
2. AI mapping with manual overrides
3. Review with duplicate flags
4. Import with per-row results
5. Replace old modal

**Can ship separately (fast follow):**
- Onboarding embed
- Contact import
- PostHog analytics
