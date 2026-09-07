import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { dateKeyFromTimestamp } from "./projectRecurrence";
import {
	recurringPaymentRuleKey,
	type RecurringPaymentRule,
	validateRecurringPaymentRule,
} from "./recurringPaymentRules";
import {
	createAgreementRevisionDraft,
	applyApprovedAgreementRevision,
} from "./projectSeriesAgreements";

async function monthlyPointer(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
) {
	return ctx.db
		.query("clientMonthlyPaymentSchedules")
		.withIndex("by_org_client", (q) =>
			q.eq("orgId", orgId).eq("clientId", clientId),
		)
		.unique();
}

export async function cancelMonthlyPaymentProposal(
	ctx: MutationCtx,
	args: {
		orgId: Id<"organizations">;
		clientId: Id<"clients">;
		expectedVersionId: Id<"clientMonthlyPaymentScheduleVersions">;
	},
) {
	const pointer = await monthlyPointer(ctx, args.orgId, args.clientId);
	if (!pointer || pointer.pendingVersionId !== args.expectedVersionId)
		throw new ConvexError(
			"Monthly payment proposal changed; refresh and review it again",
		);
	const version = await ctx.db.get(args.expectedVersionId);
	if (
		!version ||
		version.orgId !== args.orgId ||
		version.clientId !== args.clientId ||
		(version.status !== "pending_approval" && version.status !== "scheduled")
	)
		throw new ConvexError(
			"This monthly payment proposal can no longer be cancelled",
		);
	const org = await ctx.db.get(args.orgId);
	const currentMonth = dateKeyFromTimestamp(
		Date.now(),
		org?.timezone ?? "UTC",
	).slice(0, 7);
	if (version.effectiveMonth && version.effectiveMonth <= currentMonth)
		throw new ConvexError(
			"This monthly payment schedule is already effective and cannot be cancelled",
		);
	const revisions: Doc<"projectSeriesAgreementRevisions">[] = [];
	for (const revisionId of version.agreementRevisionIds) {
		const revision = await ctx.db.get(revisionId);
		if (
			!revision ||
			revision.orgId !== args.orgId ||
			revision.monthlyPaymentScheduleVersionId !== version._id
		)
			throw new ConvexError(
				"Monthly payment proposal agreement links need review",
			);
		const series = await ctx.db.get(revision.seriesId);
		if (!series || series.orgId !== args.orgId)
			throw new ConvexError("Monthly payment proposal series needs review");
		if (series.activeAgreementRevisionId === revision._id)
			throw new ConvexError(
				"This monthly payment proposal has started activating and cannot be cancelled",
			);
		revisions.push(revision);
	}
	for (const revision of revisions) {
		const series = (await ctx.db.get(revision.seriesId))!;
		if (series.pendingAgreementRevisionId === revision._id)
			await ctx.db.patch(series._id, {
				pendingAgreementRevisionId: undefined,
				revision: (series.revision ?? 0) + 1,
			});
		if (revision.status !== "superseded")
			await ctx.db.patch(revision._id, { status: "superseded" });
	}
	await ctx.db.patch(version._id, { status: "cancelled" });
	await ctx.db.patch(pointer._id, { pendingVersionId: undefined });
}

