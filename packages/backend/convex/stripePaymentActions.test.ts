import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import type { Id } from "./_generated/dataModel";

/**
 * Tests for stripePaymentActions verification gauntlet (Phase 14.2-04).
 *
 * Strategy: intercept `globalThis.fetch` so the Stripe Checkout Session
 * response body is fixture-controlled. verifyStripeSession is exercised
 * end-to-end against the real implementation, and the three new asserts
 * inside verifyAndMarkPaid / verifyAndMarkInvoicePaid are pinned by
 * mismatch-throws + a payment + invoice happy-path (FINDINGS L-4).
 */

type StripeFakeBody = {
	payment_status?: string;
	payment_intent?: string | { id: string } | null;
	amount_total?: number | null;
	metadata?: Record<string, string> | null;
};

/**
 * Build a fetch implementation that returns a fixed Stripe session body.
 * verifyStripeSession only calls one URL; we don't gate on it here.
 */
function fakeStripeFetch(body: StripeFakeBody): typeof fetch {
	return (async () => {
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

async function seedOrgClientInvoicePayment(
	t: ReturnType<typeof convexTest>,
	overrides: { paymentAmount: number; publicToken: string }
) {
	return await t.run(async (ctx) => {
		const { orgId } = await createTestOrg(ctx, {
			clerkOrgId: `org_${Math.random().toString(36).slice(2)}`,
		});
		await ctx.db.patch(orgId, { stripeConnectAccountId: "acct_test_123" });
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Test Client Co",
			status: "lead",
		});
		const invoiceId = await ctx.db.insert("invoices", {
			orgId,
			clientId,
			invoiceNumber: "INV-001",
			status: "sent",
			subtotal: overrides.paymentAmount,
			total: overrides.paymentAmount,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86400000,
			publicToken: "tok_invoice_unused",
		});
		const paymentId = await ctx.db.insert("payments", {
			orgId,
			invoiceId,
			paymentAmount: overrides.paymentAmount,
			dueDate: Date.now() + 86400000,
			sortOrder: 0,
			status: "pending",
			publicToken: overrides.publicToken,
		});
		return { orgId, clientId, invoiceId, paymentId };
	});
}

async function seedOrgClientInvoice(
	t: ReturnType<typeof convexTest>,
	overrides: { total: number; publicToken: string }
) {
	return await t.run(async (ctx) => {
		const { orgId } = await createTestOrg(ctx, {
			clerkOrgId: `org_${Math.random().toString(36).slice(2)}`,
		});
		await ctx.db.patch(orgId, { stripeConnectAccountId: "acct_test_123" });
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Test Client Co",
			status: "lead",
		});
		const invoiceId = await ctx.db.insert("invoices", {
			orgId,
			clientId,
			invoiceNumber: "INV-002",
			status: "sent",
			subtotal: overrides.total,
			total: overrides.total,
			issuedDate: Date.now(),
			dueDate: Date.now() + 86400000,
			publicToken: overrides.publicToken,
		});
		return { orgId, clientId, invoiceId };
	});
}

