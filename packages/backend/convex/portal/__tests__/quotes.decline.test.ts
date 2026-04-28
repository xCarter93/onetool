// Implements: QUOTE-04, QUOTE-06 (decline path). Filled by Plan 14-02.
//
// Wave 0 todo-skeleton: tests are declared as `it.todo` so the suite passes
// (todo = skipped) and the file is registered with vitest. Plan 14-02 fills
// the bodies with convex-test-based assertions.

import { describe, it } from "vitest";

describe("portal.quotes.decline", () => {
	it.todo(
		"happy path: inserts audit row with action='declined', no signatureStorageId, no termsAcceptedAt, emits status_changed sent->declined"
	);
	it.todo(
		"decline-without-terms: audit row has termsAcceptedAt === undefined (decline does not require terms acceptance per REVIEWS feedback)"
	);
	it.todo("accepts empty declineReason (optional reason is legitimate)");
	it.todo(
		"rejects with QUOTE_VERSION_STALE when expectedDocumentId is stale"
	);
	it.todo("rejects with QUOTE_NOT_PENDING when status is not 'sent'");
	it.todo(
		"decline return value contains receipt payload: auditId, createdAt, documentVersion, lineItemsCount, total"
	);
});
