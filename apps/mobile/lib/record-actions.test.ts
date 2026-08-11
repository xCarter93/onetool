import { describe, expect, it } from "vitest";
import {
	resolveInvoiceActions,
	resolveQuoteActions,
	type InvoiceCapabilities,
	type InvoiceStatus,
	type QuoteCapabilities,
	type QuoteStatus,
	type RecordActionKey,
	type ResolvedAction,
} from "./record-actions";

const quoteCaps = (
	overrides: Partial<QuoteCapabilities> = {}
): QuoteCapabilities => ({
	canModify: true,
	canModifyInvoices: true,
	portalIssue: null,
	hasInvoice: false,
	...overrides,
});

const invoiceCaps = (
	overrides: Partial<InvoiceCapabilities> = {}
): InvoiceCapabilities => ({
	canModify: true,
	portalIssue: null,
	...overrides,
});

const keysBySlot = (actions: ResolvedAction[]) => ({
	primary: actions.filter((a) => a.slot === "primary").map((a) => a.key),
	secondary: actions.filter((a) => a.slot === "secondary").map((a) => a.key),
	overflow: actions.filter((a) => a.slot === "overflow").map((a) => a.key),
});

describe("resolveQuoteActions — aligned CTA table (full capabilities)", () => {
	const table: Record<
		QuoteStatus,
		{ primary: RecordActionKey[]; secondary: RecordActionKey[]; overflow: RecordActionKey[] }
	> = {
		draft: {
			primary: ["send_quote"],
			secondary: [],
			// mark_sent = delivered outside the portal, no email (visual-pass ask).
			overflow: ["mark_sent", "mark_approved"],
		},
		sent: {
			primary: ["mark_approved"],
			secondary: ["resend_quote"],
			// extend = validUntil is exempt from the draft-only lock; revert =
			// the unlock for content edits (Slice 4 rule).
			overflow: ["mark_declined", "extend_valid_until", "revert_to_draft"],
		},
		// No resend on approved — quotes.sendToClient rejects approved quotes.
		approved: {
			primary: ["convert_to_invoice"],
			secondary: [],
			overflow: [],
		},
		declined: {
			primary: ["send_quote"],
			secondary: [],
			overflow: [],
		},
		expired: {
			primary: ["send_quote"],
			secondary: [],
			// Extending an expired quote revives it to sent (backend flip).
			overflow: ["extend_valid_until", "mark_approved"],
		},
	};

	for (const [status, expected] of Object.entries(table)) {
		it(`resolves ${status}`, () => {
			const actions = resolveQuoteActions(status as QuoteStatus, quoteCaps());
			expect(keysBySlot(actions)).toEqual(expected);
			expect(actions.every((a) => !a.disabled)).toBe(true);
		});
	}

	it("labels declined/expired resends as 'Send again'", () => {
		for (const status of ["declined", "expired"] as const) {
			const [primary] = resolveQuoteActions(status, quoteCaps());
			expect(primary).toMatchObject({ key: "send_quote", label: "Send again" });
		}
	});

	it("swaps Convert for View invoice once converted", () => {
		const actions = resolveQuoteActions("approved", quoteCaps({ hasInvoice: true }));
		expect(keysBySlot(actions).primary).toEqual(["view_invoice"]);
		expect(actions.map((a) => a.key)).not.toContain("convert_to_invoice");
	});

	it("hides Convert without invoice-modify permission", () => {
		const actions = resolveQuoteActions(
			"approved",
			quoteCaps({ canModifyInvoices: false })
		);
		expect(keysBySlot(actions).primary).toEqual([]);
		expect(keysBySlot(actions).overflow).toEqual([]);
	});

	it("still shows View invoice to a viewer without any modify permission", () => {
		const actions = resolveQuoteActions(
			"approved",
			quoteCaps({ canModify: false, canModifyInvoices: false, hasInvoice: true })
		);
		expect(actions.map((a) => a.key)).toEqual(["view_invoice"]);
	});
});

describe("resolveQuoteActions — signature capability (reserved for Slice 3)", () => {
	it("upgrades the sent primary slot to Get signature", () => {
		const actions = resolveQuoteActions(
			"sent",
			quoteCaps({ signatureCapture: true })
		);
		expect(keysBySlot(actions)).toEqual({
			primary: ["get_signature"],
			secondary: ["resend_quote"],
			overflow: [
				"mark_approved",
				"mark_declined",
				"extend_valid_until",
				"revert_to_draft",
			],
		});
	});

	it("changes nothing outside sent", () => {
		for (const status of ["draft", "approved", "declined", "expired"] as const) {
			expect(resolveQuoteActions(status, quoteCaps({ signatureCapture: true }))).toEqual(
				resolveQuoteActions(status, quoteCaps())
			);
		}
	});
});

