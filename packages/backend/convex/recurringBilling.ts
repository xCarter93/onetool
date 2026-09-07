import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./lib/triggers";
import { userMutation, userQuery, type UserQueryCtx } from "./lib/factories";
import { dateKeyFromTimestamp } from "./lib/projectRecurrence";
import {
	hasCurrentQuoteApprovalEvidence,
	selectedBillableAdditions,
	visitBillingContext,
} from "./lib/recurringBilling";
import { writeRecurringInvoiceDraft } from "./lib/recurringInvoiceDraft";
import { recurringPaymentRuleKey } from "./lib/recurringPaymentRules";
import {
	activateMonthlyPaymentSchedule,
	monthlyRuleForPeriod,
} from "./lib/recurringPaymentChanges";

async function requireBillingAccess(ctx: UserQueryCtx, modify = false) {
	await ctx.requireLevel("projects", "view");
	await ctx.requireLevel("invoices", modify ? "modify" : "view");
	await ctx.requireLevel("quotes", "view");
	if (
		!(await ctx.hasAllRecords("projects")) ||
		!(await ctx.hasAllRecords("invoices")) ||
		!(await ctx.hasAllRecords("quotes"))
	)
		throw new ConvexError(
			"Organization-wide project, quote and invoice access is required for recurring billing",
		);
}

async function holdForReview(
	ctx: MutationCtx,
	quote: Doc<"quotes">,
	reason: string,
	now: number,
) {
	const existing = await ctx.db
		.query("recurringBillingAllocations")
		.withIndex("by_project_quote", (q) =>
			q.eq("projectId", quote.projectId!).eq("quoteId", quote._id),
		)
		.unique();
	if (existing) {
		await ctx.db.patch(existing._id, { state: "review", reason });
		return;
	}
	const sourceProject = await ctx.db.get(quote.projectId!);
	if (!sourceProject?.recurringSeriesId || sourceProject.orgId !== quote.orgId)
		throw new ConvexError("Invalid monthly billing source");
	await ctx.db.insert("recurringBillingAllocations", {
		orgId: quote.orgId,
		seriesId: sourceProject.recurringSeriesId,
		projectId: sourceProject._id,
		quoteId: quote._id,
		state: "review",
		reason,
		completedAt: sourceProject.completedAt ?? now,
		createdAt: now,
	});
}

