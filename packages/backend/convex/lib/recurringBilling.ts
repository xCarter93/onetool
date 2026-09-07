import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { agreementApprovalNotActivated } from "./recurringAgreementTerms";

export async function quoteBillingAllocation(
	ctx: Pick<QueryCtx, "db">,
	quote: Doc<"quotes">,
) {
	if (!quote.projectId) return null;
	return ctx.db
		.query("recurringBillingAllocations")
		.withIndex("by_project_quote", (q) =>
			q.eq("projectId", quote.projectId!).eq("quoteId", quote._id),
		)
		.unique();
}

export async function hasCurrentQuoteApprovalEvidence(
	ctx: Pick<QueryCtx, "db">,
	quote: Doc<"quotes">,
) {
	const evidence = await ctx.db
		.query("quoteDecisionEvidence")
		.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
		.order("desc")
		.first();
	return Boolean(
		evidence &&
		evidence.orgId === quote.orgId &&
		evidence.action === "approved" &&
		evidence.contentSnapshot?.approvalCycle === (quote.approvalCycle ?? 0),
	);
}

async function quoteAlreadyBilled(
	ctx: Pick<QueryCtx, "db">,
	quote: Doc<"quotes">,
) {
	const allocation = await quoteBillingAllocation(ctx, quote);
	// A rebilled allocation outlives its cancelled invoice's groups, so its state decides.
	if (allocation) return allocation.state !== "ready";
	if (
		await ctx.db
			.query("invoices")
			.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
			.first()
	)
		return true;
	return Boolean(
		await ctx.db
			.query("invoiceGroups")
			.withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", quote._id))
			.first(),
	);
}

export async function selectedBillableAdditions(
	ctx: Pick<QueryCtx, "db">,
	project: Doc<"projects">,
	baseQuote: Doc<"quotes">,
) {
	const quotes = await ctx.db
		.query("quotes")
		.withIndex("by_project", (q) => q.eq("projectId", project._id))
		.take(101);
	if (quotes.length > 100)
		throw new ConvexError(
			"This visit has too many quotes to review for billing",
		);
	const selected = quotes.filter(
		(quote) =>
			quote.recurringBillableAdditionSelectedAt !== undefined &&
			quote._id !== baseQuote._id,
	);
	const ready: Doc<"quotes">[] = [];
	for (const quote of selected) {
		if (
			quote.orgId !== project.orgId ||
			quote.clientId !== project.clientId ||
			quote.recurringAgreementSourceQuoteId
		)
			return {
				state: "held" as const,
				reason:
					"A selected billable addition has invalid recurring billing scope",
				quotes: [],
			};
		if (await quoteAlreadyBilled(ctx, quote)) continue;
		if (
			quote.status !== "approved" ||
			!(await hasCurrentQuoteApprovalEvidence(ctx, quote))
		)
			return {
				state: "held" as const,
				reason: "A selected billable addition needs current customer approval",
				quotes: [],
			};
		ready.push(quote);
	}
	return { state: "ready" as const, quotes: ready };
}

export async function assertQuoteAvailableForBilling(
	ctx: MutationCtx,
	quote: Doc<"quotes">,
) {
	if (quote.recurringAgreementSourceQuoteId) {
		throw new ConvexError({
			code: "CONFLICT",
			message:
				"Recurring agreement revision quotes document future terms and cannot be invoiced as another visit",
		});
	}
	const allocation = await quoteBillingAllocation(ctx, quote);
	if (allocation && allocation.state !== "ready")
		throw new ConvexError(
			"This visit is already billed or needs a billing decision before another invoice can be created",
		);
	const invoices = await ctx.db
		.query("invoices")
		.withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
		.take(101);
	const groups = await ctx.db
		.query("invoiceGroups")
		.withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", quote._id))
		.take(101);
	if (invoices.length > 100 || groups.length > 100)
		throw new ConvexError("Quote billing history needs review");
	const referenced = new Map(invoices.map((invoice) => [invoice._id, invoice]));
	for (const group of groups) {
		if (group.orgId !== quote.orgId)
			throw new ConvexError("Invalid billing attribution");
		if (!referenced.has(group.invoiceId)) {
			const invoice = await ctx.db.get(group.invoiceId);
			if (invoice) referenced.set(invoice._id, invoice);
			else if (!allocation)
				throw new ConvexError(
					"A previous invoice was removed. Review billing before rebilling this visit",
				);
		}
	}
	if (
		[...referenced.values()].some(
			(invoice) =>
				invoice.orgId !== quote.orgId ||
				invoice.status !== "cancelled" ||
				allocation?.state !== "ready",
		)
	)
		throw new ConvexError({
			code: "CONFLICT",
			message: "An invoice has already been created from this quote",
		});
}