describe("resolveQuoteActions — permission and portal gating", () => {
	it("hides every write action without quote-modify permission", () => {
		for (const status of [
			"draft",
			"sent",
			"declined",
			"expired",
		] as QuoteStatus[]) {
			expect(
				resolveQuoteActions(status, quoteCaps({ canModify: false, canModifyInvoices: false }))
			).toEqual([]);
		}
	});

	it("disables (not hides) send actions with the portal reason", () => {
		for (const issue of ["no_portal_access", "no_primary_email"] as const) {
			const [send] = resolveQuoteActions("draft", quoteCaps({ portalIssue: issue }));
			expect(send.key).toBe("send_quote");
			expect(send.disabled).toBe(true);
			expect(send.disabledReason).toMatch(
				issue === "no_portal_access" ? /portal access/i : /primary contact/i
			);
		}
	});

	it("does not let a portal issue disable the manual status flips", () => {
		const actions = resolveQuoteActions(
			"sent",
			quoteCaps({ portalIssue: "no_portal_access" })
		);
		const approve = actions.find((a) => a.key === "mark_approved");
		const decline = actions.find((a) => a.key === "mark_declined");
		expect(approve?.disabled).toBe(false);
		expect(decline?.disabled).toBe(false);
		expect(actions.find((a) => a.key === "resend_quote")?.disabled).toBe(true);
	});
});

describe("resolveInvoiceActions — aligned CTA table (full capabilities)", () => {
	const table: Record<
		InvoiceStatus,
		{ primary: RecordActionKey[]; secondary: RecordActionKey[]; overflow: RecordActionKey[] }
	> = {
		draft: {
			primary: ["send_invoice"],
			secondary: [],
			overflow: ["record_payment"],
		},
		sent: {
			primary: ["record_payment"],
			secondary: ["share_pay_link"],
			overflow: ["resend_invoice"],
		},
		overdue: {
			primary: ["record_payment"],
			secondary: ["share_pay_link"],
			overflow: ["resend_invoice"],
		},
		paid: { primary: [], secondary: [], overflow: [] },
		cancelled: { primary: [], secondary: [], overflow: [] },
	};

	for (const [status, expected] of Object.entries(table)) {
		it(`resolves ${status}`, () => {
			const actions = resolveInvoiceActions(status as InvoiceStatus, invoiceCaps());
			expect(keysBySlot(actions)).toEqual(expected);
			expect(actions.every((a) => !a.disabled)).toBe(true);
		});
	}
});

describe("resolveInvoiceActions — permission and portal gating", () => {
	it("keeps Share pay link (a read) for users without modify permission", () => {
		for (const status of ["sent", "overdue"] as const) {
			const actions = resolveInvoiceActions(status, invoiceCaps({ canModify: false }));
			expect(actions.map((a) => a.key)).toEqual(["share_pay_link"]);
			expect(actions[0].disabled).toBe(false);
		}
	});

	it("hides everything on draft without modify permission", () => {
		expect(resolveInvoiceActions("draft", invoiceCaps({ canModify: false }))).toEqual([]);
	});

	it("disables send on draft with the portal reason", () => {
		for (const issue of ["no_portal_access", "no_primary_email"] as const) {
			const [send] = resolveInvoiceActions("draft", invoiceCaps({ portalIssue: issue }));
			expect(send).toMatchObject({ key: "send_invoice", disabled: true });
			expect(send.disabledReason).toBeTruthy();
		}
	});

	it("disables Share pay link only for missing portal access, not missing email", () => {
		const noAccess = resolveInvoiceActions(
			"sent",
			invoiceCaps({ portalIssue: "no_portal_access" })
		);
		expect(noAccess.find((a) => a.key === "share_pay_link")?.disabled).toBe(true);

		const noEmail = resolveInvoiceActions(
			"sent",
			invoiceCaps({ portalIssue: "no_primary_email" })
		);
		expect(noEmail.find((a) => a.key === "share_pay_link")?.disabled).toBe(false);
		// …while the email-dependent resend stays disabled.
		expect(noEmail.find((a) => a.key === "resend_invoice")?.disabled).toBe(true);
	});

	it("never offers Share pay link on a draft (portal setup happens at send)", () => {
		const actions = resolveInvoiceActions("draft", invoiceCaps());
		expect(actions.map((a) => a.key)).not.toContain("share_pay_link");
	});

	it("keeps Record payment enabled regardless of portal issues (cash needs no portal)", () => {
		const actions = resolveInvoiceActions(
			"overdue",
			invoiceCaps({ portalIssue: "no_portal_access" })
		);
		expect(actions.find((a) => a.key === "record_payment")?.disabled).toBe(false);
	});
});
