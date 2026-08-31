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
 * Unwinding a refund that Stripe later reported as failed. `refundedAmount` is
 * cumulative but the unwind subtracts one refund's own amount, so the handler
 * has to recognise a refund it already compensated.
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

	function revert(orgId: Id<"organizations">, refundId: string, cents: number) {
		return t.mutation(internal.payments.revertFailedRefundFromWebhookInternal, {
			orgId,
			paymentIntentId: PI,
			refundId,
			refundAmountCents: cents,
			failureReason: "declined",
		});
	}

	it("subtracts only the failed refund's own amount", async () => {
		const { orgId, paymentId } = await seed({
			status: "refunded",
			refundedAmount: 120,
			refundedAt: Date.now(),
		});

		await revert(orgId, "re_b", 7000);

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

		await revert(orgId, "re_b", 7000);
		await revert(orgId, "re_b", 7000);

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

		await revert(orgId, "re_b", 7000);
		await revert(orgId, "re_c", 3000);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.refundedAmount).toBe(20);
		expect(payment?.revertedRefundIds).toEqual(["re_b", "re_c"]);
	});

	it("does nothing when no refund was ever recorded", async () => {
		const { orgId, paymentId } = await seed({});

		await revert(orgId, "re_b", 7000);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.refundedAmount).toBeUndefined();
		expect(payment?.revertedRefundIds).toBeUndefined();
	});
});
