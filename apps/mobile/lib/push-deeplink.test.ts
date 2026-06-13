import { describe, it, expect } from "vitest";

import { normalizeActionUrl } from "./push-deeplink";

// Wave 0 RED test (Pitfall 4): pins the actionUrl → mobile-route mapping the
// push tap handler depends on. The /quotes/<id> actionUrl must rewrite to the
// SINGULAR /quote/<id> route, while /clients and /projects (already plural in
// the mobile route table) pass through unchanged. push-deeplink.ts does not
// exist yet — plan 02 implements it; this import is intentionally RED.

describe("normalizeActionUrl", () => {
	it("rewrites /quotes/<id> to the singular /quote/<id> route", () => {
		expect(normalizeActionUrl("/quotes/q123")).toBe("/quote/q123");
	});

	it("preserves hyphenated ids in the quote rewrite", () => {
		expect(normalizeActionUrl("/quotes/abc-def-ghi")).toBe(
			"/quote/abc-def-ghi"
		);
	});

	it("leaves /clients/<id> unchanged (mobile route is plural)", () => {
		expect(normalizeActionUrl("/clients/c123")).toBe("/clients/c123");
	});

	it("leaves /projects/<id> unchanged (mobile route is plural)", () => {
		expect(normalizeActionUrl("/projects/p123")).toBe("/projects/p123");
	});

	it("is idempotent for an already-singular /quote/<id>", () => {
		expect(normalizeActionUrl("/quote/q123")).toBe("/quote/q123");
	});

	it("rewrites the quotes segment even with a trailing slash and no id", () => {
		expect(normalizeActionUrl("/quotes/")).toBe("/quote/");
	});
});
