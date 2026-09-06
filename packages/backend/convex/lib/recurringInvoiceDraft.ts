import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { computeGroupedInvoiceTotals } from "./groupedInvoiceMoney";
import { nextInvoiceNumber } from "./orgCounters";
import { recurringPaymentRuleKey } from "./recurringPaymentRules";
import {
	assertQuoteAvailableForBilling,
	recordQuoteBillingAllocation,
} from "./recurringBilling";

const MAX_QUOTES = 25;
const MAX_LINES = 500;

export type WriteRecurringInvoiceDraftArgs = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	createdByUserId: Id<"users">;
	quotes: Doc<"quotes">[];
	issuedDate: number;
	dueDate: number;
	billingPeriod?: string;
	paymentScheduleIsCustom?: boolean;
};

export async function writeRecurringInvoiceDraft(
	ctx: MutationCtx,
	args: WriteRecurringInvoiceDraftArgs,
): Promise<Id<"invoices">> {
	if (args.quotes.length === 0 || args.quotes.length > MAX_QUOTES) {
		throw new Error(`Recurring invoice drafts require 1-${MAX_QUOTES} quotes`);
	}
	const firstTerms = args.quotes[0].recurringAgreementTerms;
	if (!firstTerms) throw new Error("Recurring billing requires approved agreement terms");
	const paymentRuleKey = recurringPaymentRuleKey(firstTerms.paymentRule);
	for (const quote of args.quotes) {
		if (quote.orgId !== args.orgId || quote.clientId !== args.clientId) {
			throw new Error("Recurring invoice quotes must share one organization and client");
		}
		if (quote.status !== "approved" || !quote.projectId) {
			throw new Error("Every recurring invoice quote must be approved and project-linked");
		}
		if (quote.recurringAgreementTerms && recurringPaymentRuleKey(quote.recurringAgreementTerms.paymentRule) !== paymentRuleKey) {
			throw new Error("Recurring invoice quotes have incompatible payment rules");
		}
		await assertQuoteAvailableForBilling(ctx, quote);
	}

	const sources = [];
	let lineCount = 0;
	for (const quote of args.quotes) {
		const [project, lineItems] = await Promise.all([
			ctx.db.get(quote.projectId!),
			ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).take(MAX_LINES + 1),
		]);
		if (!project?.startDate) throw new Error("Recurring source project needs a service date");
		lineCount += lineItems.length;
		if (lineCount > MAX_LINES) throw new Error(`Recurring invoice drafts support at most ${MAX_LINES} lines`);
		sources.push({ quote, lineItems, project });
	}

	const calculated = computeGroupedInvoiceTotals(sources.map(({ quote, lineItems, project }) => ({
		sourceProjectId: project._id,
		sourceQuoteId: quote._id,
		sourceAgreementRevisionId: quote.recurringAgreementTerms?.revisionId,
		serviceDate: project.startDate!,
		property: quote.recurringAgreementTerms?.property,
		lineTotals: lineItems.map((line) => line.amount),
		discountEnabled: quote.discountEnabled,
		discountAmount: quote.discountAmount,
		discountType: quote.discountType,
		taxEnabled: quote.taxEnabled,
		taxRate: quote.taxRate,
	})));
	const invoiceId = await ctx.db.insert("invoices", {
		orgId: args.orgId,
		clientId: args.clientId,
		...(args.quotes.length === 1 ? {
			projectId: args.quotes[0].projectId,
			quoteId: args.quotes[0]._id,
			pdfSettings: args.quotes[0].pdfSettings,
		} : {}),
		createdByUserId: args.createdByUserId,
		invoiceNumber: await nextInvoiceNumber(ctx, args.orgId),
		status: "draft",
		subtotal: calculated.subtotal,
		discountAmount: calculated.discountAmount,
		taxAmount: calculated.taxAmount,
		total: calculated.total,
		issuedDate: args.issuedDate,
		dueDate: args.dueDate,
		recurringPaymentRule: firstTerms.paymentRule,
		paymentRuleSourceRevisionId: firstTerms.revisionId,
		paymentScheduleIsCustom: args.paymentScheduleIsCustom,
		recurringBillingPeriod: args.billingPeriod,
	});

	let lineSortOrder = 0;
	for (const [groupSortOrder, source] of sources.entries()) {
		const group = calculated.invoiceGroups[groupSortOrder];
		const invoiceGroupId = await ctx.db.insert("invoiceGroups", {
			orgId: args.orgId,
			invoiceId,
			...group,
			sortOrder: groupSortOrder,
		});
		for (const line of source.lineItems) {
			await ctx.db.insert("invoiceLineItems", {
				orgId: args.orgId,
				invoiceId,
				invoiceGroupId,
				sourceQuoteLineItemId: line._id,
				description: line.description,
				quantity: line.quantity,
				unit: line.unit,
				unitPrice: line.rate,
				total: line.amount,
				cost: line.cost,
				skuId: line.skuId,
				sortOrder: lineSortOrder++,
			});
		}
		await recordQuoteBillingAllocation(ctx, source.quote, invoiceId);
	}
	return invoiceId;
}
