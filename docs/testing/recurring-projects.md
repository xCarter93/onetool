# Recurring projects QA script

This script tests the recurring-project release as a user would use it, then covers backend boundaries that are impractical or unsafe to reproduce through the UI. Run destructive and external-provider scenarios only in a disposable QA organization.

## What a recurring agreement means

A recurring agreement is the customer's approval of one exact version of a recurring service: its service scope, price, property, cadence and end condition, billing rhythm, and payment schedule. The agreement begins as a quote attached to one visit in the series. Preparing it freezes those terms into an agreement revision. The customer approves that source document once; sending it alone is not approval.

After approval, eligible future visit quotes can inherit approval from that exact agreement revision. An inherited quote should say **Approved under recurring agreement …**. It is not separately signed and must not contain a fabricated signature or approval audit. If a visit needs different work or pricing, revert that visit's inherited quote to draft, edit it, and obtain separate approval. **Restore agreement pricing** discards that visit override and reconnects it to the currently approved agreement, provided it has not been invoiced and the agreement is not under review.

Agreement states have these meanings:

| State | Meaning | User action |
| --- | --- | --- |
| Draft | Terms were prepared and stored; no controlled approval PDF has been bound yet. It occupies the series' pending revision slot. | Generate and review the agreement PDF, or prepare a replacement revision. |
| Pending | A controlled approval PDF has been bound. This state does not prove that a signature request was sent. | Check the quote's Signatures tab and delivery status; send for approval if needed. Do not apply changed terms yet. |
| Approved | The exact controlled document was approved. This is the standing agreement used for eligible future visits and billing. | Use it, create a visit override, or start **Revise agreement** for a future change. |
| Superseded | A newer revision replaced this revision. It remains history and must not be applied to new visits. | No routine action. Review it only as historical evidence. |

There is currently no supported command to delete or cancel an individual recurring agreement revision. Preparing a replacement supersedes an existing ordinary pending revision. Approval supersedes the previously approved revision. Ending a series stops future visits but does not erase its agreement history. **Cancel payment proposal** applies only to a shared monthly payment-change proposal; it is not agreement cancellation. Do not describe quote deletion as agreement deletion.

## Safe QA fixtures

Create a disposable organization named `Recurring QA <date>-<tester>` in timezone `America/New_York`. Use a client named `QA Recurring Client` and property `QA Test Property, 100 Test Lane`. Use only addresses and phone numbers controlled by the tester. Use email aliases/inboxes controlled by the team, never a real customer.

Use these series so failures are easy to identify:

- `QA Weekly Cleaning`: weekly on Tuesday, 09:00–11:00, starting on the next Tuesday, ending after 8 occurrences. Price: $125.00 per visit.
- `QA Last-Friday Landscaping`: monthly on the last Friday, 13:00–15:00, ending after 4 occurrences. Price: $80.25 per visit.
- `QA Seasonal HVAC`: every 3 months, starting at least 100 days in the future, ending after 3 occurrences. Price: $210.00 per visit.

For copy-forward, create task `Kitchen and bath`, assigned to the tester, due one hour after the visit starts, and quote `Standard recurring service` with two lines whose total is visually distinctive. Do not connect Stripe or issue invoices to a customer. Draft invoices may be deleted with the disposable organization after the run.

Record the browser, viewport, organization timezone, test account role/permissions, build/commit, actual result, and evidence link for every scenario. Mark each `Pass`, `Fail`, or `Blocked`.

## UI and computer-use scenarios

### RP-001 — Create a finite recurring series

1. Open Projects and create `QA Weekly Cleaning` as a recurring project with the fixture schedule.
2. Review the schedule preview before submitting.
3. Submit once, then open Projects, Calendar, Today, and Routes.

Expected: one real project exists for each materialized occurrence; there is no extra undated “series” project. The origin counts as occurrence 1. Project rows show the recurring badge and the badge opens the series overview. Dated visits appear in Calendar/Today/Routes even without tasks when their dates fall in those views. Refreshing does not create duplicates.

### RP-002 — Cadence variants and boundaries

1. Preview daily, selected-weekday, every-N-week, numeric monthly, ordinal monthly including last, yearly, seasonal-month, Until-date, and count schedules.
2. Include a monthly numeric date that is missing in a shorter month and an ordinal weekday that does not exist in a month.
3. Preview `QA Last-Friday Landscaping` and `QA Seasonal HVAC`.

