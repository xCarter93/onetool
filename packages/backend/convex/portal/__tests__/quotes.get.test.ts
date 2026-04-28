// Implements: QUOTE-02. Filled by Plan 14-02.
//
// Wave 0 todo-skeleton: tests are declared as `it.todo` so the suite passes
// (todo = skipped) and the file is registered with vitest. Plan 14-02 fills
// the bodies.

import { describe, it } from "vitest";

describe("portal.quotes.get", () => {
	it.todo(
		"returns quote with line items and latestDocumentId for the authorized clientContact"
	);
	it.todo(
		"returns receipt-shaped fields (businessName, clientName, clientEmail, latestApproval summary) needed by Plan 14-05 UI"
	);
	it.todo("rejects with FORBIDDEN when clientContact does not own the quote");
	it.todo("rejects with NOT_FOUND when quote does not exist");
});