export async function proposeFuturePaymentRule(
	ctx: MutationCtx,
	args: {
		invoiceId: Id<"invoices">;
		rule: RecurringPaymentRule;
		expectedRevisionId?: Id<"projectSeriesAgreementRevisions">;
		createdByUserId: Id<"users">;
	},
) {
	validateRecurringPaymentRule(args.rule);
	const invoice = await ctx.db.get(args.invoiceId);
	if (
		!invoice?.paymentRuleSourceRevisionId ||
		invoice.paymentRuleSourceRevisionId !== args.expectedRevisionId
	)
		throw new ConvexError(
			"Invoice agreement changed; review the future payment arrangement again",
		);
	const sourceRevision = await ctx.db.get(invoice.paymentRuleSourceRevisionId);
	if (
		!sourceRevision?.terms ||
		sourceRevision.orgId !== invoice.orgId ||
		sourceRevision.terms.client.id !== invoice.clientId
	)
		throw new ConvexError("Recurring invoice agreement is unavailable");
	if (sourceRevision.terms.billingMode === "per_visit") {
		const series = await ctx.db.get(sourceRevision.seriesId);
		const active = series?.activeAgreementRevisionId
			? await ctx.db.get(series.activeAgreementRevisionId)
			: null;
		if (
			!active ||
			active.orgId !== invoice.orgId ||
			active._id !== sourceRevision._id
		)
			throw new ConvexError(
				"Use an invoice under the current agreement to change future payments",
			);
		const revision = await createAgreementRevisionDraft(
			ctx,
			active,
			args.createdByUserId,
			args.rule,
		);
		return { quoteIds: [revision.quoteId] };
	}
	let pointer = await monthlyPointer(ctx, invoice.orgId, invoice.clientId);
	if (pointer?.pendingVersionId)
		throw new ConvexError(
			"A shared monthly payment change is already awaiting approval or its effective month",
		);
	const seriesRows = await ctx.db
		.query("projectSeries")
		.withIndex("by_org_client", (q) =>
			q.eq("orgId", invoice.orgId).eq("clientId", invoice.clientId),
		)
		.take(201);
	if (seriesRows.length > 200)
		throw new ConvexError(
			"Client recurring setup is too large to change at once",
		);
	const activeRevisions: Doc<"projectSeriesAgreementRevisions">[] = [];
	for (const series of seriesRows) {
		if (!series.activeAgreementRevisionId || series.state === "ended") continue;
		const active = await ctx.db.get(series.activeAgreementRevisionId);
		if (active?.terms?.billingMode !== "monthly") continue;
		if (series.pendingAgreementRevisionId)
			throw new ConvexError(
				"Finish the pending agreement revisions before changing shared monthly payments",
			);
		activeRevisions.push(active);
	}
	if (!activeRevisions.length || activeRevisions.length > 20)
		throw new ConvexError(
			"A monthly payment change supports 1 to 20 participating series",
		);
	const originalRule = activeRevisions[0].terms!.paymentRule;
	if (
		activeRevisions.some(
			(r) =>
				recurringPaymentRuleKey(r.terms!.paymentRule) !==
				recurringPaymentRuleKey(originalRule),
		)
	)
		throw new ConvexError(
			"Resolve the existing monthly payment differences before proposing another arrangement",
		);
	const latest = await ctx.db
		.query("clientMonthlyPaymentScheduleVersions")
		.withIndex("by_org_client_version", (q) =>
			q.eq("orgId", invoice.orgId).eq("clientId", invoice.clientId),
		)
		.order("desc")
		.first();
	let version = (latest?.version ?? 0) + 1;
	const seriesIds = activeRevisions.map((r) => r.seriesId);
	if (!pointer) {
		const baselineId = await ctx.db.insert(
			"clientMonthlyPaymentScheduleVersions",
			{
				orgId: invoice.orgId,
				clientId: invoice.clientId,
				version: version++,
				rule: originalRule,
				seriesIds,
				approvedSeriesIds: seriesIds,
				agreementRevisionIds: activeRevisions.map((r) => r._id),
				status: "active",
				createdAt: Date.now(),
				createdByUserId: args.createdByUserId,
			},
		);
		const id = await ctx.db.insert("clientMonthlyPaymentSchedules", {
			orgId: invoice.orgId,
			clientId: invoice.clientId,
			activeVersionId: baselineId,
		});
		pointer = (await ctx.db.get(id))!;
	}
	const monthlyScheduleVersionId = await ctx.db.insert(
		"clientMonthlyPaymentScheduleVersions",
		{
			orgId: invoice.orgId,
			clientId: invoice.clientId,
			version,
			rule: args.rule,
			seriesIds,
			approvedSeriesIds: [],
			agreementRevisionIds: [],
			status: "pending_approval",
			createdAt: Date.now(),
			createdByUserId: args.createdByUserId,
		},
	);
	const quoteIds: Id<"quotes">[] = [];
	const agreementRevisionIds: Id<"projectSeriesAgreementRevisions">[] = [];
	for (const active of activeRevisions) {
		const proposed = await createAgreementRevisionDraft(
			ctx,
			active,
			args.createdByUserId,
			args.rule,
			monthlyScheduleVersionId,
		);
		quoteIds.push(proposed.quoteId);
		agreementRevisionIds.push(proposed.revisionId);
	}
	await ctx.db.patch(monthlyScheduleVersionId, { agreementRevisionIds });
	await ctx.db.patch(pointer._id, {
		pendingVersionId: monthlyScheduleVersionId,
	});
	return { quoteIds, monthlyScheduleVersionId };
}