export async function recordQuoteBillingAllocation(
	ctx: MutationCtx,
	quote: Doc<"quotes">,
	invoiceId: Id<"invoices">,
) {
	if (!quote.projectId) return;
	const project = await ctx.db.get(quote.projectId);
	if (!project?.recurringSeriesId || project.orgId !== quote.orgId) return;
	const allocation = await quoteBillingAllocation(ctx, quote);
	if (allocation) {
		if (allocation.state === "allocated" && allocation.invoiceId === invoiceId)
			return;
		if (allocation.state !== "ready")
			throw new ConvexError(
				"Visit billing allocation changed; review billing again",
			);
		await ctx.db.patch(allocation._id, {
			invoiceId,
			state: "allocated",
			reason: undefined,
		});
	} else {
		await ctx.db.insert("recurringBillingAllocations", {
			orgId: quote.orgId,
			seriesId: project.recurringSeriesId,
			projectId: project._id,
			quoteId: quote._id,
			invoiceId,
			state: "allocated",
			completedAt: project.completedAt ?? Date.now(),
			createdAt: Date.now(),
		});
	}
}

async function approvedAgreementRevision(
	ctx: Pick<QueryCtx, "db">,
	series: Doc<"projectSeries">,
) {
	const revision = series.activeAgreementRevisionId
		? await ctx.db.get(series.activeAgreementRevisionId)
		: null;
	return revision?.terms && revision.status === "approved" ? revision : null;
}

async function pendingAgreementProposal(
	ctx: Pick<QueryCtx, "db">,
	series: Doc<"projectSeries">,
) {
	const revision = series.pendingAgreementRevisionId
		? await ctx.db.get(series.pendingAgreementRevisionId)
		: null;
	const quote = revision ? await ctx.db.get(revision.sourceQuoteId) : null;
	if (!revision || !quote || quote.orgId !== series.orgId) return null;
	const notActivated = agreementApprovalNotActivated(revision, quote);
	const document = revision.approvalDocumentId
		? await ctx.db.get(revision.approvalDocumentId)
		: null;
	const delivered =
		quote.status === "sent" ||
		Boolean(
			document?.recurringSignatureSendState ||
			(document?.boldsign && document.boldsign.status !== "Draft"),
		);
	return {
		state: "agreement_pending" as const,
		quote,
		notActivated,
		reason: notActivated
			? "The agreement quote was marked approved by hand and is not active. Withdraw it from the series page, then get your client's approval."
			: delivered
				? "Your client has been asked to approve the recurring agreement."
				: "The recurring agreement has not been sent to your client yet.",
	};
}

// Best place to start an agreement: the designated quote, else this visit's draft.
async function agreementSetupQuote(
	ctx: Pick<QueryCtx, "db">,
	series: Doc<"projectSeries">,
	project: Doc<"projects">,
) {
	const designated = series.agreementQuoteId
		? await ctx.db.get(series.agreementQuoteId)
		: null;
	if (designated && designated.orgId === project.orgId) return designated;
	const quotes = await ctx.db
		.query("quotes")
		.withIndex("by_project", (q) => q.eq("projectId", project._id))
		.take(50);
	return (
		quotes.find(
			(quote) => quote.status === "draft" && quote.orgId === project.orgId,
		) ?? null
	);
}

