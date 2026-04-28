// Implements: decline route. Filled by Plan 14-04.
//
// Wave 0 todo-skeleton: tests are declared as `it.todo` so the suite passes
// (todo = skipped) and the file is registered with vitest. Plan 14-04 fills
// the bodies.

import { describe, it } from "vitest";

describe("POST /api/portal/quotes/[quoteId]/decline", () => {
	it.todo("zod-rejects body without expectedDocumentId returns 400");
	it.todo(
		"happy path: forwards declineReason (optional) to mutation, returns 200 with receipt payload"
	);
	it.todo("converts QUOTE_VERSION_STALE to HTTP 409");
	it.todo("converts RATE_LIMITED to HTTP 429");
});
