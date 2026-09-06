# Recurring projects QA — September 6, 2026

Tested commit `b6cc2917` on `staging`, using Chrome computer use against `http://localhost:3000`, organization **OneTool - Dev2**, timezone **America/New_York**, signed in as Patrick Carter. No product code changed during this run. This is a partial end-to-end run, not release sign-off.

## Fixtures and evidence

All mutations in the browser used new synthetic fixtures with explicit test-only wording. No customer emails, signature requests, payments, or permanent deletions were performed. Existing customer records were not edited.

- Client: **QA Recurring 2026-09-06**, `jn7657k7yzw86bmrrrhrbdagd58dx331`, email `recurring-qa@example.invalid`.
- [Originating project](http://localhost:3000/projects/kd7bcpmynxgwm3e2nqgenfpm4s8dx7e9): **QA Weekly Care — 5 visits**.
- [Series](http://localhost:3000/projects/series/sx732ex859zthk5dkx70kt304n8dx30h?fromProjectId=kd7bcpmynxgwm3e2nqgenfpm4s8dx7e9): weekly Sundays, September 6 through October 4, five occurrences. Left active after lifecycle checks.
- [Quote Q-000007](http://localhost:3000/quotes/kn79p4avdvfd0zs1xmccntj34s8dxzj8): **QA Weekly Agreement — $100 per visit**, Draft, prepared agreement revision 1, generated PDF v1. One $100 line; payment rule 50% on issue and 50% after 30 days. No signature or invoice.
- Task: **QA Inspect service area**, Pending on the originating project, September 6. No copies created.

## Browser results

| Check | Result | Observation |
| --- | --- | --- |
| New-project One-off → Recurring → One-off | Pass | Recurrence configuration appeared only for Recurring and disappeared on return to One-off. |
| Finite weekly creation | Pass | Exactly five dated projects: September 6, 13, 20, 27, October 4. Origin counted as the first visit. |
| Project/series links | Pass | Project sidebar opened the correct series with `fromProjectId`; **Back to QA Weekly Care — 5 visits** returned to the originating project. |
| Pause/resume | Pass for unstarted fixtures | Pause preview affected five and preserved zero. All five showed paused; Resume preview restored five and retained zero past cancellations. Series returned active. |
| Skip/restore | Pass | September 20 alone showed skipped and offered Restore; restoring returned its recurrence label to Recurring. |
| End/resume | Pass for unstarted fixtures | End preview affected five. Ended series visibly offered Resume series; resume preview restored five. Returned active on the original schedule. |
| Quote created from project | Pass | Correct client/project association, $100 line and total persisted. No reported Convex browser-function-import error was observed in this run. |
| Agreement preparation | Pass for initial setup | Prepared revision 1 from source quote. Series showed the pending revision and approval requirement. |
| Payment validation | Pass | An installment with 0% disabled setup and showed validation. A 50%/50% rule with days 0/30 was accepted. |
| Generated agreement PDF | Pass | Visually inspected the generated one-page PDF in Chrome. It included source quote/revision, scope, weekly five-visit schedule, timezone, billing per completed visit, and both payment installments. Test-only terms remained visible; no signature was fabricated. |
| Agreement discovery/removal | Fail / missing capability | No discard/withdraw/end-agreement action found. Series schedule editing was locked once an agreement was prepared. Generic quote Delete offered only a permanent-delete warning, with no agreement-specific explanation. Cancelled that dialog without deleting. |
| Quote actions after PDF generation | Blocked in walkthrough | More actions repeatedly failed to expose its menu, including a fresh tab. Signatures initially failed to switch, then worked after a fresh navigation; it showed no requests sent. No overlay or disabled state covered the sampled controls. Cause is unconfirmed; do not attribute it conclusively to PDF generation or product code. |
| Task creation | Pass | Created a Pending task from the project; it appeared on project and global Tasks views. |
| Task copy-forward | Blocked in walkthrough | The originating project's task row exposed Edit/Delete but no Copy to future projects. No propagation executed. Permissions/runtime consistency still needs investigation; automated component tests pass. |
| Agreement re-prepare, approval, inherited quotes, revisions, overrides | Not completed | Quote-action access blocked progression to the relevant workflow. Saved-term reset additionally found through code audit below. |
| Billing and shared monthly payment changes | Not completed through UI | No approved QA agreement or completed billed visit was established. Covered by targeted automated tests, not an end-to-end browser pass. |
| Live email, provider webhooks, client portal approval, in-person signing | Not run | No external delivery/signature performed. Requires a usable QA recipient/provider flow and completion of the blocked quote interaction. |
| Mobile, alternate roles/tenants, every cadence/date boundary, protected invoiced visits | Not run through UI | Remain in the reusable script; do not infer coverage from the simple five-visit fixture. |

Series occurrence status cells displayed blank/loading indicators while recurrence state labels and lifecycle controls worked. This also needs investigation. A fresh app load logged Clerk development and PostHog warnings; an earlier load logged a Clerk organization-switcher hydration mismatch. These have not been attributed to recurring projects.

## Confirmed gaps

1. **Agreement quote deletion leaves dangling references.** Isolated Convex tests reproduced this for Draft and Approved persisted agreement states. The source quote disappeared while series and agreement revision pointers still referenced it. Do not use ordinary quote deletion to remove agreements. See the characterization evidence in [the QA script](recurring-projects.md#characterization-test-report--agreement-source-deletion).
2. **Saved agreement payment terms are not restored by setup after remount.** Code audit found defaults of per-visit billing and 100% after 30 days; opening resets scope/cadence but does not hydrate the saved billing/payment rule. `getSetup` does not return those saved terms. This can replace an existing split when setup is resubmitted. Located in `apps/web/src/app/(workspace)/quotes/[quoteId]/components/recurring-agreement-setup-dialog.tsx` and `packages/backend/convex/projectSeriesAgreements.ts`. Not reproduced end to end because of the menu access issue.
3. **Agreement lifecycle is incomplete in the UI/API.** There is no general discard/withdraw/termination operation. Only current and pending summaries are exposed; superseded history is not browsable. A generic “Pending revision” label can describe the pending slot even while its quote is Draft; it does not establish that the customer received a signature request.

## Automated verification

- Backend: **13 files, 126 tests passed** covering series, lifecycle, tasks, quotes, agreements, controlled documents, recurring billing, payment proposals/schedules, and invoice split rules.
- Web: **9 files, 39 tests passed** covering visit billing, task setup, series UI, quote-copy gating/dialogs, PDF assembly, and portal quote behavior.
- Isolated deletion characterization: **2 tests passed by reproducing the defect**, not by validating safe deletion. The Approved case established approved database pointers in isolation; it did not fabricate live signature evidence.
- `git diff --check` passed. No product edits required a build.

Backend command from the repository root:

```sh
pnpm exec vitest run --config packages/backend/vitest.config.ts packages/backend/convex/projectSeries.test.ts packages/backend/convex/projectSeries.lifecycle.test.ts packages/backend/convex/projectSeriesTasks.test.ts packages/backend/convex/projectSeriesTasks.edges.test.ts packages/backend/convex/projectSeriesQuotes.test.ts packages/backend/convex/projectSeriesQuotes.edges.test.ts packages/backend/convex/projectSeriesAgreements.test.ts packages/backend/convex/recurringAgreementDocuments.test.ts packages/backend/convex/recurringBilling.test.ts packages/backend/convex/recurringPaymentChanges.test.ts packages/backend/convex/recurringPaymentSchedules.test.ts packages/backend/convex/invoices.recurringPaymentSchedule.test.ts packages/backend/convex/lib/recurringPaymentRules.test.ts
```

Web command from `apps/web`:

```sh
pnpm exec vitest run --config vitest.config.ts 'src/app/(workspace)/projects/components/recurring-visit-billing.test.tsx' 'src/app/(workspace)/projects/components/tabs/recurring-task-setup.test.tsx' 'src/app/(workspace)/projects/series/[seriesId]/page.test.tsx' 'src/app/(workspace)/quotes/[quoteId]/components/recurring-quote-copy-dialog.test.tsx' 'src/app/(workspace)/quotes/[quoteId]/components/recurring-quote-copy-gate.test.tsx' 'src/app/(workspace)/quotes/[quoteId]/components/build-quote-pdf-blob.test.tsx' 'src/components/portal/quotes/__tests__/quote-detail-island.download-pdf.test.tsx' 'src/components/portal/quotes/__tests__/quote-detail-island.test.tsx' 'src/components/portal/quotes/__tests__/quote-paper.test.tsx'
```

## Recommended agreement behavior

An agreement records customer approval of the service, price per visit, cadence/end condition, billing rhythm, and payment terms. It is neither an invoice nor autopay. Unchanged eligible visit quotes can inherit its approval; a different service or price needs fresh approval.

- **Unsent draft:** provide **Discard agreement setup**, preserving the ordinary quote and project where safe.
- **Awaiting signature:** provide **Withdraw request**, revoke/void the pending provider request, and retain its audit history.
- **Approved:** preserve the signed revision. Provide an explicit end/replace workflow that states its effective date and effects on future visits; preserve prior invoices and approval evidence.
- **Stop future work now:** the existing **End series** operation stops eligible future visits and preserves agreement history. This is not itself an agreement termination record.

These are recommendations, not functionality shipped during this testing run. Resolve deletion integrity and saved-term hydration before declaring the agreement lifecycle complete, then resume blocked browser cases.
