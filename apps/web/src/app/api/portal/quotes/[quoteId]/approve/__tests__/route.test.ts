// Implements: QUOTE-03..06 (route layer). Filled by Plan 14-04.
//
// Wave 0 todo-skeleton: tests are declared as `it.todo` so the suite passes
// (todo = skipped) and the file is registered with vitest. Plan 14-04 fills
// the bodies with hoisted vi.mock factories for fetchAction/fetchMutation.

import { describe, it } from "vitest";

describe("POST /api/portal/quotes/[quoteId]/approve", () => {
	it.todo("zod-rejects body without expectedDocumentId returns 400");
	it.todo("typed mode without intentAffirmed=true returns 400");
	it.todo(
		"happy path: forwards signatureBase64 to single approve action, returns 200 with receipt payload"
	);
	it.todo("converts ConvexError code=QUOTE_VERSION_STALE to HTTP 409");
	it.todo("converts ConvexError code=QUOTE_NOT_PENDING to HTTP 409");
	it.todo(
		"converts ConvexError code=RATE_LIMITED to HTTP 429 with code=rate_limited"
	);
	it.todo("converts ConvexError code=UNAUTHENTICATED to HTTP 401");
	it.todo("captures raw IP via getRequestIp helper (not hashed)");
});
