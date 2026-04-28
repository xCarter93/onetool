// Implements: QUOTE-01. Filled by Plan 14-02.
//
// Wave 0 todo-skeleton: tests are declared as `it.todo` so the suite passes
// (todo = skipped) and the file is registered with vitest. Plan 14-02 fills
// the bodies with convex-test-based assertions.

import { describe, it } from "vitest";

describe("portal.quotes.list", () => {
	it.todo(
		"returns only quotes for the authenticated clientContact's client+org"
	);
	it.todo(
		"excludes quotes from other organizations sharing the same clientContact email"
	);
	it.todo("returns quotes ordered by sentAt desc");
});