export async function visitBillingContext(
	ctx: Pick<QueryCtx, "db">,
	project: Doc<"projects">,
) {
	const existingAllocations = project.recurringSeriesId
		? await ctx.db
				.query("recurringBillingAllocations")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.take(101)
		: [];
	if (existingAllocations.length > 100)
		throw new ConvexError("Visit billing history needs review");
	const review = existingAllocations.find(
		(allocation) =>
			allocation.state === "review" && allocation.orgId === project.orgId,
	);
	if (review)
		return {
			state: "review" as const,
			reason: review.reason,
			allocation: review,
		};
	if (
		project.recurringSeriesId &&
		!project.recurringState &&
		project.status !== "completed" &&
		project.status !== "cancelled"
	) {
		const openSeries = await ctx.db.get(project.recurringSeriesId);
		if (
			openSeries &&
			openSeries.orgId === project.orgId &&
			openSeries.state === "active" &&
			project.clientId === openSeries.clientId &&
			project.propertyId === openSeries.propertyId &&
			!(await approvedAgreementRevision(ctx, openSeries))
		) {
			const proposal = await pendingAgreementProposal(ctx, openSeries);
			if (proposal) return proposal;
			return {
				state: "no_agreement" as const,
				quote: await agreementSetupQuote(ctx, openSeries, project),
			};
		}
	}
	if (
		!project.recurringSeriesId ||
		project.recurringState ||
		project.status !== "completed"
	)
		return { state: "ineligible" as const };
	const series = await ctx.db.get(project.recurringSeriesId);
	if (
		!series ||
		series.orgId !== project.orgId ||
		project.clientId !== series.clientId ||
		project.propertyId !== series.propertyId
	)
		return {
			state: "needs_setup" as const,
			reason: "Visit scope differs from the recurring agreement",
		};
	if (series.agreementReviewRequired)
		return {
			state: "held" as const,
			reason:
				"The signed recurring agreement document changed and needs review",
		};
	const revision = series.activeAgreementRevisionId
		? await ctx.db.get(series.activeAgreementRevisionId)
		: null;
	if (!revision?.terms || revision.status !== "approved")
		return {
			state: "needs_setup" as const,
			reason: "Approve the recurring billing agreement",
		};
	const source = series.agreementQuoteId
		? await ctx.db.get(series.agreementQuoteId)
		: null;
	const ledger = await ctx.db
		.query("projectSeriesQuoteCopies")
		.withIndex("by_template_project", (q) =>
			q.eq("templateId", revision.templateId).eq("projectId", project._id),
		)
		.unique();
	const quote =
		source?.projectId === project._id
			? source
			: ledger?.quoteId
				? await ctx.db.get(ledger.quoteId)
				: null;
	if (
		!quote ||
		quote.orgId !== project.orgId ||
		quote.projectId !== project._id ||
		quote.clientId !== project.clientId
	)
		return {
			state: "needs_setup" as const,
			reason: "This visit needs a billing quote",
		};
	const allocation = await quoteBillingAllocation(ctx, quote);
	if (allocation && allocation.state !== "ready")
		return {
			state: allocation.state,
			reason: allocation.reason,
			allocation,
			quote,
			series,
			revision,
		};
	if (quote.status !== "approved")
		return {
			state: "held" as const,
			reason: quote.recurringQuoteOverride
				? "Visit changes are awaiting approval"
				: "Visit pricing is awaiting approval",
			quote,
			series,
			revision,
		};
	if (!quote.recurringAgreementTerms || !quote.recurringAgreementRevisionId)
		return {
			state: "needs_setup" as const,
			reason: "Review this visit's agreement pricing",
			quote,
			series,
			revision,
		};
	if (quote.recurringQuoteOverride) {
		if (!(await hasCurrentQuoteApprovalEvidence(ctx, quote)))
			return {
				state: "held" as const,
				reason: "Visit changes need customer approval",
				quote,
				series,
				revision,
			};
	} else if (
		!quote.recurringInheritedAt &&
		quote._id !== revision.sourceQuoteId
	) {
		return {
			state: "held" as const,
			reason: "Visit pricing needs approval",
			quote,
			series,
			revision,
		};
	}
	return { state: "ready" as const, quote, series, revision };
}
