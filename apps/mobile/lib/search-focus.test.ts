import { beforeEach, describe, expect, it } from "vitest";
import { consumeSearchFocus, requestSearchFocus } from "./search-focus";

describe("search-focus latch", () => {
	beforeEach(() => {
		// Module state is process-global; drain it so each case starts clean.
		while (consumeSearchFocus()) {
			/* drain */
		}
	});

	it("is off until something requests focus", () => {
		expect(consumeSearchFocus()).toBe(false);
	});

	it("fires exactly once per request — the whole point vs. a sticky param", () => {
		requestSearchFocus();
		expect(consumeSearchFocus()).toBe(true);
		expect(consumeSearchFocus()).toBe(false);
	});

	it("does not queue: two taps before one consume still fire once", () => {
		requestSearchFocus();
		requestSearchFocus();
		expect(consumeSearchFocus()).toBe(true);
		expect(consumeSearchFocus()).toBe(false);
	});

	it("can be re-armed after being consumed", () => {
		requestSearchFocus();
		consumeSearchFocus();
		requestSearchFocus();
		expect(consumeSearchFocus()).toBe(true);
	});
});