async function draftMonthly(
	ctx: MutationCtx,
	project: Doc<"projects">,
	now: number,
	fixedPeriod?: string,
) {
	const org = await ctx.db.get(project.orgId);
	const timezone = org?.timezone ?? "UTC";
	const observedMonth = dateKeyFromTimestamp(now, timezone).slice(0, 7);
	const observedBoundary = Date.parse(`${observedMonth}-01T00:00:00Z`);
	const period =
		fixedPeriod ??
		new Date(observedBoundary - 86_400_000).toISOString().slice(0, 7);
	const currentMonth = new Date(
		Date.parse(`${period}-01T00:00:00Z`) + 32 * 86_400_000,
	)
		.toISOString()
		.slice(0, 7);
	let run = await ctx.db
		.query("recurringMonthlyBillingRuns")
		.withIndex("by_org_client_period", (q) =>
			q
				.eq("orgId", project.orgId)
				.eq("clientId", project.clientId)
				.eq("period", period),
		)
		.unique();
	if (
		run &&
		(run.invoiceId !== undefined ||
			run.candidateQuoteIds === undefined ||
			run.scanComplete)
	)
		return run.invoiceId ?? null;
	if (!run) {
		const runId = await ctx.db.insert("recurringMonthlyBillingRuns", {
			orgId: project.orgId,
			clientId: project.clientId,
			period,
			createdAt: now,
			candidateQuoteIds: [],
		});
		run = (await ctx.db.get(runId))!;
	}
	const page = await ctx.db
		.query("projects")
		.withIndex("by_org_client_status", (q) =>
			q
				.eq("orgId", project.orgId)
				.eq("clientId", project.clientId)
				.eq("status", "completed"),
		)
		.paginate({ cursor: run.scanCursor ?? null, numItems: 25 });
	const candidateIds = [...(run.candidateQuoteIds ?? [])];
	for (const visit of page.page) {
		if (
			!visit.completedAt ||
			dateKeyFromTimestamp(visit.completedAt, timezone).slice(0, 7) >=
				currentMonth
		)
			continue;
		const context = await visitBillingContext(ctx, visit);
		if (
			context.state !== "ready" ||
			context.quote.recurringAgreementTerms?.billingMode !== "monthly"
		)
			continue;
		const additions = await selectedBillableAdditions(
			ctx,
			visit,
			context.quote,
		);
		if (additions.state !== "ready") continue;
		if (!candidateIds.includes(context.quote._id))
			candidateIds.push(context.quote._id);
		if (candidateIds.length > 25)
			throw new ConvexError(
				"Monthly billing needs review: more than 25 eligible visits",
			);
	}
	await ctx.db.patch(run._id, {
		scanCursor: page.isDone ? undefined : page.continueCursor,
		candidateQuoteIds: candidateIds,
		scanComplete: page.isDone,
	});
	if (!page.isDone) {
		await ctx.scheduler.runAfter(
			0,
			internal.recurringBilling.continueMonthlyRun,
			{ runId: run._id },
		);
		return null;
	}
	const visits: { quote: Doc<"quotes">; additions: Doc<"quotes">[] }[] = [];
	let actor: Id<"users"> | undefined;
	for (const quoteId of candidateIds) {
		const candidate = await ctx.db.get(quoteId);
		if (!candidate?.projectId || candidate.orgId !== project.orgId) continue;
		const visit = await ctx.db.get(candidate.projectId);
		if (
			!visit ||
			visit.orgId !== project.orgId ||
			visit.clientId !== project.clientId ||
			!visit.completedAt ||
			dateKeyFromTimestamp(visit.completedAt, timezone).slice(0, 7) >=
				currentMonth
		)
			continue;
		const context = await visitBillingContext(ctx, visit);
		if (
			context.state !== "ready" ||
			context.quote._id !== quoteId ||
			context.quote.recurringAgreementTerms?.billingMode !== "monthly"
		)
			continue;
		const additions = await selectedBillableAdditions(
			ctx,
			visit,
			context.quote,
		);
		if (additions.state !== "ready") continue;
		visits.push({ quote: context.quote, additions: additions.quotes });
		actor ??= context.series.createdByUserId;
	}
	let invoiceId: Id<"invoices"> | undefined;
	if (visits.length && actor) {
		const visitRuleKey = (visit: { quote: Doc<"quotes"> }) =>
			recurringPaymentRuleKey(visit.quote.recurringAgreementTerms!.paymentRule);
		const periodRule = await monthlyRuleForPeriod(
			ctx,
			project.orgId,
			project.clientId,
			period,
		);
		const ruleKeys = new Set(visits.map(visitRuleKey));
		// Without a shared client schedule, mixed rules leave no way to pick which one the bill follows.
		const expectedKey = periodRule
			? recurringPaymentRuleKey(periodRule)
			: ruleKeys.size === 1
				? [...ruleKeys][0]
				: null;
		const billable = visits.filter(
			(visit) => visitRuleKey(visit) === expectedKey,
		);
		for (const visit of visits) {
			if (billable.includes(visit)) continue;
			for (const quote of [visit.quote, ...visit.additions])
				await holdForReview(
					ctx,
					quote,
					"Monthly visits have incompatible approved payment schedules",
					now,
				);
		}
		if (billable.length) {
			const today = Date.parse(
				`${dateKeyFromTimestamp(now, timezone)}T00:00:00Z`,
			);
			invoiceId = await writeRecurringInvoiceDraft(ctx, {
				orgId: project.orgId,
				clientId: project.clientId,
				createdByUserId: actor,
				quotes: billable.flatMap((visit) => [visit.quote, ...visit.additions]),
				issuedDate: today,
				dueDate: today + 30 * 86_400_000,
				billingPeriod: period,
			});
		}
	}
	await ctx.db.patch(run._id, { invoiceId, scanComplete: true });
	return invoiceId ?? null;
}

async function reconcileVisit(ctx: MutationCtx, project: Doc<"projects">) {
	const context = await visitBillingContext(ctx, project);
	if (context.state === "allocated") {
		const invoice = context.allocation.invoiceId
			? await ctx.db.get(context.allocation.invoiceId)
			: null;
		if (!invoice || invoice.status === "cancelled") {
			await ctx.db.patch(context.allocation._id, {
				state: "review",
				reason: "Invoice was cancelled or removed",
			});
			return null;
		}
		return invoice._id;
	}
	const series = project.recurringSeriesId
		? await ctx.db.get(project.recurringSeriesId)
		: null;
	const revision = series?.activeAgreementRevisionId
		? await ctx.db.get(series.activeAgreementRevisionId)
		: null;
	if (
		project.status === "completed" &&
		revision?.terms?.billingMode === "monthly"
	) {
		const invoiceId = await draftMonthly(ctx, project, Date.now());
		await activateMonthlyPaymentSchedule(ctx, project.orgId, project.clientId);
		return invoiceId;
	}
	if (context.state !== "ready") return null;
	const additions = await selectedBillableAdditions(
		ctx,
		project,
		context.quote,
	);
	if (additions.state !== "ready") return null;
	const today = Date.parse(
		`${dateKeyFromTimestamp(Date.now(), context.series.timezone)}T00:00:00Z`,
	);
	return writeRecurringInvoiceDraft(ctx, {
		orgId: project.orgId,
		clientId: project.clientId,
		createdByUserId: context.series.createdByUserId,
		quotes: [context.quote, ...additions.quotes],
		issuedDate: today,
		dueDate: today + 30 * 86_400_000,
	});
}

