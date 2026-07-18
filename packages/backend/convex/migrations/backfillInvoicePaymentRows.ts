import { internalMutation } from "../_generated/server";

/**
 * One-time backfill: give every payable-but-unpaid invoice that has no payment
 * rows a single "Full Payment" row, so the client portal's native Elements flow
 * can pay it. Historically only `createFromQuote` seeded this row; manually
 * created invoices (`invoices.create`) had none and were view-only in the portal.
 * `sendToClient` now guarantees the row going forward — this covers invoices
 * already in a payable status. Idempotent: invoices with any payment row are
 * skipped, so re-running is safe.
 */
export const backfillInvoicePaymentRows = internalMutation({
	args: {},
	handler: async (ctx) => {
		let payable = 0;
		let seeded = 0;
		let skipped = 0;

		// Cursor-batched so we never hold the whole invoices table in memory.
		let cursor: string | null = null;
		for (;;) {
			const { page, isDone, continueCursor } = await ctx.db
				.query("invoices")
				.paginate({ numItems: 100, cursor });

			for (const invoice of page) {
				if (invoice.status !== "sent" && invoice.status !== "overdue") {
					continue;
				}
				payable++;

				const existing = await ctx.db
					.query("payments")
					.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
					.first();
				if (existing) {
					skipped++;
					continue;
				}

				await ctx.db.insert("payments", {
					orgId: invoice.orgId,
					invoiceId: invoice._id,
					paymentAmount: invoice.total,
					dueDate: invoice.dueDate,
					description: "Full Payment",
					sortOrder: 0,
					status: "pending",
				});
				seeded++;
			}

			if (isDone) break;
			cursor = continueCursor;
		}

		console.log(
			`backfillInvoicePaymentRows: seeded ${seeded}, skipped ${skipped} (of ${payable} payable invoices)`
		);

		return { payable, seeded, skipped };
	},
});
