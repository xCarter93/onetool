import { describe, expect, it } from "vitest";
import type { StoredOp } from "./db";
import { pendingPaymentsForInvoice, remainingAfterPending } from "./pending-payments";

function op(overrides: Partial<StoredOp>): StoredOp {
	return {
		id: 1,
		partition: "p",
		chainKey: "invoice:inv1",
		operation: "payments.recordManualPayment",
		args: { invoiceId: "inv1", amount: 50, method: "cash" },
		idempotencyKey: "k1",
		capturedAt: 1000,
		status: "pending",
		attempts: 0,
		nextAttemptAt: 0,
		fileBytes: 0,
		replayConfirmed: false,
		display: { title: "Payment" },
		...overrides,
	};
}

describe("pendingPaymentsForInvoice", () => {
	it("returns open payment ops for the invoice, oldest first", () => {
		const ops = [
			op({ id: 2, capturedAt: 2000, args: { invoiceId: "inv1", amount: 20, method: "check" } }),
			op({ id: 1, capturedAt: 1000, args: { invoiceId: "inv1", amount: 50, method: "cash" } }),
		];
		expect(pendingPaymentsForInvoice(ops, "inv1")).toEqual([
			{ opId: 1, amount: 50, method: "cash", note: undefined, capturedAt: 1000, status: "pending" },
			{ opId: 2, amount: 20, method: "check", note: undefined, capturedAt: 2000, status: "pending" },
		]);
	});

	it("excludes ops for other invoices", () => {
		const ops = [op({ id: 1, args: { invoiceId: "other", amount: 10, method: "cash" } })];
		expect(pendingPaymentsForInvoice(ops, "inv1")).toEqual([]);
	});

	it("excludes non-payment operations", () => {
		const ops = [op({ id: 1, operation: "tasks.complete", args: { invoiceId: "inv1" } })];
		expect(pendingPaymentsForInvoice(ops, "inv1")).toEqual([]);
	});

	it("excludes resolved (no longer open) ops", () => {
		const ops = [op({ id: 1, status: "synced", resolvedAt: undefined, syncedAt: 1500 })];
		expect(pendingPaymentsForInvoice(ops, "inv1")).toEqual([]);
	});

	it("includes conflict and failed ops (still open until resolved)", () => {
		const ops = [op({ id: 1, status: "conflict" }), op({ id: 2, status: "failed" })];
		expect(pendingPaymentsForInvoice(ops, "inv1").map((p) => p.status)).toEqual([
			"conflict",
			"failed",
		]);
	});

	it("drops an op once it is marked resolved", () => {
		const ops = [op({ id: 1, status: "conflict", resolvedAt: 5000 })];
		expect(pendingPaymentsForInvoice(ops, "inv1")).toEqual([]);
	});
});

describe("remainingAfterPending", () => {
	const base = { opId: 1, method: "cash" as const, capturedAt: 0 };
	it("subtracts payments that will still apply, in whole cents", () => {
		expect(
			remainingAfterPending(100.3, [
				{ ...base, amount: 40.1, status: "pending" },
				{ ...base, amount: 20.1, status: "syncing" },
			]),
		).toBe(40.1);
	});

	it("ignores failed and conflicted payments and never goes below zero", () => {
		expect(
			remainingAfterPending(50, [
				{ ...base, amount: 30, status: "conflict" },
				{ ...base, amount: 80, status: "pending" },
			]),
		).toBe(0);
	});
});