const billableAdditionValidator = v.object({
	quoteId: v.id("quotes"),
	title: v.optional(v.string()),
	quoteNumber: v.optional(v.string()),
	status: v.string(),
	selected: v.boolean(),
	eligible: v.boolean(),
});

export const listBillableAdditions = userQuery({
	args: { projectId: v.id("projects") },
	returns: v.array(billableAdditionValidator),
	handler: async (ctx, args) => {
		await requireBillingAccess(ctx);
		const project = await ctx.orgEntity("projects", args.projectId);
		if (!project.recurringSeriesId)
			throw new ConvexError("Billable additions require a recurring visit");
		const series = await ctx.orgEntity(
			"projectSeries",
			project.recurringSeriesId,
		);
		const rows = await ctx.db
			.query("quotes")
			.withIndex("by_project", (q) => q.eq("projectId", project._id))
			.take(101);
		if (rows.length > 100)
			throw new ConvexError(
				"This visit has too many quotes to review for billing",
			);
		const result = [];
		for (const quote of rows) {
			const isBase =
				quote._id === series.agreementQuoteId ||
				quote.recurringAgreementTerms !== undefined ||
				quote.recurringAgreementSourceQuoteId !== undefined;
			if (isBase) continue;
			result.push({
				quoteId: quote._id,
				title: quote.title,
				quoteNumber: quote.quoteNumber,
				status: quote.status,
				selected: quote.recurringBillableAdditionSelectedAt !== undefined,
				eligible:
					quote.status === "approved" &&
					(await hasCurrentQuoteApprovalEvidence(ctx, quote)),
			});
		}
		return result;
	},
});

export const setBillableAddition = userMutation({
	args: { quoteId: v.id("quotes"), selected: v.boolean() },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireBillingAccess(ctx, true);
		const quote = await ctx.orgEntity("quotes", args.quoteId);
		if (!quote.projectId)
			throw new ConvexError(
				"Billable additions must belong to a recurring visit",
			);
		const project = await ctx.orgEntity("projects", quote.projectId);
		if (!project.recurringSeriesId)
			throw new ConvexError("Billable additions require a recurring visit");
		const series = await ctx.orgEntity(
			"projectSeries",
			project.recurringSeriesId,
		);
		if (
			quote._id === series.agreementQuoteId ||
			quote.recurringAgreementTerms ||
			quote.recurringAgreementSourceQuoteId
		)
			throw new ConvexError(
				"The standing agreement quote cannot be selected as an addition",
			);
		if (
			args.selected &&
			(quote.status !== "approved" ||
				!(await hasCurrentQuoteApprovalEvidence(ctx, quote)))
		)
			throw new ConvexError(
				"Approve this addition with current customer evidence before selecting it for billing",
			);
		await ctx.db.patch(
			quote._id,
			args.selected
				? {
						recurringBillableAdditionSelectedAt: Date.now(),
						recurringBillableAdditionSelectedBy: ctx.user._id,
					}
				: {
						recurringBillableAdditionSelectedAt: undefined,
						recurringBillableAdditionSelectedBy: undefined,
					},
		);
		return null;
	},
});

export const getVisit = userQuery({
	args: { projectId: v.id("projects") },
	returns: v.object({
		state: v.string(),
		reason: v.optional(v.string()),
		quoteId: v.optional(v.id("quotes")),
		invoiceId: v.optional(v.id("invoices")),
		allocationId: v.optional(v.id("recurringBillingAllocations")),
		notActivated: v.optional(v.boolean()),
	}),
	handler: async (ctx, args) => {
		await requireBillingAccess(ctx);
		const project = await ctx.orgEntity("projects", args.projectId);
		const context = await visitBillingContext(ctx, project);
		if (context.state === "ready") {
			const additions = await selectedBillableAdditions(
				ctx,
				project,
				context.quote,
			);
			if (additions.state !== "ready")
				return {
					state: additions.state,
					reason: additions.reason,
					quoteId: context.quote._id,
				};
		}
		return {
			state: context.state,
			reason: "reason" in context ? context.reason : undefined,
			quoteId: "quote" in context ? context.quote?._id : undefined,
			invoiceId:
				"allocation" in context ? context.allocation?.invoiceId : undefined,
			allocationId:
				"allocation" in context ? context.allocation?._id : undefined,
			notActivated:
				"notActivated" in context ? context.notActivated : undefined,
		};
	},
});

