---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via convex-test for backend, standard for web) |
| **Config file** | `packages/backend/vitest.config.ts` (backend), `apps/web/vitest.config.ts` (web) |
| **Quick run command** | `cd packages/backend && pnpm test:once` |
| **Full suite command** | `pnpm test` (from monorepo root, runs all via Turbo) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/backend && pnpm test:once`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | UPLD-02 | unit | `cd apps/web && pnpm vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | UPLD-03 | unit | `cd apps/web && pnpm vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | MAP-04 | unit | `cd apps/web && pnpm vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | MAP-05 | integration | `curl -X POST localhost:3000/api/analyze-csv` (manual) | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | N/A | unit | `cd packages/backend && pnpm vitest run clients.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | N/A | unit | `cd packages/backend && pnpm vitest run clientContacts.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend/convex/clients.test.ts` — add test for `listNamesForOrg` query
- [ ] Frontend unit tests for BOM stripping (`transform-csv.ts`) and `dynamicTyping: false` verification
- [ ] Verify `clientContacts.bulkCreate` test coverage in existing `clientContacts.test.ts`
- [ ] API route auth test for `analyze-csv` (401 on unauthenticated request)

*Existing infrastructure covers backend requirements; frontend util tests may need test config setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wizard step navigation advances/retreats | N/A | UI interaction | Navigate to `/clients/import`, click Next/Back buttons, verify URL updates and step renders |
| `maxDuration` export present on AI route | MAP-04 | Static config, not runtime | Inspect `apps/web/src/app/api/analyze-csv/route.ts` for `export const maxDuration = 60` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
