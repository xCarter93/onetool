---
phase: 2
slug: upload-and-mapping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (edge-runtime environment) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm test:once` |
| **Full suite command** | `cd apps/web && pnpm test:once` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm test:once`
- **After every plan wave:** Run `cd apps/web && pnpm test:once && cd ../../packages/backend && pnpm test:once`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 0 | UPLD-04 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/template-csv.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 0 | MAP-01 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/confidence.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | 01 | 0 | MAP-03 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/type-mismatch.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UPLD-01 | unit | `cd apps/web && pnpm test:once` | ✅ | ⬜ pending |
| TBD | TBD | TBD | UPLD-04 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/template-csv.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UPLD-05 | manual | N/A | N/A | ⬜ pending |
| TBD | TBD | TBD | MAP-01 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/confidence.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MAP-02 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/confidence.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MAP-03 | unit | `cd apps/web && pnpm vitest run src/app/\(workspace\)/clients/import/utils/type-mismatch.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/(workspace)/clients/import/utils/template-csv.test.ts` — stubs for UPLD-04 (header generation, example values, CSV output)
- [ ] `src/app/(workspace)/clients/import/utils/confidence.test.ts` — stubs for MAP-01, MAP-02 (confidence state logic, manual override tracking)
- [ ] `src/app/(workspace)/clients/import/utils/type-mismatch.test.ts` — stubs for MAP-03 (type mismatch detection for enum/number fields)
- [ ] Extract pure utility functions (`fieldKeyToHeader`, `detectTypeMismatches`, `getConfidenceState`) into `utils/` files for independent testability

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Schema guide displays required/optional fields | UPLD-05 | Existing CsvSchemaGuide component, no changes needed — visual verification | Open import wizard, verify schema guide shows required vs optional with data types |
| Drag-and-drop upload interaction | UPLD-01 | Browser drag-and-drop events hard to simulate in unit tests | Drag a CSV file onto upload zone, verify acceptance; drag a .txt file, verify rejection |
| Auto-advance after analysis | UPLD-01 | Timing-dependent UI transition | Upload valid CSV, verify wizard auto-advances to mapping step after ~1s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