export const draftVisit = userMutation({
	args: { projectId: v.id("projects") },
	returns: v.union(v.null(), v.id("invoices")),
	handler: async (ctx, args) => {
		await requireBillingAccess(ctx, true);
		return reconcileVisit(ctx, await ctx.orgEntity("projects", args.projectId));
	},
});

export const resolve = userMutation({
	args: {
		allocationId: v.id("recurringBillingAllocations"),
		resolution: v.union(
			v.literal("rebill"),
			v.literal("defer"),
			v.literal("nonbillable"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireBillingAccess(ctx, true);
		const allocation = await ctx.orgEntity(
			"recurringBillingAllocations",
			args.allocationId,
		);
		const invoice = allocation.invoiceId
			? await ctx.db.get(allocation.invoiceId)
			: null;
		if (invoice && invoice.orgId !== ctx.orgId)
			throw new ConvexError("Invalid invoice billing scope");
		if (invoice && invoice.status !== "cancelled")
			throw new ConvexError(
				"Cancel the existing invoice before choosing how to rebill this visit",
			);
		if (
			allocation.state !== "review" &&
			allocation.state !== "deferred" &&
			!(
				allocation.state === "allocated" &&
				(!invoice || invoice.status === "cancelled")
			)
		)
			throw new ConvexError("This visit does not need a billing decision");
		await ctx.db.patch(allocation._id, {
			state:
				args.resolution === "rebill"
					? "ready"
					: args.resolution === "defer"
						? "deferred"
						: "nonbillable",
			previousInvoiceId: allocation.invoiceId ?? allocation.previousInvoiceId,
			invoiceId: undefined,
			reason: undefined,
		});
		if (args.resolution === "rebill")
			await ctx.scheduler.runAfter(
				0,
				internal.recurringBilling.reconcileProject,
				{ projectId: allocation.projectId },
			);
		return null;
	},
});

export const reconcileProject = internalMutation({
	args: { projectId: v.id("projects") },
	returns: v.union(v.null(), v.id("invoices")),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		return project ? reconcileVisit(ctx, project) : null;
	},
});

export const continueMonthlyRun = internalMutation({
	args: { runId: v.id("recurringMonthlyBillingRuns") },
	returns: v.union(v.null(), v.id("invoices")),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.scanComplete) return run?.invoiceId ?? null;
		const project = await ctx.db
			.query("projects")
			.withIndex("by_org_client_status", (q) =>
				q
					.eq("orgId", run.orgId)
					.eq("clientId", run.clientId)
					.eq("status", "completed"),
			)
			.first();
		if (!project) {
			await ctx.db.patch(run._id, { scanComplete: true });
			return null;
		}
		return draftMonthly(ctx, project, Date.now(), run.period);
	},
});

export const sweepOrg = internalMutation({
	args: { orgId: v.id("organizations"), cursor: v.optional(v.string()) },
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await ctx.db
			.query("projects")
			.withIndex("by_status", (q) =>
				q.eq("orgId", args.orgId).eq("status", "completed"),
			)
			.paginate({ cursor: args.cursor ?? null, numItems: 25 });
		for (const project of result.page)
			if (project.recurringSeriesId)
				await ctx.scheduler.runAfter(
					0,
					internal.recurringBilling.reconcileProject,
					{ projectId: project._id },
				);
		if (!result.isDone)
			await ctx.scheduler.runAfter(0, internal.recurringBilling.sweepOrg, {
				orgId: args.orgId,
				cursor: result.continueCursor,
			});
		return null;
	},
});

export const sweep = internalMutation({
	args: { cursor: v.optional(v.string()) },
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await ctx.db
			.query("organizations")
			.paginate({ cursor: args.cursor ?? null, numItems: 25 });
		for (const org of result.page)
			await ctx.scheduler.runAfter(0, internal.recurringBilling.sweepOrg, {
				orgId: org._id,
			});
		if (!result.isDone)
			await ctx.scheduler.runAfter(0, internal.recurringBilling.sweep, {
				cursor: result.continueCursor,
			});
		return null;
	},
});
