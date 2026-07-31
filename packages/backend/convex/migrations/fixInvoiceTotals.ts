import { internalMutation } from "../lib/triggers";

/**
 * Migration to fix invoices with $0 subtotal/total that have valid line items
 * This corrects historical data where subtotals were not properly calculated from line items
 */
export const fixInvoiceTotals = internalMutation({
	args: {},
	handler: async (ctx) => {
		// Get all invoices with subtotal = 0 or total = 0
		const invoices = await ctx.db.query("invoices").collect();
		const problematicInvoices = invoices.filter(
			(inv) => inv.subtotal === 0 || inv.total === 0
		);

		console.log(
			`Found ${problematicInvoices.length} invoices with $0 subtotal or total`
		);

		let fixedCount = 0;
		let skippedCount = 0;

		for (const invoice of problematicInvoices) {
			// Get all line items for this invoice
			const lineItems = await ctx.db
				.query("invoiceLineItems")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
				.collect();

			// Calculate subtotal from line items
			const calculatedSubtotal = lineItems.reduce(
				(sum, item) => sum + item.total,
				0
			);

			// Only fix if there are line items with value
			if (calculatedSubtotal > 0) {
				// Calculate total with discount and tax
				let calculatedTotal = calculatedSubtotal;
				if (invoice.discountAmount) {
					calculatedTotal -= invoice.discountAmount;
				}
				if (invoice.taxAmount) {
					calculatedTotal += invoice.taxAmount;
				}

				// Update the invoice
				await ctx.db.patch(invoice._id, {
					subtotal: calculatedSubtotal,
					total: calculatedTotal,
				});

				console.log(
					`Fixed invoice ${invoice.invoiceNumber}: $${calculatedSubtotal} subtotal, $${calculatedTotal} total (from ${lineItems.length} line items)`
				);
				fixedCount++;
			} else {
				console.log(
					`Skipped invoice ${invoice.invoiceNumber}: No line items with value`
				);
				skippedCount++;
			}
		}

		console.log(
			`Migration complete: Fixed ${fixedCount} invoices, skipped ${skippedCount} invoices`
		);

		return {
			totalProblematic: problematicInvoices.length,
			fixed: fixedCount,
			skipped: skippedCount,
		};
	},
});
