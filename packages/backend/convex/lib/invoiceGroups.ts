import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ActorScope, UserQueryCtx } from "./factories";

export const invoiceGroupProjectionValidator = v.object({
	_id: v.id("invoiceGroups"),
	sourceProjectId: v.id("projects"),
	projectTitle: v.string(),
	sourceQuoteId: v.id("quotes"),
	quoteNumber: v.optional(v.string()),
	agreementReference: v.optional(v.string()),
	serviceDate: v.number(),
	property: v.optional(v.object({
		id: v.id("clientProperties"),
		name: v.optional(v.string()),
		address: v.string(),
	})),
	subtotal: v.number(),
	discountAmount: v.number(),
	taxAmount: v.number(),
	total: v.number(),
	sortOrder: v.number(),
});

export type InvoiceGroupProjection = Infer<typeof invoiceGroupProjectionValidator>;

export async function projectInvoiceGroups(
	ctx: QueryCtx,
	invoice: Doc<"invoices">
): Promise<InvoiceGroupProjection[]> {
	const groups = await ctx.db.query("invoiceGroups")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id)).collect();
	return await Promise.all(groups.sort((a, b) => a.sortOrder - b.sortOrder).map(async (group) => {
		const [project, quote, revision] = await Promise.all([
			ctx.db.get(group.sourceProjectId),
			ctx.db.get(group.sourceQuoteId),
			group.sourceAgreementRevisionId ? ctx.db.get(group.sourceAgreementRevisionId) : null,
		]);
		if (
			!project || project.orgId !== invoice.orgId ||
			!quote || quote.orgId !== invoice.orgId || quote.clientId !== invoice.clientId ||
			(revision && revision.orgId !== invoice.orgId)
		) throw new Error("Invoice group source does not match its invoice organization");
		return {
			_id: group._id,
			sourceProjectId: group.sourceProjectId,
			projectTitle: project.title,
			sourceQuoteId: group.sourceQuoteId,
			quoteNumber: quote.quoteNumber,
			agreementReference: revision?.terms?.agreementReference,
			serviceDate: group.serviceDate,
			property: group.property,
			subtotal: group.subtotal,
			discountAmount: group.discountAmount,
			taxAmount: group.taxAmount,
			total: group.total,
			sortOrder: group.sortOrder,
		};
	}));
}

export async function isInvoiceInActorScope(
	ctx: Pick<UserQueryCtx, "hasAllRecords" | "actorScope" | "db">,
	invoice: Doc<"invoices">,
	scope?: ActorScope
): Promise<boolean> {
	if (scope === undefined && await ctx.hasAllRecords("invoices")) return true;
	const groups = await ctx.db.query("invoiceGroups")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id)).take(2);
	if (groups.length > 1 || (groups.length > 0 && !invoice.projectId)) return false;
	const actorScope = scope ?? await ctx.actorScope();
	if (groups.length === 1) return actorScope.projectIds.has(groups[0].sourceProjectId);
	return invoice.projectId
		? actorScope.projectIds.has(invoice.projectId)
		: actorScope.clientIds.has(invoice.clientId);
}
