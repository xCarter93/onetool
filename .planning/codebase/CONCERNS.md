# Codebase Concerns

**Analysis Date:** 2026-03-14

## Tech Debt

### Async Event Emission Test Failures

**Issue:** Multiple test suites have critical tests disabled due to event emission transaction issues

**Files:**
- `packages/backend/convex/clients.test.ts` (Lines 298, 353, 450, 493, 579)
- `packages/backend/convex/projects.test.ts` (Lines 204, 237)

**Impact:** Cannot reliably test archiving, restoration, and status change operations. Automations and event-driven workflows may have untested paths in production. Integration between mutation operations and event bus is fragile.

**Problem Details:** The `emitStatusChangeEvent()` call happens asynchronously within mutations, but test framework expects transactional boundaries. When mutations emit events (e.g., when archiving a client), tests fail with transaction isolation violations.

**Fix approach:**
1. Refactor event emission to be synchronous within mutation context or use proper internal mutation coordination
2. Alternatively, mock event bus in tests to avoid async issues
3. Create separate integration tests that specifically test event-driven workflows without relying on immediate consistency
4. Update test setup to handle async event emission properly (see `packages/backend/convex/test.setup.ts`)

### Unused Function Markers Throughout Backend

**Issue:** 50+ functions marked with "TODO: Candidate for deletion if confirmed unused"

**Files (samples):**
- `packages/backend/convex/activities.ts` (Lines 86, 130, 167)
- `packages/backend/convex/notifications.ts` (23 functions marked)
- `packages/backend/convex/clients.ts` (Lines 173, 632, 644, 668, 765)
- `packages/backend/convex/invoices.ts` (8 functions marked)
- `packages/backend/convex/clientProperties.ts` (7 functions marked)
- `packages/backend/convex/documents.ts` (5 functions marked)
- `packages/backend/convex/projects.ts` (4 functions marked)
- `packages/backend/convex/tasks.ts` (3 functions marked)

**Impact:** Dead code increases maintenance burden, creates confusion about what's actually used, and makes refactoring riskier. Functions are exported but may not be called from frontend.

**Fix approach:**
1. Audit each marked function to confirm whether it's actually used by frontend or mobile apps
2. Search `apps/web/src` and `apps/mobile` for imports of each function
3. Remove truly unused functions to reduce surface area
4. If needed in future, they're still in git history

### Unimplemented Invoice Email Sending

**Issue:** Email sending feature for invoices not implemented

**File:** `apps/web/src/app/(workspace)/invoices/[invoiceId]/page.tsx` (Line 318)

**Impact:** Users cannot send invoices directly via email from the UI. Workaround may exist via external email system, but feature is incomplete.

**Fix approach:** Implement send email sheet similar to quote sending or use Resend integration already available in backend.

### Unfinished Admin Check for Attachment Deletion

**Issue:** Permission check incomplete for message attachment deletion

**File:** `packages/backend/convex/messageAttachments.ts` (Line 346)

**Impact:** Only uploader can delete attachments, but admin override isn't implemented. Admins might not be able to delete inappropriate attachments.

**Fix approach:** Add org admin check alongside uploader check using membership lookup.

## Known Bugs

### Legacy Address Field in Organizations Schema

**Issue:** Schema has both old and new address fields

**Files:** `packages/backend/convex/schema.ts` (Lines 44, 50-55)

**Details:**
- Old field: `address` (unstructured string)
- New fields: `addressStreet`, `addressCity`, `addressState`, `addressZip`, `addressCountry`

**Impact:** Data duplication risk. Unclear which field should be used. Frontend may read from wrong field. Address updates may only update one set of fields.

**Fix approach:**
1. Create migration to consolidate data into new structured fields
2. Remove old `address` field after migration
3. Audit all reads/writes to ensure they use structured fields only

### Deprecated Plan Field Alongside Clerk Billing

**Issue:** Schema has both legacy and Clerk billing fields

**Files:** `packages/backend/convex/schema.ts` (Lines 91-93)

