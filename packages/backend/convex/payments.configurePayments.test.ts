import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestInvoice,
	createTestIdentity,
} from "./test.helpers";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * The reschedule path: patch-in-place, the rows a reschedule may not touch, the
 * derived invoice.dueDate, and the one sanctioned overdue un-flip.
 */
describe("payments.configurePayments", () => {
	let t: ReturnType<typeof setupConvexTest>;

	const DAY = 24 * 60 * 60 * 1000;
	const TODAY = Date.UTC(2026, 7, 31);

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed(
		invoiceOverrides: Parameters<typeof createTestInvoice>[3] = {}
	) {
		const seeded = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
				total: 1000,
				...invoiceOverrides,
			});
			return { orgId, invoiceId, clerkUserId, clerkOrgId };
		});
		return {
			...seeded,
			asUser: t.withIdentity(
				createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId)
			),
		};
	}

	async function insertRow(
		orgId: Id<"organizations">,
		invoiceId: Id<"invoices">,
		row: Partial<Doc<"payments">> & { paymentAmount: number; dueDate: number }
	) {
		return await t.run(async (ctx) =>
			ctx.db.insert("payments", {
				orgId,
				invoiceId,
				sortOrder: 0,
				status: "pending",
				...row,
			})
		);
	}

	async function rowsOf(
		invoiceId: Id<"invoices">
	): Promise<Doc<"payments">[]> {
		return await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("payments")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.collect();
			return rows.sort((a, b) => a.sortOrder - b.sortOrder);
		});
	}

	async function invoiceOf(invoiceId: Id<"invoices">) {
		return await t.run(async (ctx) => ctx.db.get(invoiceId));
	}

	describe("patch in place", () => {
		it("keeps the row and its pending PaymentIntent when an id is sent", async () => {
			// The whole point of D17: recreating the row dropped the cached intent,
			// so rescheduling invalidated a checkout the client had open.
			const { orgId, invoiceId, asUser } = await seed();
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: TODAY,
				pendingPaymentIntentId: "pi_live_123",
				pendingPaymentIntentClientSecret: "pi_live_123_secret",
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ id: rowId, paymentAmount: 1000, dueDate: TODAY + 14 * DAY, sortOrder: 0 },
				],
			});

			const rows = await rowsOf(invoiceId);
			expect(rows).toHaveLength(1);
			expect(rows[0]!._id).toBe(rowId);
			expect(rows[0]!.dueDate).toBe(TODAY + 14 * DAY);
			expect(rows[0]!.pendingPaymentIntentId).toBe("pi_live_123");
		});

		it("recreates rows when no id is sent, and drops omitted ones", async () => {
			const { orgId, invoiceId, asUser } = await seed();
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: TODAY,
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 400, dueDate: TODAY + DAY, sortOrder: 0 },
					{ paymentAmount: 600, dueDate: TODAY + 2 * DAY, sortOrder: 1 },
				],
			});

			const rows = await rowsOf(invoiceId);
			expect(rows).toHaveLength(2);
			expect(rows.map((r) => r._id)).not.toContain(rowId);
		});

		it("rejects an id that is no longer part of the editable schedule", async () => {
			const { orgId, invoiceId, asUser } = await seed();
			const paidId = await insertRow(orgId, invoiceId, {
				paymentAmount: 400,
				dueDate: TODAY,
				status: "paid",
				paidAt: TODAY,
			});

			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ id: paidId, paymentAmount: 600, dueDate: TODAY, sortOrder: 0 },
					],
				})
			).rejects.toThrowError(/no longer editable/);
		});

		it("rejects two args claiming the same row", async () => {
			// They would collapse into one patch, leaving the schedule short of the
			// invoice total even though the sum validated.
			const { orgId, invoiceId, asUser } = await seed();
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: TODAY,
			});

			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ id: rowId, paymentAmount: 500, dueDate: TODAY, sortOrder: 0 },
						{ id: rowId, paymentAmount: 500, dueDate: TODAY, sortOrder: 1 },
					],
				})
			).rejects.toThrowError(/only appear once/);
		});
	});

	describe("rows a reschedule may not touch", () => {
		it("preserves a refunded row but makes the live schedule re-cover its amount", async () => {
			const { orgId, invoiceId, asUser } = await seed();
			const refundedId = await insertRow(orgId, invoiceId, {
				paymentAmount: 400,
				dueDate: TODAY - 10 * DAY,
				status: "refunded",
				refundedAmount: 400,
				refundedAt: TODAY - DAY,
			});

			// The 400 went back to the client, so 600 leaves the invoice short.
			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ paymentAmount: 600, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
					],
				})
			).rejects.toThrowError(/must equal invoice total/);

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 1000, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
				],
			});

			const rows = await rowsOf(invoiceId);
			expect(rows.map((r) => r._id)).toContain(refundedId);
			expect(rows.find((r) => r._id === refundedId)?.status).toBe("refunded");
		});

		it("counts a partially refunded paid row at what was kept", async () => {
			const { orgId, invoiceId, asUser } = await seed();
			await insertRow(orgId, invoiceId, {
				paymentAmount: 400,
				dueDate: TODAY - 10 * DAY,
				status: "paid",
				paidAt: TODAY - 9 * DAY,
				refundedAmount: 100,
				refundedAt: TODAY - DAY,
			});

			// 300 kept, so the live schedule owes 700 rather than 600.
			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ paymentAmount: 600, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
					],
				})
			).rejects.toThrowError(/must equal invoice total/);

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 700, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
				],
			});

			const rows = await rowsOf(invoiceId);
			expect(rows).toHaveLength(2);
		});

		it("preserves a cancelled row but makes the live schedule cover its amount", async () => {
			const { orgId, invoiceId, asUser } = await seed();
			const cancelledId = await insertRow(orgId, invoiceId, {
				paymentAmount: 400,
				dueDate: TODAY - 10 * DAY,
				status: "cancelled",
			});

			// A voided installment is not money in, so 600 leaves the invoice short.
			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ paymentAmount: 600, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
					],
				})
			).rejects.toThrowError(/must equal invoice total/);

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 1000, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
				],
			});

			const rows = await rowsOf(invoiceId);
			expect(rows.map((r) => r._id)).toContain(cancelledId);
		});
	});

	describe("derived invoice.dueDate", () => {
		it("points the invoice at the last installment", async () => {
			const { invoiceId, asUser } = await seed({ dueDate: TODAY });

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 400, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
					{ paymentAmount: 600, dueDate: TODAY + 45 * DAY, sortOrder: 1 },
				],
			});

			expect((await invoiceOf(invoiceId))?.dueDate).toBe(TODAY + 45 * DAY);
		});

		it("ignores cancelled rows when picking the last installment", async () => {
			const { orgId, invoiceId, asUser } = await seed({ dueDate: TODAY });
			await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: TODAY + 90 * DAY,
				status: "cancelled",
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 1000, dueDate: TODAY + 7 * DAY, sortOrder: 0 },
				],
			});

			expect((await invoiceOf(invoiceId))?.dueDate).toBe(TODAY + 7 * DAY);
		});

		it("follows a single row moved through payments.update", async () => {
			const { orgId, invoiceId, asUser } = await seed({ dueDate: TODAY });
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: TODAY,
			});

			await asUser.mutation(api.payments.update, {
				id: rowId,
				dueDate: TODAY + 21 * DAY,
			});

			expect((await invoiceOf(invoiceId))?.dueDate).toBe(TODAY + 21 * DAY);
		});

		it("falls back to the previous installment when the last one is removed", async () => {
			const { orgId, invoiceId, asUser } = await seed({ dueDate: TODAY });
			await insertRow(orgId, invoiceId, {
				paymentAmount: 400,
				dueDate: TODAY + 7 * DAY,
				sortOrder: 0,
			});
			const lastId = await insertRow(orgId, invoiceId, {
				paymentAmount: 600,
				dueDate: TODAY + 45 * DAY,
				sortOrder: 1,
			});

			await asUser.mutation(api.payments.remove, { id: lastId });

			expect((await invoiceOf(invoiceId))?.dueDate).toBe(TODAY + 7 * DAY);
		});
	});

	describe("overdue un-flip", () => {
		async function statusEvents(invoiceId: string) {
			return await t.run(async (ctx) => {
				const rows = await ctx.db.query("domainEvents").collect();
				return rows.filter(
					(row) =>
						row.eventType === "entity.status_changed" &&
						row.payload.entityId === invoiceId
				);
			});
		}

		it("returns an overdue invoice to sent when the schedule moves past today, and emits", async () => {
			const { orgId, invoiceId, asUser } = await seed({
				status: "overdue",
				dueDate: Date.now() - 10 * DAY,
				firstSentAt: Date.now() - 40 * DAY,
			});
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: Date.now() - 10 * DAY,
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						id: rowId,
						paymentAmount: 1000,
						dueDate: Date.now() + 14 * DAY,
						sortOrder: 0,
					},
				],
			});

			expect((await invoiceOf(invoiceId))?.status).toBe("sent");
			// Chunk 19's dunning guardrails stand down on status exit, so the emit is
			// what stops a sequence after someone grants more time.
			const events = await statusEvents(invoiceId);
			expect(events).toHaveLength(1);
			expect(events[0]!.payload).toMatchObject({
				oldValue: "overdue",
				newValue: "sent",
			});
		});

		it("leaves it overdue when the new schedule is still past due", async () => {
			const { orgId, invoiceId, asUser } = await seed({
				status: "overdue",
				dueDate: Date.now() - 30 * DAY,
				firstSentAt: Date.now() - 60 * DAY,
			});
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: Date.now() - 30 * DAY,
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						id: rowId,
						paymentAmount: 1000,
						dueDate: Date.now() - 2 * DAY,
						sortOrder: 0,
					},
				],
			});

			expect((await invoiceOf(invoiceId))?.status).toBe("overdue");
			expect(await statusEvents(invoiceId)).toHaveLength(0);
		});

		it("un-flips an invoice that never carried firstSentAt", async () => {
			// Hand-flipped to overdue, so the send meter was never debited; the
			// transition must not try to debit it on the way back out.
			const { orgId, invoiceId, asUser } = await seed({
				status: "overdue",
				dueDate: Date.now() - 5 * DAY,
			});
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: Date.now() - 5 * DAY,
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						id: rowId,
						paymentAmount: 1000,
						dueDate: Date.now() + 30 * DAY,
						sortOrder: 0,
					},
				],
			});

			const invoice = await invoiceOf(invoiceId);
			expect(invoice?.status).toBe("sent");
			expect(invoice?.firstSentAt).toBeUndefined();
		});

		it("leaves a sent invoice alone", async () => {
			const { orgId, invoiceId, asUser } = await seed({ status: "sent" });
			const rowId = await insertRow(orgId, invoiceId, {
				paymentAmount: 1000,
				dueDate: Date.now() + DAY,
			});

			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						id: rowId,
						paymentAmount: 1000,
						dueDate: Date.now() + 60 * DAY,
						sortOrder: 0,
					},
				],
			});

			expect((await invoiceOf(invoiceId))?.status).toBe("sent");
			expect(await statusEvents(invoiceId)).toHaveLength(0);
		});
	});
});