Expected: Until includes a visit that starts on the Until date. Missing numeric dates clamp to month end without moving the future anchor. Missing ordinal weekdays are skipped. Seasonal months are respected. The 100+-day fixture still creates at least its next eligible occurrence. No preview alone creates projects.

### RP-003 — Convert an existing project

1. Create a normal dated project with description, property, crew, a task, quote, and harmless activity.
2. Change its type to Recurring without supplying a schedule.
3. Confirm no visits are generated, then choose **Set up recurrence** and create a schedule.

Expected: the type label alone is inert. After setup, the existing project is the originating occurrence and keeps its IDs, task, quote, and history. New visits receive fresh identities and planned status; completion, payment, signature, and activity history are not copied.

### RP-004 — Occurrence edit scope

1. On the second weekly visit, edit a reusable detail such as title or description.
2. On the first save prompt choose **This project**. Make another reusable edit in the sidebar and description editor.
3. Change the visible scope control to **This and future projects** and edit title, description, property, and crew one at a time.
4. Navigate away and return.

Expected: scope is prompted on the first relevant save, shared across the project editors, visible/editable, remembered only while viewing that project, and reset after leaving. Occurrence-only values remain overrides. Future scope updates eligible planned visits while preserving overrides. Dates and statuses remain visit-specific.

### RP-005 — Task copy-forward

1. Add the fixture task to the origin and select **Copy to future projects**.
2. Review the affected/excluded preview and confirm.
3. Inspect two future visits, then edit one copy and start or complete another.
4. Edit the source and copy again. Delete one untouched copied task and copy again.
5. Remove the saved recurring task setup after reviewing its preview.

Expected: copies have fresh IDs and Pending status, keep relative dates/times and valid assignees, and do not start standalone task recurrence. Recopy updates untouched pending copies without duplicates. Edited, started/completed, manually added, and explicitly deleted copies are preserved. Removing setup stops later generation and removes only untouched pending copies. The source may be deleted while its saved snapshot still generates future tasks.

### RP-006 — Quote copy-forward before agreement

1. Create the fixture quote and select **Copy to future projects**.
2. Review the affected/excluded preview and confirm.
3. Confirm copied totals and inspect quote numbers, lines, expiration, document, send, and signature state.
4. Add a manual quote to one future visit. Edit an ordinary draft copy, then recopy the source.
5. Send or approve another copy, reopen it if available, and recopy.
6. Stop the saved quote setup.

Expected: each copy has a fresh quote number, ID, and line IDs with exact totals. It has no copied expiration, document, send, approval, or signature data. A manual quote and a quote copied from another source remain. An ordinary draft copy may be replaced; a sent/approved/invoiced copy remains protected even if later reopened. Stopping setup leaves existing quotes and prevents future copies.

### RP-007 — Pause, resume, end, skip, cancel, restore, and delete visits

1. From the overview, preview and pause the weekly series.
2. Confirm future unstarted visits become cancelled/suspended while started, completed, and invoiced work is preserved.
3. Resume and review the preview. Repeat with **End series**, then resume the ended series.
4. Skip one future visit; cancel a different visit through its ordinary status control.
5. Delete an unstarted visit with no quote or invoice. Run/trigger generation again if the environment exposes it.
6. Try deleting a recurring visit that has a quote or invoice.
7. Restore an eligible series-cancelled visit explicitly, including a past one where possible.

Expected: pause/end previews match the changed records. Resume follows the original anchor and limits without backfilling missed dates or extending the count/Until rule. Individually skipped, cancelled, or deleted visits do not revive automatically. A deleted visit is not regenerated at its nominal date. Financial-history visits cannot be deleted and instruct the user to cancel instead. Skipped/cancelled visits do not auto-bill. A series-cancelled visit can be explicitly restored; ordinary individual cancellations do not silently become planned.

### RP-008 — Prepare a draft agreement

1. On an active recurring visit, open a draft quote and choose **Set up agreement**.
2. Enter a clear service scope, weekly cadence, per-visit billing, and a 100% payment installment 30 days after invoicing.
3. Confirm setup and inspect the quote, series overview, and generated PDF preview/download.
4. Attempt ordinary **Copy to future projects** after designation.