**Details:**
- Old: `plan` (trial/pro/cancelled)
- New: Uses Clerk's `clerkSubscriptionId`, `clerkPlanId`, `subscriptionStatus`, `billingCycleStart`

**Impact:** Potential data inconsistency. Frontend code might read wrong field. Billing logic could fail silently.

**Fix approach:**
1. Audit all code reading `organizations.plan` field
2. Verify all use Clerk billing fields instead
3. Remove `plan` field and migrate any remaining data

### Missing Payment Overpayment Validation

**Issue:** Strict payment sum validation exists but edge cases around overpayment may not be handled

**Files:** `packages/backend/convex/payments.ts` (Lines 134-159)

**Details:** Validation ensures payment amounts sum exactly to invoice total, but:
- What if user tries to make partial payment before all payments are configured?
- Floating point arithmetic could accumulate rounding errors across large payment batches

**Impact:** Edge case overpayments might not be detected or might be rejected incorrectly. High-precision financial calculations could fail.

**Fix approach:**
1. Add logging for payment sum mismatches to detect patterns
2. Implement payment rounding strategy that handles accumulated floating point errors
3. Add test cases for large payment batches (100+ payments)
4. Consider using decimal/cents-only arithmetic instead of floating point

## Security Considerations

### `require: false` Auth Pattern in Query Functions

**Issue:** Many queries use `getCurrentUserOrgId(ctx, { require: false })` pattern

**Files (samples):**
- `packages/backend/convex/messageAttachments.ts` (Lines 146, 181, 237, 288, 317)
- `packages/backend/convex/emailAttachments.ts` (Lines 18, 51, 83)
- `packages/backend/convex/organizationDocuments.ts` (Multiple locations)
- `packages/backend/convex/users.ts` (Line 30)

**Impact:** These queries return empty arrays/null instead of rejecting unauthenticated access. While safe (no data leaks), it's inconsistent with mutation patterns. Creates risk of copy-paste errors where someone uses the wrong pattern.

**Best Practice:** Only use `require: false` when intentionally allowing unauthenticated/anonymous access (e.g., public payment page). Most internal queries should require auth.

**Fix approach:**
1. Standardize on `require: true` (default) for internal queries
2. Reserve `require: false` only for explicitly public endpoints
3. Add linting rule to catch this pattern in new code

### Missing OAuth Token Validation

**Issue:** BoldSign and other external service integrations don't validate webhook signatures consistently

**Files:** `packages/backend/convex/lib/webhooks.ts` (Multiple webhook handlers)

**Impact:** Webhook endpoints could be spoofed if signature verification is missing or incomplete.

**Fix approach:**
1. Verify all webhook endpoints use `verifySvixWebhook()` or equivalent
2. Add comprehensive webhook signature validation tests
3. Reject unverified webhooks explicitly

## Performance Bottlenecks

### N+1 Query Problem in Attachment Listings

**Issue:** While optimized in new code, older attachment queries might fetch URLs serially

**Files:** `packages/backend/convex/messageAttachments.ts` (Lines 203-214, 255-266)

**Details:** Functions like `listByNotificationWithUrls` and `listByEntity` fetch download URLs in parallel using `Promise.all()`, which is correct. However, old code might still use serial fetches.

**Impact:** With 10+ attachments per entity, serial URL fetches could add 1-2 seconds of latency per request.

**Fix approach:**
1. Audit all other attachment-related queries for serial fetches
2. Ensure all use `Promise.all()` for parallel URL generation
3. Add performance tests with 50+ attachments

### Aggregates Auto-Update Inefficiency

**Issue:** Dashboard aggregates recalculate on every mutation

**Files:** `packages/backend/convex/aggregates.ts`, `packages/backend/convex/homeStatsOptimized.ts`

**Details:** Home dashboard uses `@convex-dev/aggregate` for real-time stats, which automatically updates whenever underlying data changes. This is efficient compared to manual queries, but if multiple mutations happen rapidly, recalculation could be expensive.

