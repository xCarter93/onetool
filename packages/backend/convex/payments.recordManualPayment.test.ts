import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";

// payments.recordManualPayment settles installment rows in order, splitting the
// row the amount lands inside, and flips the invoice to paid when the last
// outstanding row settles. The sum-to-total invariant is strict, so every case
// re-checks that the rows still add up to the invoice total.
describe("payments.recordManualPayment", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seed(opts: {
		total?: number;
		status?: "draft" | "sent" | "paid" | "overdue" | "cancelled";
	} = {}) {
		const total = opts.total ?? 500;
		const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			return { clientId, clerkUserId, clerkOrgId };
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const now = Date.now();
		// Create via API so invoice aggregates initialize.
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: `INV-${Math.random().toString(36).slice(2, 8)}`,
			subtotal: total,
			total,
			status: opts.status ?? "draft",
			issuedDate: now,
			dueDate: now + 30 * 24 * 60 * 60 * 1000,
		});
		return { asUser, invoiceId, total, dueDate: now + 30 * 24 * 60 * 60 * 1000 };
	}

	/** Payment rows for an invoice in display (sortOrder) order. */
	async function rowsFor(invoiceId: Id<"invoices">): Promise<Doc<"payments">[]> {
		return await t.run(async (ctx) => {
			const all = await ctx.db
				.query("payments")
				.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", invoiceId))
				.collect();
			return all.sort((a, b) => a.sortOrder - b.sortOrder);
		});
	}

	it("records a full payment: row settles, invoice flips to paid", async () => {
		const { asUser, invoiceId, total, dueDate } = await seed({ total: 500 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: total, dueDate, description: "Full Payment", sortOrder: 0 },
			],
		});

		const result = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 500,
			method: "cash",
			note: "  paid on site  ",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result).toEqual({ invoicePaid: true, remaining: 0 });

		const rows = await rowsFor(invoiceId);
		expect(rows.length).toBe(1);
		expect(rows[0]!.status).toBe("paid");
		expect(typeof rows[0]!.paidAt).toBe("number");
		expect(rows[0]!.recordedOutsidePortal).toBe(true);
		expect(rows[0]!.manualMethod).toBe("cash");
		expect(rows[0]!.manualNote).toBe("paid on site");
		expect(rows[0]!.paymentAmount).toBe(500);

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("paid");
		expect(typeof invoice?.paidAt).toBe("number");
	});

	it("splits a single row on a partial payment and leaves the invoice alone", async () => {
		const { asUser, invoiceId, total, dueDate } = await seed({ total: 500 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: total, dueDate, description: "Full Payment", sortOrder: 0 },
			],
		});

		const result = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 200,
			method: "check",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result).toEqual({ invoicePaid: false, remaining: 300 });

		const rows = await rowsFor(invoiceId);
		expect(rows.length).toBe(2);
		expect(rows[0]!.status).toBe("paid");
		expect(rows[0]!.paymentAmount).toBe(200);
		expect(rows[0]!.manualMethod).toBe("check");
		expect(rows[1]!.status).toBe("pending");
		expect(rows[1]!.paymentAmount).toBe(300);
		expect(rows[1]!.manualMethod).toBeUndefined();
		// Sum-to-total invariant survives the split.
		expect(rows.reduce((s, r) => s + r.paymentAmount, 0)).toBe(500);

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("draft");
	});

	it("settles installments in order and splits the row the amount lands inside", async () => {
		const { asUser, invoiceId, dueDate } = await seed({ total: 500 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: 200, dueDate, description: "Deposit", sortOrder: 0 },
				{ paymentAmount: 300, dueDate, description: "Balance", sortOrder: 1 },
			],
		});

		const result = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 350,
			method: "cash",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result).toEqual({ invoicePaid: false, remaining: 150 });

		const rows = await rowsFor(invoiceId);
		expect(rows.length).toBe(3);
		expect(rows[0]!).toMatchObject({
			paymentAmount: 200,
			status: "paid",
			description: "Deposit",
		});
		expect(rows[1]!).toMatchObject({
			paymentAmount: 150,
			status: "paid",
			description: "Balance",
		});
		// The split remainder gets a distinct label so the portal/PDF never
		// show two same-named rows.
		expect(rows[2]!).toMatchObject({
			paymentAmount: 150,
			status: "pending",
			description: "Balance (balance)",
		});
		expect(rows.reduce((s, r) => s + r.paymentAmount, 0)).toBe(500);
	});

	it("flips the invoice to paid when a second partial clears the balance", async () => {
		const { asUser, invoiceId, total, dueDate } = await seed({ total: 500 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: total, dueDate, description: "Full Payment", sortOrder: 0 },
			],
		});

		const first = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 200,
			method: "check",
		});
		expect(first).toEqual({ invoicePaid: false, remaining: 300 });

		const second = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 300,
			method: "cash",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(second).toEqual({ invoicePaid: true, remaining: 0 });

		const rows = await rowsFor(invoiceId);
		expect(rows.length).toBe(2);
		expect(rows.every((r) => r.status === "paid")).toBe(true);
		expect(rows.reduce((s, r) => s + r.paymentAmount, 0)).toBe(500);

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("paid");
	});

	it("rejects an amount above the remaining balance", async () => {
		const { asUser, invoiceId, total, dueDate } = await seed({ total: 500 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: total, dueDate, description: "Full Payment", sortOrder: 0 },
			],
		});

		await expect(
			asUser.mutation(api.payments.recordManualPayment, {
				invoiceId,
				amount: 500.01,
				method: "cash",
			})
		).rejects.toThrow(/exceeds the remaining balance/i);
	});

	it("rejects a zero or negative amount", async () => {
		const { asUser, invoiceId, total, dueDate } = await seed({ total: 500 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: total, dueDate, description: "Full Payment", sortOrder: 0 },
			],
		});

		await expect(
			asUser.mutation(api.payments.recordManualPayment, {
				invoiceId,
				amount: 0,
				method: "cash",
			})
		).rejects.toThrow(/greater than zero/i);

		await expect(
			asUser.mutation(api.payments.recordManualPayment, {
				invoiceId,
				amount: -50,
				method: "cash",
			})
		).rejects.toThrow(/greater than zero/i);
	});

	it("refuses to record against a paid invoice", async () => {
		const { asUser, invoiceId } = await seed({ total: 500, status: "paid" });

		await expect(
			asUser.mutation(api.payments.recordManualPayment, {
				invoiceId,
				amount: 100,
				method: "cash",
			})
		).rejects.toThrow(/paid invoice/i);
	});

	it("refuses to record against a cancelled invoice", async () => {
		const { asUser, invoiceId } = await seed({ total: 500, status: "cancelled" });

		await expect(
			asUser.mutation(api.payments.recordManualPayment, {
				invoiceId,
				amount: 100,
				method: "cash",
			})
		).rejects.toThrow(/cancelled invoice/i);
	});

	it("splits the 'Full Payment' row on a never-sent draft", async () => {
		// Every invoice is born with one full-amount row, so cash-first field jobs
		// have something to settle against before the invoice is ever sent.
		const { asUser, invoiceId } = await seed({ total: 500 });
		expect((await rowsFor(invoiceId)).length).toBe(1);

		const result = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 200,
			method: "cash",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result).toEqual({ invoicePaid: false, remaining: 300 });

		const rows = await rowsFor(invoiceId);
		expect(rows.length).toBe(2);
		expect(rows[0]!).toMatchObject({
			paymentAmount: 200,
			status: "paid",
			description: "Full Payment",
		});
		expect(rows[1]!).toMatchObject({ paymentAmount: 300, status: "pending" });

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("draft");
	});

	it("pays a never-sent draft in full via the backfilled row", async () => {
		const { asUser, invoiceId } = await seed({ total: 500 });

		const result = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 500,
			method: "other",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(result).toEqual({ invoicePaid: true, remaining: 0 });

		const rows = await rowsFor(invoiceId);
		expect(rows.length).toBe(1);
		expect(rows[0]!.status).toBe("paid");

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("paid");
	});

	it("settles a 100 invoice in 33.33 / 33.33 / 33.34 with no floating-point drift", async () => {
		const { asUser, invoiceId, total, dueDate } = await seed({ total: 100 });
		await asUser.mutation(api.payments.configurePayments, {
			invoiceId,
			payments: [
				{ paymentAmount: total, dueDate, description: "Full Payment", sortOrder: 0 },
			],
		});

		const first = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 33.33,
			method: "cash",
		});
		expect(first).toEqual({ invoicePaid: false, remaining: 66.67 });

		const second = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 33.33,
			method: "cash",
		});
		expect(second).toEqual({ invoicePaid: false, remaining: 33.34 });

		const third = await asUser.mutation(api.payments.recordManualPayment, {
			invoiceId,
			amount: 33.34,
			method: "cash",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(third).toEqual({ invoicePaid: true, remaining: 0 });

		const rows = await rowsFor(invoiceId);
		expect(rows.every((r) => r.status === "paid")).toBe(true);
		expect(rows.map((r) => r.paymentAmount)).toEqual([33.33, 33.33, 33.34]);
		expect(rows.reduce((s, r) => s + Math.round(r.paymentAmount * 100), 0)).toBe(
			10000
		);

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("paid");
	});
});