Expected: the overview shows a pending revision with Draft status and a link to its quote. The PDF contains the exact scope, property, schedule, billing rhythm, payment terms, quote contents, agreement reference, and revision. Ordinary quote copy-forward is disabled for a series with a designated agreement. No future price/schedule change takes effect merely because the draft was prepared.

### RP-009 — Replace draft and pending revisions; preserve superseded history

1. While RP-008 is still Draft, prepare the source quote again with deliberately changed terms.
2. Confirm the visible pending revision number advances and the earlier revision is no longer current.
3. In the external-signature environment, send a revision so it is Pending. Attempt to prepare a replacement from the designated agreement lineage.
4. Inspect current/pending pointers and any available audit/admin data.

Expected: preparing a replacement marks the prior ordinary pending revision Superseded and points the series at the new Draft. The older revision remains stored as history. A shared monthly payment proposal is a special case: the UI/API should require **Cancel payment proposal** before preparing another separate revision. There is no standalone cancel/delete agreement control.

### RP-010 — Approve once and inherit exact-version approval

1. Complete RP-008 through an authorized in-person signature or the real-provider scenario below.
2. Inspect the source quote, overview, and all eligible future visit quotes.
3. Open one inherited quote in the workspace and client portal and view/download its agreement.
4. Check activity/automation evidence if available.

Expected: the source agreement becomes Approved and current. Eligible exact-version copies become Approved and say **Approved under recurring agreement <reference>**. They link to the standing agreement PDF but have no individual signed document, signature, or approval audit. The real source emits the approval notification/workflow event once; inherited approvals do not replay it.

### RP-011 — Stale copies do not inherit

1. In a fresh series, copy the source quote forward before preparing the agreement.
2. Change the source content, prepare that new version, and approve it.
3. Inspect the earlier copied quotes.

Expected: copies of the earlier content version remain Draft and do not inherit approval. They are surfaced for refresh/review rather than silently covered.

### RP-012 — Revise an approved agreement

1. From the overview choose **Revise agreement**.
2. Confirm a fresh Draft quote is created with a fresh number and the current contents.
3. Change price, scope, cadence, or payment terms and prepare/send it.
4. Before approval, inspect series schedule and future visit prices. Then approve it and inspect again.

Expected: old approved terms stay active until approval. Shared cadence/scope changes are blocked outside the revision flow once an agreement exists. Approval makes the new revision current, marks the prior approved revision Superseded, and applies changes only to eligible future unstarted/uninvoiced visits. Historical and invoiced work keeps its previous version and amount. The stable agreement root may still point to the original source quote while the active revision records the new revision quote.

### RP-013 — One-visit override and restore

1. Revert one inherited future quote to Draft, edit its service/price, and save.
2. Complete the visit while its exception awaits approval or is declined.
3. Confirm billing is held. Approve the exception and confirm billing becomes eligible.
4. On a second uninvoiced override choose **Restore agreement pricing**.
5. Try restore on an invoiced visit and while the agreement is flagged for review.

Expected: the edited visit loses inherited approval, is marked as an override, and is protected from agreement propagation. It never silently bills the proposed or standing amount while approval is unresolved. Explicit approval releases it. Restore replaces lines/totals with the exact active agreement version and returns Approved inherited state. Restore is blocked for invoiced visits and when signed terms require review.

### RP-014 — Agreement deletion and cancellation exploration

Run this only in a disposable organization and capture the exact UI/API result. This scenario documents current gaps; it does not assert that deletion is supported.

1. For a Draft agreement revision, inspect the series overview and quote actions for **Cancel agreement**, **Delete agreement**, or equivalent. Try deleting its source quote through the normal quote delete action.
2. Repeat for a provider-Pending agreement with no invoice.
3. For an Approved agreement, inspect actions and try deleting the agreement source quote only if the disposable environment makes that action available.
4. Create an approved revision followed by a newer approved revision so the first is Superseded. Inspect whether either revision can be deleted independently.
5. After each permitted deletion attempt, revisit the series overview, occurrences, portal link, revision flow, and billing setup; record console/server errors and dangling links.
6. End the series and confirm agreement records/history remain visible.

