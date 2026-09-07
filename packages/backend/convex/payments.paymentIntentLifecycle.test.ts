import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";
import { applyMarkPaidCascade } from "./lib/payments";
import { __setStripeFactoryForTests } from "./stripePaymentIntentActions";

// A live PaymentIntent is a chargeable promise. Anything that changes what the
// installment is worth, or settles it another way, has to cancel that promise
// on Stripe, and a success that still slips through must be kept as an
// exception rather than dropped.
describe("payments: PaymentIntent lifecycle", () => {
	let t: ReturnType<typeof setupConvexTest>;
	const ACCOUNT = "acct_lifecycle";

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		__setStripeFactoryForTests(null);
		vi.useRealTimers();
	});

	async function seed(opts: { amount?: number; pendingPi?: string } = {}) {
		const amount = opts.amount ?? 100;
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const org = await createTestOrg(ctx);
				await ctx.db.patch(org.orgId, { stripeConnectAccountId: ACCOUNT });
				const clientId = await createTestClient(ctx, org.orgId);
				return { ...org, clientId };
			}
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const now = Date.now();
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: `INV-${Math.random().toString(36).slice(2, 8)}`,
			subtotal: amount,
			total: amount,
			status: "sent",
			issuedDate: now,
			dueDate: now + 30 * 24 * 60 * 60 * 1000,
		});
		const paymentId = await t.run(async (ctx) => {
			const existing = await ctx.db
				.query("payments")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.first();
			const paymentId =
				existing?._id ??
				(await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: amount,
					dueDate: now + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "sent",
				}));
			if (opts.pendingPi) {
				await ctx.db.patch(paymentId, {
					pendingPaymentIntentId: opts.pendingPi,
					pendingPaymentIntentClientSecret: `${opts.pendingPi}_secret`,
					pendingPaymentIntentExpiresAt: now + 24 * 60 * 60 * 1000,
				});
				await ctx.db.insert("stripePaymentAttempts", {
					orgId,
					paymentId,
					invoiceId,
					stripeAccountId: ACCOUNT,
					paymentIntentId: opts.pendingPi,
					amount,
					status: "open",
					createdAt: now,
				});
			}
			return paymentId;
		});
		return { orgId, invoiceId, paymentId, asUser, amount };
	}

	function mockCancel() {
		const cancel = vi.fn().mockResolvedValue({ status: "canceled" });
		__setStripeFactoryForTests(() => ({ paymentIntents: { cancel } }) as never);
		return cancel;
	}

	async function attemptFor(paymentIntentId: string, orgId: Id<"organizations">) {
		return await t.run((ctx) =>
			ctx.db
				.query("stripePaymentAttempts")
				.withIndex("by_org_payment_intent", (q) =>
					q.eq("orgId", orgId).eq("paymentIntentId", paymentIntentId)
				)
				.unique()
		);
	}

	it("an amount edit cancels the live PaymentIntent on Stripe", async () => {
		const { orgId, paymentId, asUser } = await seed({ pendingPi: "pi_edit" });
		const cancel = mockCancel();

		await asUser.mutation(api.payments.update, {
			id: paymentId,
			paymentAmount: 120,
		});

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.pendingPaymentIntentId).toBeUndefined();
		expect(payment?.pendingPaymentIntentClientSecret).toBeUndefined();
		expect((await attemptFor("pi_edit", orgId))?.status).toBe("canceled");

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(cancel).toHaveBeenCalledWith("pi_edit", expect.anything(), {
			stripeAccount: ACCOUNT,
		});
	});

	it("a due-date edit keeps the live PaymentIntent", async () => {
		const { paymentId, asUser } = await seed({ pendingPi: "pi_keep" });
		const cancel = mockCancel();

		await asUser.mutation(api.payments.update, {
			id: paymentId,
			dueDate: Date.now() + 60 * 24 * 60 * 60 * 1000,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect((await t.run((ctx) => ctx.db.get(paymentId)))?.pendingPaymentIntentId).toBe("pi_keep");
		expect(cancel).not.toHaveBeenCalled();
	});

	it("removing a row that carries a Stripe reference tombstones it instead of deleting", async () => {
		const { paymentId, asUser } = await seed({ pendingPi: "pi_remove" });
		const cancel = mockCancel();

		await asUser.mutation(api.payments.remove, { id: paymentId });

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("cancelled");
		expect(payment?.pendingPaymentIntentId).toBeUndefined();
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	it("manual settlement cancels the live PaymentIntent, and a late Stripe success is kept as an exception", async () => {
		const { orgId, paymentId, asUser, amount } = await seed({
			pendingPi: "pi_late",
		});
		const cancel = mockCancel();

		await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId: (await t.run((ctx) => ctx.db.get(paymentId)))!.invoiceId,
			amount,
			method: "cash",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(cancel).toHaveBeenCalledWith("pi_late", expect.anything(), {
			stripeAccount: ACCOUNT,
		});

		// Stripe won the race: the cancel failed and the charge went through.
		await t.mutation(internal.payments.markPaidFromPaymentIntentWebhookInternal, {
			orgId,
			paymentIntentId: "pi_late",
			amountReceived: amount * 100,
			metadata: { paymentId },
		});

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.manualMethod).toBe("cash");
		expect(payment?.stripePaymentIntentId).toBeUndefined();
		expect(payment?.unappliedStripePaymentIntentIds).toEqual(["pi_late"]);
		const attempt = await attemptFor("pi_late", orgId);
		expect(attempt?.status).toBe("succeeded");
		expect(attempt?.outcome).toBe("unapplied");
		expect(attempt?.amountReceived).toBe(amount);
	});

	it("a late Stripe success alerts the owner with a payment_unapplied notification", async () => {
		const { orgId, paymentId, invoiceId, asUser, amount } = await seed({
			pendingPi: "pi_late_alert",
		});
		mockCancel();
		await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount,
			method: "cash",
		});

		await t.mutation(internal.payments.markPaidFromPaymentIntentWebhookInternal, {
			orgId,
			paymentIntentId: "pi_late_alert",
			amountReceived: amount * 100,
			metadata: { paymentId },
		});
		// A redelivery must not alert twice.
		await t.mutation(internal.payments.markPaidFromPaymentIntentWebhookInternal, {
			orgId,
			paymentIntentId: "pi_late_alert",
			amountReceived: amount * 100,
			metadata: { paymentId },
		});

		const { alerts, org, invoice } = await t.run(async (ctx) => ({
			alerts: (
				await ctx.db
					.query("notifications")
					.withIndex("by_org", (q) => q.eq("orgId", orgId))
					.collect()
			).filter((n) => n.notificationType === "payment_unapplied"),
			org: await ctx.db.get(orgId),
			invoice: await ctx.db.get(invoiceId),
		}));
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({
			userId: org?.ownerUserId,
			priority: "high",
			paymentId,
			entityType: "invoice",
			entityId: invoiceId,
		});
		expect(alerts[0].message).toContain("$100.00");
		expect(alerts[0].message).toContain(invoice?.invoiceNumber);
		expect(alerts[0].message).toContain("pi_late_alert");
	});

	it("a success for a different intent on an already-paid row is recorded, not dropped", async () => {
		const { orgId, invoiceId, paymentId } = await seed();
		await t.run((ctx) =>
			ctx.db.patch(paymentId, {
				status: "paid",
				paidAt: Date.now(),
				recordedOutsidePortal: true,
			})
		);

		await t.run((ctx) =>
			applyMarkPaidCascade(ctx, {
				paymentId,
				stripePaymentIntentId: "pi_late_success",
				source: "webhook-pi",
				amountReceived: 100,
			})
		);

		const payment = await t.run((ctx) => ctx.db.get(paymentId));
		expect(payment?.stripePaymentIntentId).toBeUndefined();
		expect(payment?.unappliedStripePaymentIntentIds).toEqual(["pi_late_success"]);
		const attempt = await attemptFor("pi_late_success", orgId);
		expect(attempt?.outcome).toBe("unapplied");
		expect(attempt?.invoiceId).toBe(invoiceId);
	});

	it("a replay of the settling intent stays a no-op", async () => {
		const { orgId, paymentId } = await seed();
		await t.run((ctx) =>
			ctx.db.patch(paymentId, {
				status: "paid",
				paidAt: Date.now(),
				stripePaymentIntentId: "pi_settled",
			})
		);
		await t.run((ctx) =>
			applyMarkPaidCascade(ctx, {
				paymentId,
				stripePaymentIntentId: "pi_settled",
				source: "webhook-pi",
				amountReceived: 100,
			})
		);
		expect((await t.run((ctx) => ctx.db.get(paymentId)))?.unappliedStripePaymentIntentIds).toBeUndefined();
		expect(await attemptFor("pi_settled", orgId)).toBeNull();
	});
	describe("cancelPaymentIntent retries", () => {
		function mockFailingCancel(err: unknown) {
			const cancel = vi.fn().mockRejectedValue(err);
			__setStripeFactoryForTests(() => ({ paymentIntents: { cancel } }) as never);
			return cancel;
		}

		async function pendingCancels() {
			const rows = await t.run((ctx) =>
				ctx.db.system.query("_scheduled_functions").collect()
			);
			return rows.filter(
				(job) => job.name === "stripePaymentIntentActions:cancelPaymentIntent"
			);
		}

		it("reschedules the cancel when Stripe is unreachable", async () => {
			mockFailingCancel(
				new Stripe.errors.StripeConnectionError({ message: "socket" } as never)
			);
			await t.action(internal.stripePaymentIntentActions.cancelPaymentIntent, {
				stripeAccountId: ACCOUNT,
				paymentIntentId: "pi_transient",
			});
			const scheduled = await pendingCancels();
			expect(scheduled).toHaveLength(1);
			expect(scheduled[0]!.args[0]).toMatchObject({
				paymentIntentId: "pi_transient",
				attempt: 2,
			});
		});

		it("gives up on an intent Stripe refuses to cancel", async () => {
			mockFailingCancel(
				new Stripe.errors.StripeInvalidRequestError({
					message: "already succeeded",
					code: "payment_intent_unexpected_state",
				} as never)
			);
			await t.action(internal.stripePaymentIntentActions.cancelPaymentIntent, {
				stripeAccountId: ACCOUNT,
				paymentIntentId: "pi_bad_state",
			});
			expect(await pendingCancels()).toHaveLength(0);
		});

		it("stops retrying at the attempt bound", async () => {
			mockFailingCancel(
				new Stripe.errors.StripeConnectionError({ message: "socket" } as never)
			);
			await t.action(internal.stripePaymentIntentActions.cancelPaymentIntent, {
				stripeAccountId: ACCOUNT,
				paymentIntentId: "pi_exhausted",
				attempt: 5,
			});
			expect(await pendingCancels()).toHaveLength(0);
		});
	});
});
