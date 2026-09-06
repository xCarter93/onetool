import { ConvexError, v } from "convex/values";
import { userMutation, type UserMutationCtx } from "./lib/factories";

async function requireReviewAccess(ctx: UserMutationCtx) {
	await ctx.requireLevel("projects", "modify");
	await ctx.requireLevel("quotes", "modify");
	await ctx.requireLevel("invoices", "modify");
	if (!(await ctx.hasAllRecords("projects")) || !(await ctx.hasAllRecords("quotes")) || !(await ctx.hasAllRecords("invoices")))
		throw new ConvexError("Organization-wide project, quote and invoice access is required for recurring billing review");
}

export const keepExistingInvoice = userMutation({
	args: { invoiceId: v.id("invoices") }, returns: v.null(),
	handler: async (ctx, args) => {
		await requireReviewAccess(ctx);
		const invoice = await ctx.orgEntity("invoices", args.invoiceId);
		if (invoice.status === "cancelled") throw new ConvexError("Cancelled invoices cannot be kept as the recurring billing resolution");
		if (!invoice.recurringBillingReview) throw new ConvexError("This invoice does not need recurring billing review");
		const allocations = await ctx.db.query("recurringBillingAllocations").withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id)).take(101);
		if (allocations.length > 100) throw new ConvexError("Invoice has too many recurring billing allocations to resolve at once");
		const review = allocations.filter((allocation) => allocation.orgId === ctx.orgId && allocation.state === "review");
		if (!review.length) throw new ConvexError("No recurring visit reviews are tied to this invoice");
		for (const allocation of review) await ctx.db.patch(allocation._id, { state: "allocated", reason: undefined });
		await ctx.db.patch(invoice._id, { recurringBillingReview: false });
		return null;
	},
});
