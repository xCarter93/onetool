import { describe, it, expect, beforeEach } from "vitest";
import { internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestInvoice,
} from "./test.helpers";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Unwinding a refund that Stripe later reported as failed. The caller passes what
 * Stripe still counts as refunded on the charge, so the handler lowers
 * `refundedAmount` toward that figure and never subtracts an amount of its own.
 */
describe("payments.revertFailedRefundFromWebhookInternal", () => {
	let t: ReturnType<typeof setupConvexTest>;

	const PI = "pi_revert_test";

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed(paymentOverrides: Partial<Doc<"payments">>) {
		return await t.run(async (ctx) => {
			const { orgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
				total: 120,
				status: "paid",
			});
			const paymentId = await ctx.db.insert("payments", {
				orgId,
				invoiceId,
				paymentAmount: 120,
				dueDate: Date.now(),
				sortOrder: 0,
				status: "paid",
				paidAt: Date.now(),
				stripePaymentIntentId: PI,
				...paymentOverrides,
			});
			return { orgId, paymentId };
		});
	}

	/** `netCents` is what Stripe's remaining refunds add up to on the charge. */
	function revert(
		orgId: Id<"organizations">,
		refundId: string,
		netCents: number
	) {
		return t.mutation(internal.payments.revertFailedRefundFromWebhookInternal, {
			orgId,
			paymentIntentId: PI,
			refundId,
			netRefundedAmountCents: netCents,
			failureReason: "declined",
		});
	}

	it("lowers the refund to what Stripe still counts as standing", async () => {
		// $50 + $70 refunded, so the row reads fully refunded; the $70 then fails.
		const { orgId, paymentId } = await seed({
			status: "refunded",
			refundedAmount: 120,
			refundedAt: Date.now(),
		});

		await revert(orgId, "re_b", 5000);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.refundedAmount).toBe(50);
	});

	it("ignores a redelivery of the same refund id", async () => {
		const { orgId, paymentId } = await seed({
			status: "refunded",
			refundedAmount: 120,
			refundedAt: Date.now(),
		});

		await revert(orgId, "re_b", 5000);
		await revert(orgId, "re_b", 5000);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.refundedAmount).toBe(50);
		expect(payment?.revertedRefundIds).toEqual(["re_b"]);
	});

	it("still unwinds a different refund that fails afterwards", async () => {
		const { orgId, paymentId } = await seed({
			status: "refunded",
			refundedAmount: 120,
			refundedAt: Date.now(),
		});

		await revert(orgId, "re_b", 5000);
		await revert(orgId, "re_c", 0);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.refundedAmount).toBeUndefined();
		expect(payment?.refundedAt).toBeUndefined();
		expect(payment?.revertedRefundIds).toEqual(["re_b", "re_c"]);
	});

	it("leaves a refund alone when the failed one was never recorded", async () => {
		// charge.refunded for the $50 that still stands hasn't landed yet, so a
		// failure must not be the event that starts counting it.
		const { orgId, paymentId } = await seed({});

		await revert(orgId, "re_b", 5000);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.refundedAmount).toBeUndefined();
		expect(payment?.revertedRefundIds).toEqual(["re_b"]);
	});
});