describe("stripePaymentActions.verifyAndMarkPaid — assertion gauntlet", () => {
	let t: ReturnType<typeof convexTest>;
	const STRIPE_KEY_PREV = process.env.STRIPE_SECRET_KEY;

	beforeEach(() => {
		t = setupConvexTest();
		process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		if (STRIPE_KEY_PREV === undefined) {
			delete process.env.STRIPE_SECRET_KEY;
		} else {
			process.env.STRIPE_SECRET_KEY = STRIPE_KEY_PREV;
		}
	});

	it("rejects when session metadata.publicToken does not match the caller token", async () => {
		await seedOrgClientInvoicePayment(t, {
			paymentAmount: 50,
			publicToken: "tok_real",
		});
		vi.stubGlobal(
			"fetch",
			fakeStripeFetch({
				payment_status: "paid",
				payment_intent: "pi_test_123",
				amount_total: 5000,
				metadata: { publicToken: "tok_attacker" },
			})
		);

		await expect(
			t.action(api.stripePaymentActions.verifyAndMarkPaid, {
				publicToken: "tok_real",
				stripeSessionId: "cs_test_123",
			})
		).rejects.toThrow(/publicToken mismatch/);
	});

	it("rejects when amountTotal does not match Math.round(payment.paymentAmount * 100)", async () => {
		await seedOrgClientInvoicePayment(t, {
			paymentAmount: 50,
			publicToken: "tok_real",
		});
		vi.stubGlobal(
			"fetch",
			fakeStripeFetch({
				payment_status: "paid",
				payment_intent: "pi_test_123",
				amount_total: 100, // expected 5000
				metadata: { publicToken: "tok_real" },
			})
		);

		await expect(
			t.action(api.stripePaymentActions.verifyAndMarkPaid, {
				publicToken: "tok_real",
				stripeSessionId: "cs_test_123",
			})
		).rejects.toThrow(/amount mismatch/);
	});

	it("rejects when session has no payment_intent (audit #14 — never store empty string)", async () => {
		await seedOrgClientInvoicePayment(t, {
			paymentAmount: 50,
			publicToken: "tok_real",
		});
		vi.stubGlobal(
			"fetch",
			fakeStripeFetch({
				payment_status: "paid",
				payment_intent: null,
				amount_total: 5000,
				metadata: { publicToken: "tok_real" },
			})
		);

		await expect(
			t.action(api.stripePaymentActions.verifyAndMarkPaid, {
				publicToken: "tok_real",
				stripeSessionId: "cs_test_123",
			})
		).rejects.toThrow(/no payment_intent/);
	});

	it("happy path: marks payment paid + stores the real paymentIntentId (no '' default)", async () => {
		const seeded = await seedOrgClientInvoicePayment(t, {
			paymentAmount: 50,
			publicToken: "tok_real",
		});
		vi.stubGlobal(
			"fetch",
			fakeStripeFetch({
				payment_status: "paid",
				payment_intent: "pi_test_happy",
				amount_total: 5000,
				metadata: { publicToken: "tok_real" },
			})
		);

		const returnedId = await t.action(
			api.stripePaymentActions.verifyAndMarkPaid,
			{
				publicToken: "tok_real",
				stripeSessionId: "cs_test_happy",
			}
		);

		expect(returnedId).toBe(seeded.paymentId);

		const payment = await t.run((ctx) => ctx.db.get(seeded.paymentId));
		expect(payment).not.toBeNull();
		expect(payment!.status).toBe("paid");
		expect(payment!.stripeSessionId).toBe("cs_test_happy");
		expect(payment!.stripePaymentIntentId).toBe("pi_test_happy");
		// Regression guard: never the audit-#14 empty string sentinel.
		expect(payment!.stripePaymentIntentId).not.toBe("");
	});
});

describe("stripePaymentActions.verifyAndMarkInvoicePaid — assertion gauntlet", () => {
	let t: ReturnType<typeof convexTest>;
	const STRIPE_KEY_PREV = process.env.STRIPE_SECRET_KEY;

	beforeEach(() => {
		t = setupConvexTest();
		process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		if (STRIPE_KEY_PREV === undefined) {
			delete process.env.STRIPE_SECRET_KEY;
		} else {
			process.env.STRIPE_SECRET_KEY = STRIPE_KEY_PREV;
		}
	});

	it("rejects when metadata.publicToken does not match the caller token (invoice variant)", async () => {
		await seedOrgClientInvoice(t, {
			total: 250,
			publicToken: "tok_invoice_real",
		});
		vi.stubGlobal(
			"fetch",
			fakeStripeFetch({
				payment_status: "paid",
				payment_intent: "pi_inv_1",
				amount_total: 25000,
				metadata: { publicToken: "tok_attacker" },
			})
		);

		await expect(
			t.action(api.stripePaymentActions.verifyAndMarkInvoicePaid, {
				publicToken: "tok_invoice_real",
				stripeSessionId: "cs_test_inv_1",
			})
		).rejects.toThrow(/publicToken mismatch/);
	});

	it("happy path (FINDINGS L-4): pins publicToken as the invoice metadata key + marks paid + stores real PI", async () => {
		const seeded = await seedOrgClientInvoice(t, {
			total: 250,
			publicToken: "tok_invoice_happy",
		});
		vi.stubGlobal(
			"fetch",
			fakeStripeFetch({
				payment_status: "paid",
				payment_intent: "pi_inv_happy",
				amount_total: 25000,
				metadata: { publicToken: "tok_invoice_happy" },
			})
		);

		const returnedId = (await t.action(
			api.stripePaymentActions.verifyAndMarkInvoicePaid,
			{
				publicToken: "tok_invoice_happy",
				stripeSessionId: "cs_test_inv_happy",
			}
		)) as Id<"invoices">;

		expect(returnedId).toBe(seeded.invoiceId);

		const invoice = await t.run((ctx) => ctx.db.get(seeded.invoiceId));
		expect(invoice).not.toBeNull();
		expect(invoice!.status).toBe("paid");
		expect(invoice!.stripeSessionId).toBe("cs_test_inv_happy");
		expect(invoice!.stripePaymentIntentId).toBe("pi_inv_happy");
		// Regression guard: audit #14 empty-string sentinel must be gone.
		expect(invoice!.stripePaymentIntentId).not.toBe("");
	});
});