**Impact:** Heavy batch operations (bulk client import, mass invoice creation) could cause dashboard to become slow.

**Fix approach:**
1. Monitor aggregate calculation time in production
2. Add caching layer for dashboard if needed
3. Consider debouncing rapid mutations that affect aggregates

### Console Logging in Production

**Issue:** 182 console.log/error/warn/debug calls throughout backend

**Files (samples):**
- `packages/backend/convex/lib/storage.ts` (Lines 150, 168)
- `packages/backend/convex/http.ts` (25 occurrences)
- `packages/backend/convex/migrations/` (30+ occurrences)
- `packages/backend/convex/lib/` (Various utility files)

**Impact:** Console output in Convex functions goes to logs but isn't structured. Makes debugging harder and could leak sensitive information if not careful. Adds overhead to every function call.

**Fix approach:**
1. Replace console logging with structured logging via Convex/Winston
2. Use error tracking service (Sentry) for exceptions only
3. Remove or comment out debug logs before production deployment

## Fragile Areas

### Event-Driven Workflow System

**Files:**
- `packages/backend/convex/eventBus.ts`
- `packages/backend/convex/automationExecutor.ts`
- `packages/backend/convex/automations.ts`

**Why fragile:**
- Event emission happens asynchronously but tests expect synchronous behavior (see test failures above)
- Event processing uses internal mutations that could fail silently
- Recursion depth limits prevent infinite loops but could mask deeper bugs
- No visibility into failed event processing

**Safe modification:**
1. Add comprehensive integration tests for entire automation flow
2. Use event log to debug failures
3. Never modify event bus without extensive testing
4. Keep automation logic simple and pure

### Payment Sum Validation

**Files:** `packages/backend/convex/payments.ts` (Lines 134-159)

**Why fragile:**
- Floating point arithmetic can accumulate errors
- Rounding strategy must be consistent across creation, update, and validation
- Strict validation means any rounding difference breaks the system
- Invoice total calculated from line items, but stored value exists for backward compatibility

**Safe modification:**
1. Add comprehensive test suite with edge cases (1 cent discounts, high-precision rates)
2. Never change rounding logic without adding new test cases
3. Use explicit cents-based arithmetic everywhere
4. Add migration for any legacy data

### Multi-Tenant Data Isolation

**Files:**
- `packages/backend/convex/lib/auth.ts` (Auth context)
- All entity files use `orgId` scoping

**Why fragile:**
- `orgId` filtering must be present in every query/mutation
- Queries with `require: false` pattern could accidentally expose data
- Index usage affects query correctness - missing indexes could cause full table scans
- Tests must verify org isolation explicitly

**Safe modification:**
1. Always include `orgId` check in new queries/mutations
2. Use `getEntityWithOrgValidation()` helper for entity access
3. Add org isolation test for every new feature
4. Review index usage when adding new queries

## Scaling Limits

### Invoice Payment Splitting

**Issue:** No tested limits on number of payments per invoice

**Current capacity:** Unknown (tested up to 2+ in test suite)

**Limit:** Could hit database row size limits or UI performance issues with 50+ payments

**Scaling path:**
1. Add tests for 50, 100, 500+ payment scenarios
2. Implement pagination for payment lists if needed
3. Consider storing payment templates for common splitting patterns
4. Monitor invoice detail page load time as payment count increases

### Attachment Storage

**Issue:** Convex storage has file limits (10MB per file) but total storage per org is unbounded

**Current capacity:** Depends on Convex plan

**Limit:** As organizations grow, storage costs could become significant with large PDFs and attachments

**Scaling path:**
1. Monitor total storage per organization
2. Implement storage quota enforcement per org
3. Add cleanup policies for old documents
4. Consider archiving old invoices/quotes to reduce storage

### Event Bus Scalability

**Issue:** Event bus processes all events serially (or in limited batches)

**Files:** `packages/backend/convex/eventBus.ts` (Lines 35-36)