export async function approveMonthlyPaymentRevision(
	ctx: MutationCtx,
	revision: Doc<"projectSeriesAgreementRevisions">,
	evidence: Doc<"quoteDecisionEvidence">,
): Promise<boolean> {
	if (!revision.monthlyPaymentScheduleVersionId) return false;
	const version = await ctx.db.get(revision.monthlyPaymentScheduleVersionId);
	if (
		!version ||
		version.orgId !== revision.orgId ||
		version.status !== "pending_approval" ||
		!version.agreementRevisionIds.includes(revision._id) ||
		!version.seriesIds.includes(revision.seriesId) ||
		recurringPaymentRuleKey(version.rule) !==
			recurringPaymentRuleKey(revision.terms!.paymentRule)
	)
		throw new ConvexError(
			"Monthly payment proposal is no longer awaiting this agreement approval",
		);
	const approvedSeriesIds = [
		...new Set([...version.approvedSeriesIds, revision.seriesId]),
	];
	await ctx.db.patch(revision._id, {
		status: "approved",
		decisionEvidenceId: evidence._id,
		approvedAt: evidence.decidedAt,
	});
	const allApproved = version.seriesIds.every((id) =>
		approvedSeriesIds.includes(id),
	);
	let effectiveMonth: string | undefined;
	if (allApproved) {
		const org = await ctx.db.get(revision.orgId);
		const month = dateKeyFromTimestamp(
			Date.now(),
			org?.timezone ?? "UTC",
		).slice(0, 7);
		const next = new Date(`${month}-01T00:00:00Z`);
		next.setUTCMonth(next.getUTCMonth() + 1);
		effectiveMonth = next.toISOString().slice(0, 7);
	}
	await ctx.db.patch(version._id, {
		approvedSeriesIds,
		status: allApproved ? "scheduled" : "pending_approval",
		effectiveMonth,
	});
	return true;
}

export async function activateMonthlyPaymentSchedule(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
): Promise<void> {
	const pointer = await monthlyPointer(ctx, orgId, clientId);
	if (!pointer?.pendingVersionId) return;
	const proposed = await ctx.db.get(pointer.pendingVersionId);
	const org = await ctx.db.get(orgId);
	const month = dateKeyFromTimestamp(Date.now(), org?.timezone ?? "UTC").slice(
		0,
		7,
	);
	if (
		!proposed ||
		proposed.status !== "scheduled" ||
		!proposed.effectiveMonth ||
		proposed.effectiveMonth > month
	)
		return;
	for (const revisionId of proposed.agreementRevisionIds) {
		const revision = await ctx.db.get(revisionId);
		if (!revision || revision.orgId !== orgId || revision.status !== "approved")
			throw new ConvexError("Monthly agreement approvals are incomplete");
		const series = await ctx.db.get(revision.seriesId);
		if (series?.activeAgreementRevisionId === revision._id) continue;
		await applyApprovedAgreementRevision(ctx, revision);
		await ctx.scheduler.runAfter(
			0,
			internal.recurringPaymentSchedules.activateClient,
			{ orgId, clientId },
		);
		return;
	}
	if (pointer.activeVersionId)
		await ctx.db.patch(pointer.activeVersionId, { status: "superseded" });
	await ctx.db.patch(proposed._id, { status: "active" });
	await ctx.db.patch(pointer._id, {
		activeVersionId: proposed._id,
		pendingVersionId: undefined,
	});
}

export async function monthlyRuleForPeriod(
	ctx: Pick<import("../_generated/server").QueryCtx, "db">,
	orgId: Id<"organizations">,
	clientId: Id<"clients">,
	period: string,
) {
	const versions = await ctx.db
		.query("clientMonthlyPaymentScheduleVersions")
		.withIndex("by_org_client_version", (q) =>
			q.eq("orgId", orgId).eq("clientId", clientId),
		)
		.order("desc")
		.take(101);
	if (versions.length > 100)
		throw new ConvexError("Monthly payment history needs review");
	return (
		versions.find(
			(version) =>
				(version.status === "active" ||
					version.status === "superseded" ||
					version.status === "scheduled") &&
				(!version.effectiveMonth || version.effectiveMonth <= period),
		)?.rule ?? null
	);
}

export async function assertMonthlyAgreementTerms(
	ctx: Pick<import("../_generated/server").QueryCtx, "db">,
	orgId: Id<"organizations">,
	terms: import("./recurringAgreementTerms").RecurringAgreementTerms,
) {
	if (terms.billingMode !== "monthly" || terms.monthlyPaymentScheduleVersionId)
		return;
	const pointer = await ctx.db
		.query("clientMonthlyPaymentSchedules")
		.withIndex("by_org_client", (q) =>
			q.eq("orgId", orgId).eq("clientId", terms.client.id),
		)
		.unique();
	if (pointer?.pendingVersionId)
		throw new ConvexError(
			"Finish the shared monthly payment change before adding or changing another monthly agreement",
		);
	const series = await ctx.db
		.query("projectSeries")
		.withIndex("by_org_client", (q) =>
			q.eq("orgId", orgId).eq("clientId", terms.client.id),
		)
		.take(201);
	if (series.length > 200)
		throw new ConvexError("Client recurring setup needs review");
	for (const row of series) {
		if (!row.activeAgreementRevisionId || row.state === "ended") continue;
		const active = await ctx.db.get(row.activeAgreementRevisionId);
		if (
			active?.terms?.billingMode === "monthly" &&
			recurringPaymentRuleKey(active.terms.paymentRule) !==
				recurringPaymentRuleKey(terms.paymentRule)
		)
			throw new ConvexError(
				"Monthly series share one payment arrangement. Change future payments from a monthly invoice to request approval for every affected agreement.",
			);
	}
}
