// `invoices.dueDate` is derived from the payment schedule the way
// `syncInvoiceTotals` derives the stored totals from line items: it is the
// final deadline, so it tracks the last installment.
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { calculateRecurringPaymentSchedule } from "./recurringPaymentRules";

/**
 * Repoint an invoice's `dueDate` at its last outstanding-or-settled installment.
 * Call after any write that adds, moves or removes a payment row.
 *
 * Cancelled rows are voided installments, not deadlines, so they never set the
 * date; paid and refunded rows do, because money moving does not shorten the
 * schedule. A schedule with no such rows leaves the stored date alone.
 */
export async function syncInvoiceDueDate(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">
): Promise<void> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) return;

	const rows = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();

	const deadlines = rows
		.filter((p) => p.status !== "cancelled")
		.map((p) => p.dueDate);
	if (deadlines.length === 0) return;

	const lastDueDate = Math.max(...deadlines);
	if (invoice.dueDate !== lastDueDate) {
		await ctx.db.patch(invoiceId, { dueDate: lastDueDate });
	}
}

export async function materializeRecurringPaymentSchedule(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">,
	firstIssuedAt: number
): Promise<void> {
	const invoice = await ctx.db.get(invoiceId);
	if (
		!invoice?.recurringPaymentRule ||
		invoice.paymentScheduleIsCustom ||
		invoice.paymentScheduleAnchorAt !== undefined
	) return;

	const organization = await ctx.db.get(invoice.orgId);
	const calculated = calculateRecurringPaymentSchedule(
		invoice.recurringPaymentRule,
		invoice.total,
		firstIssuedAt,
		organization?.timezone ?? "UTC"
	);
	if (calculated.status === "review") {
		throw new Error("Recurring fixed installments exceed this invoice total and need review");
	}

	const existing = await ctx.db.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId)).collect();
	if (existing.some((row) => row.status === "paid" || row.status === "refunded")) {
		throw new Error("A settled payment prevents applying the recurring schedule");
	}
	for (const row of existing) await ctx.db.delete(row._id);
	for (const [sortOrder, payment] of calculated.installments.entries()) {
		await ctx.db.insert("payments", {
			orgId: invoice.orgId, invoiceId, paymentAmount: payment.paymentAmount,
			dueDate: payment.dueDate,
			description: payment.description ?? `Installment ${sortOrder + 1}`,
			sortOrder, status: "pending",
		});
	}
	await ctx.db.patch(invoiceId, {
		paymentScheduleAnchorAt: firstIssuedAt,
		dueDate: calculated.installments.at(-1)!.dueDate,
	});
}