**Details:**
```typescript
const MAX_RETRY_ATTEMPTS = 3;
const BATCH_SIZE = 50; // Events to process per batch
```

**Limit:** With high-frequency automations, event processing could lag behind event generation

**Scaling path:**
1. Monitor event processing lag via `domainEvents.status = "pending"` queue depth
2. Increase batch size if Convex performance allows
3. Consider separate event processing service if needed
4. Implement event filtering to skip non-critical events during high load

## Dependencies at Risk

### BoldSign Integration

**Issue:** E-signature feature depends on external BoldSign service

**Files:**
- `packages/backend/convex/boldsign.ts`
- `packages/backend/convex/boldsignActions.ts`

**Risk:** BoldSign API changes or service outages could break quote signing flow. No offline mode or fallback.

**Impact:** Users cannot get quotes e-signed if BoldSign is down.

**Migration plan:**
1. Implement fallback to manual PDF signing workflow
2. Queue failed signing requests for retry
3. Cache BoldSign responses to handle brief outages
4. Add monitoring/alerting for BoldSign API availability

### Stripe Payment Processing

**Issue:** Payment processing depends on Stripe and Stripe Connect

**Files:**
- `packages/backend/convex/stripePaymentActions.ts`
- `apps/web/src/lib/stripe.ts`

**Risk:** Stripe API changes, rate limits, or service outages could break payment flow

**Impact:** Invoices cannot be paid, revenue cannot be collected

**Migration plan:**
1. Implement payment retry logic with exponential backoff
2. Add fallback to manual payment marking for admin override
3. Implement Stripe webhook failure handling
4. Cache payment session states to handle brief outages

### Resend Email Service

**Issue:** Email notifications depend on Resend

**Files:**
- `packages/backend/convex/resend.ts`
- `packages/backend/convex/resendWebhook.ts`

**Risk:** Resend API changes, deliverability issues, or service outages

**Impact:** Email-dependent workflows (quote approvals, payment notifications) could fail silently

**Migration plan:**
1. Implement email retry queue for failures
2. Add fallback SMTP provider option
3. Implement delivery tracking and bounce handling
4. Add monitoring for email send latency and failure rates

## Missing Critical Features

### Invoice Bulk Actions

**Issue:** No bulk mark-as-paid or bulk delete for invoices

**Impact:** Managing large numbers of invoices is tedious (one-by-one operations)

### Payment Template Management

**Issue:** No saved payment split templates (e.g., "50% deposit, 50% final")

**Impact:** Repetitive manual configuration for standard payment schedules

### Automated Invoice Reminders

**Issue:** No automatic email reminders for overdue payments

**Impact:** Payment collection depends on manual follow-up

### Workflow Automation UI

**Issue:** Workflow builder exists but might be missing test coverage

**Impact:** Automations could have bugs in visual editor

## Test Coverage Gaps

### Critical Path Untested

**Areas:**
- Automation execution end-to-end (due to event emission test failures)
- Payment configuration with edge cases (overpayment, rounding)
- Multi-tenant data isolation boundary tests
- Invoice total calculation consistency across mutations

**Files with gaps:**
- `packages/backend/convex/automations.ts` - Only 6 tests for complex workflow system
- `packages/backend/convex/eventBus.ts` - Event processing logic not fully tested
- `packages/backend/convex/lib/auth.ts` - Auth boundary tests exist but incomplete

**Priority:** HIGH - These are security-critical and data-integrity-critical paths

### Mobile App Testing

**Issue:** React Native mobile app exists but no indication of automated tests

**Files:** `apps/mobile/` - No visible test files

**Impact:** Mobile features could break without detection. Multi-platform behavior differences could go unnoticed.

**Priority:** MEDIUM - Depends on mobile feature criticality

### Error Handling Tests

**Issue:** Most tests check happy path but not error scenarios

**Impact:** Error messages might be unhelpful, error logging might be missing, error recovery might not work

**Priority:** MEDIUM - Important for user experience and debugging

---

*Concerns audit: 2026-03-14*
