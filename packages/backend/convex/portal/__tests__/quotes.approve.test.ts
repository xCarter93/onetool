// Implements: QUOTE-03, QUOTE-04, QUOTE-05, QUOTE-06. Filled by Plan 14-02.
//
// Wave 0 todo-skeleton: tests are declared as `it.todo` so the suite passes
// (todo = skipped) and the file is registered with vitest. Plan 14-02 fills
// the bodies with convex-test-based assertions.

import { describe, it } from "vitest";

describe("portal.quotes.approve", () => {
	it.todo(
		"happy path: typed mode stores signature, inserts audit row, patches status='approved', emits status_changed event, logs activity quote_approved"
	);
	it.todo(
		"happy path: drawn mode inserts audit row with signatureMode='drawn'"
	);
	it.todo(
		"audit row contains ipAddress, userAgent, documentVersion, lineItemsSnapshot, totals, termsSnapshot, termsAcceptedAt (set on approval)"
	);
	it.todo(
		"rejects with QUOTE_VERSION_STALE when expectedDocumentId !== quotes.latestDocumentId — and no signature blob is left in storage"
	);
	it.todo(
		"rejects with QUOTE_NOT_PENDING when quote.status !== 'sent' (double-submit guard) — and no signature blob is left in storage"
	);
	it.todo(
		"rejects with FORBIDDEN when clientContact->client->org chain does not match — and no signature blob is left in storage"
	);
	it.todo(
		"emitStatusChangeEvent receives oldValue='sent', newValue='approved', source='portal.quotes.approve' AFTER OCC + audit-row commit (not before)"
	);
	it.todo(
		"approve return value contains receipt payload: auditId, createdAt, documentVersion, lineItemsCount, total, signatureStorageId"
	);
});
