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

	// PR #314: createMention and the invoice-paid celebration both emit
	// /invoices/<id>, but the mobile route is /invoice/[id].
	it("rewrites /invoices/<id> to the singular /invoice/<id> route", () => {
		expect(normalizeActionUrl("/invoices/i123")).toBe("/invoice/i123");
	});

	it("is idempotent for an already-singular /invoice/<id>", () => {
		expect(normalizeActionUrl("/invoice/i123")).toBe("/invoice/i123");
	});

	it("rewrites the quotes segment even with a trailing slash and no id", () => {
		expect(normalizeActionUrl("/quotes/")).toBe("/quote/");
	});

	// automationActionUrl (backend lib/automationExec/actions.ts) emits
	// "/tasks/<id>", but mobile task detail is the form modal with a taskId
	// query param, not a [taskId] route.
	it("rewrites /tasks/<id> to the form modal with a taskId query param", () => {
		expect(normalizeActionUrl("/tasks/t123")).toBe(
			"/tasks/form?taskId=t123"
		);
	});

	// Every actionUrl the backend can emit (grepped from packages/backend/convex
	// for `actionUrl:`), and the mobile route it should resolve to after
	// normalizeActionUrl. Sources: notifications.ts createMention
	// (client/project/quote), boldsign.ts, invoiceOverdue.ts,
	// lib/celebrations.ts, lib/automationExec/actions.ts (automationActionUrl +
	// the automation-failure notification), quickbooks.ts.
	//
	// Some backend actionUrls have no mobile equivalent by design — automations
	// building and QuickBooks settings are business-only, web-only surfaces —
	// so they intentionally resolve to +not-found rather than a real screen.
	const knownActionUrls: readonly (readonly [string, string])[] = [
		["/clients/c1", "/clients/c1"],
		["/projects/p1", "/projects/p1"],
		["/quotes/q1", "/quote/q1"],
		["/invoices/i1", "/invoice/i1"],
		["/tasks/t1", "/tasks/form?taskId=t1"],
		["/notifications", "/notifications"],
		// automationActionUrl's no-scope-record fallback and the automation
		// builder link: no mobile Home or automations UI, falls to not-found.
		["/home", "/home"],
		["/automations", "/automations"],
		[
			"/organization/profile?tab=integrations",
			"/organization/profile?tab=integrations",
		],
	];

	it.each(knownActionUrls)(
		"normalizes every known backend actionUrl (%s)",
		(actionUrl, expected) => {
			expect(normalizeActionUrl(actionUrl)).toBe(expected);
		}
	);
});