Expected from the intended model: no individual revision deletion or cancellation control exists; replacement/approval creates Superseded history, and ending the series preserves it. Current code requires exploration because the generic quote-delete mutation checks invoices but does not check `agreementQuoteId`, `pendingAgreementRevisionId`, `activeAgreementRevisionId`, or revision source references. If the UI allows deletion, file a data-integrity defect rather than marking “agreement deletion” as passed. A Pending provider document may also continue externally unless the provider request is explicitly cancelled; no recurring-agreement provider-cancel API is currently evident.

### RP-015 — Per-visit draft billing and idempotency

1. Complete an eligible visit under a per-visit approved agreement.
2. Confirm one Draft invoice appears and is absent from the client portal.
3. Refresh, reopen/re-complete the project if allowed, and rerun the billing trigger/job.
4. Manually convert a different approved visit quote before completing it, then complete it.
5. Complete skipped, cancelled, missing-pricing, and unresolved-override visits.

Expected: exactly one draft allocation exists per billable visit. Manual conversion prevents an automatic duplicate. Automatic billing stops at Draft and does not send or charge. Skipped/cancelled visits do not bill. Missing pricing is surfaced as **Needs billing setup**; unresolved overrides remain on hold.

### RP-016 — Monthly consolidated billing

1. Approve two monthly-billed series for the same client, preferably at different properties, with fixed discounts/tax that expose rounding errors.
2. Complete visits during the open local calendar month and run the monthly job before close.
3. Advance through month close in the backend fake-clock scenario and run it twice.
4. Inspect the consolidated draft and client portal.

Expected: no invoice appears before the local month closes. After close, one Draft invoice groups eligible completed visits across properties with original service dates and quote/agreement attribution. Totals equal the sum of each visit's already-computed totals. A second run creates no duplicate. The Draft remains hidden from the portal.

### RP-017 — Shared monthly payment change

1. Propose a payment arrangement affecting multiple monthly agreements.
2. Approve only some agreements and inspect each overview.
3. Confirm existing terms remain active, then approve all affected agreements.
4. Confirm the effective month is the next full calendar month.
5. In a fresh proposal, choose **Cancel payment proposal** before activation; also test cancellation after it is scheduled if offered.

Expected: progress shows approved/required counts. No partial payment arrangement activates. Once all approvals exist, it is scheduled for the next full month. Cancellation supersedes its proposal revisions and preserves active agreements; it does not cancel those agreements.

### RP-018 — Permissions, tenancy, and plan availability

1. Repeat view and modify operations as owner/admin, assigned-only member, and roles missing project, task, quote, or delete grants.
2. Attempt to access a series/quote from another disposable organization by URL/ID.
3. Repeat core recurring controls on Free and Business organizations.

Expected: all reads/writes are organization-scoped. Series-wide task/quote/agreement operations require organization-wide record access plus the relevant grants. Removal of reusable tasks requires task-delete permission. Assigned-only users cannot propagate across the organization. Built-in recurrence, agreements, and draft billing are available on both plans; existing signature/send meters and Business-only automations/routing remain enforced.

### RP-019 — Mobile execution compatibility

1. Open generated occurrences in the currently supported mobile app.
2. View/edit/complete an active visit and its tasks.
3. Open a visit suspended by pause/end and attempt work changes.
4. Confirm skipped/paused series state does not appear as an unknown project-status literal.

Expected: normal occurrences use existing project/task workflows and pinned status literals. Suspended work cannot be accidentally completed by an older/generic path. Mobile does not need series-authoring controls for this release.

## Real external email and signature scenarios

Use a provider sandbox/test workspace where available and only tester-controlled email addresses. These tests consume real send/signature meter activity and can create durable provider records, so keep them separate from routine smoke tests.

### EXT-001 — Email delivery and remote approval

1. Prepare an agreement with a controlled QA PDF and send it once to the tester inbox.
2. Verify sender, recipient, subject, agreement reference, link, and delivered attachment/page contents.
3. Open the link in a private browser, review the exact locked document, sign, and submit once.
4. Wait for the webhook and inspect workspace, portal, future visits, notifications, and provider audit.

Expected: one provider request and one customer email are created. A repeated send action does not create a duplicate. Completion approves the exact revision once and propagates inherited approval without copy signatures or repeated approval automations.

### EXT-002 — Decline, expiration, and delivery failure

