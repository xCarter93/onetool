# Category → source surfaces

Starting points for verifying each help category's claims. Globs are deliberately coarse — confirm exact files with `graphify query`, glob, or grep before drawing conclusions, and update this map when surfaces move.

| Category | Web surfaces | Backend surfaces |
|---|---|---|
| getting-started | `apps/web/src/app/(onboarding)/**`, `apps/web/src/components/layout/**`, plus the per-feature surfaces below for the steps each article walks through | `packages/backend/convex/organizations*.ts`, `packages/backend/convex/lib/permissions.ts` |
| clients | `apps/web/src/app/(workspace)/clients/**` | `packages/backend/convex/clients*.ts`, client contacts/properties modules |
| projects-and-tasks | `apps/web/src/app/(workspace)/projects/**`, `apps/web/src/app/(workspace)/tasks/**` | `packages/backend/convex/projects*.ts`, `packages/backend/convex/tasks*.ts` |
| quotes | `apps/web/src/app/(workspace)/quotes/**` | `packages/backend/convex/quotes*.ts`, BoldSign e-signature modules |
| invoices-and-payments | `apps/web/src/app/(workspace)/invoices/**` | `packages/backend/convex/invoices*.ts`, payments modules, Stripe webhook in `packages/backend/convex/http.ts` |
| client-portal | portal route group + `apps/web/src/lib/portal/**` | portal auth/payment modules |
| inbox | `apps/web/src/app/(workspace)/inbox/**` | email/inbox modules (Resend send + inbound) |
| automations | `apps/web/src/app/(workspace)/automations/**` | automation engine + `eventBus.ts` |
| ai-assistant | `apps/web/src/components/assistant/**` | `packages/backend/convex/assistantTools.ts`, `assistantAgent.ts` |
| routing | `apps/web/src/app/(workspace)/routing/**` | routes/routing modules (Mapbox) |
| reports | `apps/web/src/app/(workspace)/reports/**` | report/aggregate modules |
| community | `apps/web/src/app/(workspace)/community/**`, public page `apps/web/src/app/communities/[slug]/**`, `apps/web/src/app/api/communities/**` | `packages/backend/convex/community*.ts` (pages, leads, analytics) |
| settings-and-team | `apps/web/src/app/(workspace)/organization/**`, `apps/web/src/app/(workspace)/clients/import/quickbooks/**` | `packages/backend/convex/organizations*.ts`, `lib/permissions.ts`, Clerk billing sync, `packages/backend/convex/quickbooks*.ts` + `lib/quickbooks*.ts` (sync engine, import, mappers) |
| mobile-app | — | — (audit against `apps/mobile/**`) |

Cross-cutting claims:

- Plan availability ("Business plan") → `packages/backend/convex/lib/permissions.ts` and plan-gate UI.
- Permission lines ("Admins can…") → RBAC checks in the relevant mutations and `lib/permissions.ts`.
- Portal behavior → what `apps/web/src/lib/portal/**` and the portal routes actually render.