1. In separate agreements, decline, allow expiration if the provider supports a practical test setting, and send to a controlled rejecting/invalid address.
2. Observe workspace state and retry affordances.

Expected: none activates an agreement. The standing approved revision, if any, remains active. Failure is actionable and does not silently consume/duplicate a later send.

### EXT-003 — Provider editing and out-of-order webhooks

1. If the provider sandbox can emit or reproduce an Edited event, edit after Sent and complete.
2. Reproduce Edited after Completed and a later duplicate Completed event through the provider sandbox/webhook replay tooling.

Expected: Edited before Completed prevents activation. Edited after Completed flags the series for agreement review and blocks restore/automatic reliance on changed signed terms. Duplicate and out-of-order events remain idempotent and do not reactivate unreviewed terms.

### EXT-004 — In-person signature

1. Generate the controlled agreement PDF, move the source quote to the required sent state, and use the in-person signature flow with a controlled contact.
2. Sign and approve once, then inspect source and inherited visits.

Expected: the source has one real signature/evidence record pinned to the controlled PDF. The agreement activates and eligible exact-version visits inherit approval without their own signature records.

## Backend fake-clock and integration coverage

Run targeted tests with:

```sh
pnpm --filter @onetool/backend test:once -- projectSeries projectSeriesTasks projectSeriesQuotes projectSeriesAgreements recurringAgreementDocuments recurringBilling recurringPaymentChanges recurringPaymentSchedules invoices.recurringPaymentSchedule calendar routes projects
```

If the package runner does not accept multiple filename fragments, run the named test files individually or run `pnpm --filter @onetool/backend test:once`. The suite should use fake timers and explicit UTC timestamps; restore real timers after each test file.

The automated coverage gate should include:

| ID | Required assertion |
| --- | --- |
| BE-001 | Count includes origin; Until is inclusive; DST/timezone conversion, clamping, ordinal skips, seasonal filters, rolling 90 days, and far-future next occurrence are deterministic. |
| BE-002 | Generation is bounded, continuation-safe, concurrency-safe, and idempotent; moved/deleted occurrence ledger identities prevent regeneration. |
| BE-003 | Pause/end/resume/restore distinguish series cancellation from manual skip/cancel/delete and preserve completed, started, invoiced, and past records. |
| BE-004 | Generic project writes create reusable-field overrides but status/history writes do not; stale lifecycle previews fail. |
| BE-005 | Task copy/update/removal protects edited/started/completed/deleted copies, filters departed assignees, prevents recursive task recurrence, and respects write bounds. |
| BE-006 | Quote copies have independent identity/totals and no approval metadata; sent/approved/invoiced/tombstoned copies remain protected; stale previews and cross-tenant sources fail. |
| BE-007 | Preparing an agreement captures immutable exact terms, version, and revision; a replacement supersedes the prior ordinary pending revision without activating it. |
| BE-008 | Controlled server PDF snapshot rejects browser/legacy upload substitution and concurrent quote/terms changes. |
| BE-009 | One signature reservation/send activates exactly once; duplicate, Edited, and out-of-order webhooks preserve review state and evidence. |
| BE-010 | Exact-version copies alone inherit approval; inherited copies create no signature, approval audit, document, or approval event. |
| BE-011 | Revision approval supersedes the prior approved revision, applies future eligible setup only, and preserves invoiced source content. |
| BE-012 | Visit override blocks billing; explicit approval or exact-version restore releases it; invoiced/review-required restore fails. |
| BE-013 | Per-visit and monthly generation are idempotent, allocation-aware, local-month aware, and exclude unfinished/skipped/cancelled/duplicate charges. |
| BE-014 | Monthly totals sum preserved visit groups; incompatible payment schedules produce review state without a partial invoice. |
| BE-015 | Shared payment changes require all agreements, start next full month, and cancellation supersedes proposal revisions without replacing active agreements. |
| BE-016 | Org cascade removes recurring tables/storage safely; ordinary tenant boundaries and organization-wide permission requirements reject unauthorized access. |
| BE-017 | Add regression tests for deleting agreement-linked source/revision quotes in Draft, Pending, Approved, and Superseded states before defining any supported UI behavior. Assert no dangling series/revision/document/billing references. |

For month-boundary tests, cover an organization west and east of UTC and run immediately before and after local midnight/month close. For cadence tests, include a DST transition in `America/New_York`, February 29, months with 28/29/30/31 days, and a last-weekday schedule. For retry tests, invoke the same mutation/job/webhook at least twice with identical identity inputs.

## Release exit criteria

All RP scenarios required by the release pass on desktop; RP-019 passes on a supported mobile build; EXT-001 and EXT-004 pass against the configured QA provider; targeted backend tests pass; and no P0/P1 tenancy, duplicate billing, document-binding, or agreement-integrity defect remains. EXT-002/003 may be marked Blocked only with the provider limitation recorded and their backend webhook equivalents passing.

Known gaps discovered during this audit:

- The generic quote deletion mutation blocks invoices but has no recurring-agreement reference guard or cleanup. Deleting an agreement-linked quote may leave dangling series, revision, document, portal, or billing references. Treat this as a release-blocking integrity gap until regression tests and an explicit product policy are implemented.
- There is no general mutation or UI action to cancel/delete a recurring agreement revision or cancel its provider signature request. The only cancellation found is for shared monthly payment proposals.
- The series overview exposes only the current and pending revision summaries. Superseded revision history is retained in storage but is not presented as a browsable agreement-history list.
- Existing automated agreement tests cover draft replacement and approval supersession indirectly, but do not cover generic deletion attempts for Draft, Pending, Approved, and Superseded agreement source/revision quotes.
- **Confirmed by code audit, not yet reproduced in UI:** reopening **Set up agreement** does not reload the agreement's saved billing rhythm or payment rule. [`recurring-agreement-setup-dialog.tsx`](../../apps/web/src/app/(workspace)/quotes/[quoteId]/components/recurring-agreement-setup-dialog.tsx#L49-L54) initializes every mount to per-visit billing and one 100% installment at +30 days; its open handler at lines 89–94 resets only scope and cadence. [`projectSeriesAgreements.ts`](../../packages/backend/convex/projectSeriesAgreements.ts#L45-L64) does not return saved terms from `getSetup`. Reopening and submitting can therefore replace previously prepared billing/payment terms with defaults unless the tester manually re-enters them. Add a UI regression test that prepares non-default terms, closes/reloads, reopens, and verifies the saved values before release.

## Characterization test report — agreement source deletion

Run on 2026-09-06 with an isolated convex-test file in `/tmp`; no live data, email, provider request, or repository test file was created. Command:

```sh
pnpm exec vitest run --config /tmp/recurring-agreement-delete.vitest.config.ts
```

Result: **2 tests passed**. This means both tests successfully reproduced the current broken behavior; it does not mean agreement deletion is safe or supported.

| Case | Operation | Observed persisted state |
| --- | --- | --- |
| Draft prepared agreement | Called `api.quotes.remove` on the designated source quote. | The quote and its line items were deleted. The series survived with `agreementQuoteId` equal to the deleted quote ID and `pendingAgreementRevisionId` equal to the surviving Draft revision. That revision survived with `sourceQuoteId` equal to the deleted quote ID. |
| Approved agreement | Characterized an Approved source/revision and active-series pointer, then called `api.quotes.remove` on the designated source quote. | The quote and its line items were deleted. The series survived with `agreementQuoteId` equal to the deleted quote ID and `activeAgreementRevisionId` equal to the surviving Approved revision. That revision survived with `sourceQuoteId` equal to the deleted quote ID. |

The Approved case used the isolated database fixture to establish the same persisted Approved status and pointers that activation produces; it deliberately did not send to BoldSign or create live signature evidence. The deletion mutation does not inspect approval evidence, so this isolates the relationship-integrity behavior under test.

The defect is broader than a stale display label. Subsequent agreement reads and actions call organization-scoped entity lookups for these referenced rows; a deleted quote can therefore cause broken overview links, failed revision/setup flows, unavailable portal agreement resolution, or billing/document provenance failures. The product currently has no cleanup transaction or tombstone policy for this operation.

Required policy before enabling any agreement removal UX: either block deletion of every quote referenced by an agreement revision/series/document/billing record and direct the user to the supported series/revision lifecycle, or implement a fully specified archival/cancellation transaction that preserves signed evidence and financial provenance. Do not add a UI-only guard; the backend mutation is the integrity boundary.
