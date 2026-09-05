import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { DateUtils } from "./lib/shared";
import {
	getDateRangeBounds,
	getMonthComparisonPeriods,
	getWeekRange,
} from "./lib/queries";
import { optionalUserQuery } from "./lib/factories";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
} from "./aggregates";
import { requireOrgWideView } from "./lib/orgWideView";
import { sumMoney } from "./lib/money";

/**
 * Home dashboard statistics queries
 * Provides real-time metrics for the business overview section
 */

/**
 * Status-scoped aggregate key range. Aggregate keys are [status, timestamp || 0],
 * so a lower bound of 1 excludes rows whose timestamp is unset — matching the
 * `&& completedAt` / `&& approvedAt` / `&& paidAt` guards these counts have
 * always applied.
 */
const statusRange = (
	status: string,
	from: number,
	to: number = Number.MAX_SAFE_INTEGER
) => ({
	lower: { key: [status, from] as [string, number], inclusive: true },
	upper: { key: [status, to] as [string, number], inclusive: true },
});

// Interface for home statistics
export interface HomeStats {
	totalClients: {
		current: number;
		previous: number;
		change: number;
		changeType: "increase" | "decrease" | "neutral";
	};
	completedProjects: {
		current: number;
		previous: number;
		change: number;
		changeType: "increase" | "decrease" | "neutral";
		totalValue: number;
	};
	approvedQuotes: {
		current: number;
		previous: number;
		change: number;
		changeType: "increase" | "decrease" | "neutral";
		totalValue: number;
	};
	invoicesPaid: {
		current: number;
		previous: number;
		change: number;
		changeType: "increase" | "decrease" | "neutral";
		totalValue: number;
		outstanding: number;
	};
	revenueGoal: {
		percentage: number;
		current: number;
		target: number;
		previousPercentage: number;
		changePercentage: number;
		changeType: "increase" | "decrease" | "neutral";
	};
	pendingTasks: {
		total: number;
		dueThisWeek: number;
	};
}

/**
 * Helper function to determine change type
 */
function getChangeType(change: number): "increase" | "decrease" | "neutral" {
	if (change > 0) return "increase";
	if (change < 0) return "decrease";
	return "neutral";
}

/**
 * Empty stats constant for unauthenticated users
 */
const EMPTY_HOME_STATS: HomeStats = {
	totalClients: {
		current: 0,
		previous: 0,
		change: 0,
		changeType: "neutral",
	},
	completedProjects: {
		current: 0,
		previous: 0,
		change: 0,
		changeType: "neutral",
		totalValue: 0,
	},
	approvedQuotes: {
		current: 0,
		previous: 0,
		change: 0,
		changeType: "neutral",
		totalValue: 0,
	},
	invoicesPaid: {
		current: 0,
		previous: 0,
		change: 0,
		changeType: "neutral",
		totalValue: 0,
		outstanding: 0,
	},
	revenueGoal: {
		percentage: 0,
		current: 0,
		target: 0,
		previousPercentage: 0,
		changePercentage: 0,
		changeType: "neutral",
	},
	pendingTasks: {
		total: 0,
		dueThisWeek: 0,
	},
};

/**
 * Get comprehensive home dashboard statistics
 */
export const getHomeStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<HomeStats> => {
		if (!ctx.orgId) return EMPTY_HOME_STATS;
		const userOrgId = ctx.orgId;
		await requireOrgWideView(
			ctx,
			"clients",
			"projects",
			"quotes",
			"invoices",
			"tasks"
		);

		const { thisMonthStart, lastMonthStart, lastMonthEnd } =
			getMonthComparisonPeriods();
		const weekRange = getWeekRange();

		const organization = await ctx.db.get(userOrgId);

		// Aggregate reads are awaited one at a time on purpose: convex-test tracks
		// the executing component on a single global stack, so concurrent reads
		// across different aggregates resolve against whichever component is on
		// top and hand back another aggregate's numbers. Batching the bounds keeps
		// this to one round-trip per aggregate rather than one per figure.
		const clientCounts = await clientCountsAggregate.countBatch(ctx, [
			{ namespace: userOrgId },
			{
				namespace: userOrgId,
				bounds: { lower: { key: thisMonthStart, inclusive: true } },
			},
			{
				namespace: userOrgId,
				bounds: {
					lower: { key: lastMonthStart, inclusive: true },
					upper: { key: lastMonthEnd, inclusive: true },
				},
			},
		]);
		const projectCounts = await projectCountsAggregate.countBatch(ctx, [
			{ namespace: userOrgId, bounds: statusRange("completed", 1) },
			{
				namespace: userOrgId,
				bounds: statusRange("completed", thisMonthStart),
			},
			{
				namespace: userOrgId,
				bounds: statusRange("completed", lastMonthStart, lastMonthEnd),
			},
		]);
		const quoteCounts = await quoteCountsAggregate.countBatch(ctx, [
			{ namespace: userOrgId, bounds: statusRange("approved", 1) },
			{ namespace: userOrgId, bounds: statusRange("approved", thisMonthStart) },
			{
				namespace: userOrgId,
				bounds: statusRange("approved", lastMonthStart, lastMonthEnd),
			},
		]);
		const quoteValues = await quoteCountsAggregate.sumBatch(ctx, [
			{ namespace: userOrgId, bounds: statusRange("approved", thisMonthStart) },
		]);
		const invoiceCounts = await invoiceRevenueAggregate.countBatch(ctx, [
			{ namespace: userOrgId, bounds: statusRange("paid", 1) },
			{ namespace: userOrgId, bounds: statusRange("paid", thisMonthStart) },
			{
				namespace: userOrgId,
				bounds: statusRange("paid", lastMonthStart, lastMonthEnd),
			},
		]);
		const invoiceValues = await invoiceRevenueAggregate.sumBatch(ctx, [
			{ namespace: userOrgId, bounds: statusRange("paid", thisMonthStart) },
			{
				namespace: userOrgId,
				bounds: statusRange("paid", lastMonthStart, lastMonthEnd),
			},
			// Outstanding is not time-bounded, so prefix-match the status alone.
			{ namespace: userOrgId, bounds: { prefix: ["sent"] as [string] } },
			{ namespace: userOrgId, bounds: { prefix: ["overdue"] as [string] } },
		]);

		const [completedProjects, orgInvoices, allTasks] = await Promise.all([
			// completedProjects.totalValue needs a project→invoice join no
			// aggregate models. Invoices are what a job is actually worth —
			// valuing them by approved quotes scored quote-less jobs at 0.
			ctx.db
				.query("projects")
				.withIndex("by_status", (q) =>
					q.eq("orgId", userOrgId).eq("status", "completed")
				)
				.collect(),
			ctx.db
				.query("invoices")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect(),
			// No status index on tasks — still a full org scan.
			ctx.db
				.query("tasks")
				.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
				.collect(),
		]);

		const [totalClients, clientsThisMonth, clientsLastMonth] = clientCounts;
		const [
			totalCompletedProjects,
			completedProjectsThisMonth,
			completedProjectsLastMonth,
		] = projectCounts;
		const [
			totalApprovedQuotes,
			approvedQuotesThisMonth,
			approvedQuotesLastMonth,
		] = quoteCounts;
		const [quotesTotalValue] = quoteValues;
		const [totalPaidInvoices, invoicesThisMonth, invoicesLastMonth] =
			invoiceCounts;
		const [currentRevenue, lastMonthRevenue, sentValue, overdueValue] =
			invoiceValues;

		const completedProjectIds = new Set(
			completedProjects
				.filter((p) => p.completedAt && p.completedAt >= thisMonthStart)
				.map((p) => p._id)
		);
		const projectsValue = sumMoney(
			orgInvoices
				.filter(
					(invoice) =>
						invoice.status !== "draft" &&
						invoice.status !== "cancelled" &&
						invoice.projectId &&
						completedProjectIds.has(invoice.projectId)
				)
				.map((invoice) => invoice.total)
		);

		const outstandingInvoices = sentValue + overdueValue;

		const clientsChange = clientsThisMonth - clientsLastMonth;
		const projectsChange =
			completedProjectsThisMonth - completedProjectsLastMonth;
		const quotesChange = approvedQuotesThisMonth - approvedQuotesLastMonth;
		const invoicesChange = invoicesThisMonth - invoicesLastMonth;

		// `||` (not `??`): an explicit target of 0 falls back to the default, as it
		// always has — which also keeps the divisions below non-zero.
		const monthlyTarget = organization?.monthlyRevenueTarget || 50000;
		const currentPercentage = Math.round((currentRevenue / monthlyTarget) * 100);
		const lastMonthPercentage = Math.round(
			(lastMonthRevenue / monthlyTarget) * 100
		);
		const revenuePercentageChange = currentPercentage - lastMonthPercentage;

		const pendingTasks = allTasks.filter(
			(task) => task.status === "pending" || task.status === "in-progress"
		);
		const tasksThisWeek = pendingTasks.filter(
			(task) => task.date >= weekRange.start && task.date < weekRange.end
		).length;

		return {
			totalClients: {
				current: totalClients,
				previous: totalClients - clientsThisMonth,
				change: Math.abs(clientsChange),
				changeType: getChangeType(clientsChange),
			},
			completedProjects: {
				current: totalCompletedProjects,
				previous: totalCompletedProjects - completedProjectsThisMonth,
				change: Math.abs(projectsChange),
				changeType: getChangeType(projectsChange),
				totalValue: projectsValue,
			},
			approvedQuotes: {
				current: totalApprovedQuotes,
				previous: totalApprovedQuotes - approvedQuotesThisMonth,
				change: Math.abs(quotesChange),
				changeType: getChangeType(quotesChange),
				totalValue: quotesTotalValue,
			},
			invoicesPaid: {
				current: totalPaidInvoices,
				previous: totalPaidInvoices - invoicesThisMonth,
				change: Math.abs(invoicesChange),
				changeType: getChangeType(invoicesChange),
				totalValue: currentRevenue,
				outstanding: outstandingInvoices,
			},
			revenueGoal: {
				percentage: currentPercentage,
				current: currentRevenue,
				target: monthlyTarget,
				previousPercentage: lastMonthPercentage,
				changePercentage: Math.abs(revenuePercentageChange),
				changeType: getChangeType(revenuePercentageChange),
			},
			pendingTasks: {
				total: pendingTasks.length,
				dueThisWeek: tasksThisWeek,
			},
		};
	},
});

/**
 * Get clients created by date range for daily chart visualization
 */
export const getClientsCreatedByDateRange = optionalUserQuery({
	args: {
		from: v.optional(v.number()),
		to: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		baselineCount: number;
		totalInRange: number;
		totalThroughEnd: number;
		data: Array<{
			date: string; // YYYY-MM-DD format
			count: number;
			_creationTime: number;
			status?: "lead" | "active" | "inactive" | "archived";
		}>;
	}> => {
		if (!ctx.orgId) {
			return {
				baselineCount: 0,
				totalInRange: 0,
				totalThroughEnd: 0,
				data: [],
			};
		}
		const userOrgId = ctx.orgId;
		await requireOrgWideView(ctx, "clients");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		const clientsThisMonth = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) =>
				q
					.eq("orgId", userOrgId)
					.gte("_creationTime", start)
					.lte("_creationTime", end)
			)
			.collect();

		// The baseline is only ever a count, so read it off the aggregate.
		const baselineCount = await clientCountsAggregate.count(ctx, {
			namespace: userOrgId,
			bounds: { upper: { key: start, inclusive: false } },
		});

		const data = clientsThisMonth.map((client: Doc<"clients">) => ({
			date: DateUtils.toLocalDateString(client._creationTime, timezone),
			count: 1, // Each client counts as 1
			_creationTime: client._creationTime,
			status: client.status as "lead" | "active" | "inactive" | "archived",
		}));

		const totalInRange = data.reduce((sum, item) => sum + item.count, 0);

		// Include baseline so charts can render cumulative totals across the selected window
		return {
			baselineCount,
			totalInRange,
			totalThroughEnd: baselineCount + totalInRange,
			data,
		};
	},
});

/**
 * Get projects completed by date range for daily chart visualization
 * Uses completedAt timestamp to show when projects were marked as completed
 */
export const getProjectsCompletedByDateRange = optionalUserQuery({
	args: {
		from: v.optional(v.number()),
		to: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		baselineCount: number;
		totalInRange: number;
		totalThroughEnd: number;
		data: Array<{
			date: string; // YYYY-MM-DD format
			count: number;
			_creationTime: number;
		}>;
	}> => {
		if (!ctx.orgId) {
			return {
				baselineCount: 0,
				totalInRange: 0,
				totalThroughEnd: 0,
				data: [],
			};
		}
		const userOrgId = ctx.orgId;
		await requireOrgWideView(ctx, "projects");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		const completed = await ctx.db
			.query("projects")
			.withIndex("by_status", (q) =>
				q.eq("orgId", userOrgId).eq("status", "completed")
			)
			.collect();

		const projectsThisMonthWithCompletedAt = completed.filter(
			(
				project
			): project is (typeof completed)[number] & {
				completedAt: number;
			} =>
				typeof project.completedAt === "number" &&
				project.completedAt >= start &&
				project.completedAt <= end
		);

		// Baseline is a count only; the aggregate's lower bound of 1 drops rows
		// with no completedAt, matching the typeof-number guard above.
		const baselineCount = await projectCountsAggregate.count(ctx, {
			namespace: userOrgId,
			bounds: {
				lower: { key: ["completed", 1] as [string, number], inclusive: true },
				upper: {
					key: ["completed", start] as [string, number],
					inclusive: false,
				},
			},
		});

		const data = projectsThisMonthWithCompletedAt.map((project) => ({
			date: DateUtils.toLocalDateString(project.completedAt, timezone),
			count: 1,
			_creationTime: project.completedAt,
		}));

		const totalInRange = data.reduce((sum, item) => sum + item.count, 0);

		return {
			baselineCount,
			totalInRange,
			totalThroughEnd: baselineCount + totalInRange,
			data,
		};
	},
});

/**
 * Get revenue received by date range for daily chart visualization
 */
export const getRevenueByDateRange = optionalUserQuery({
	args: {
		from: v.optional(v.number()),
		to: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args
	): Promise<
		Array<{
			date: string; // YYYY-MM-DD format
			count: number;
			_creationTime: number;
		}>
	> => {
		if (!ctx.orgId) return [];
		const userOrgId = ctx.orgId;
		await requireOrgWideView(ctx, "invoices");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		const paidInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_status", (q) =>
				q.eq("orgId", userOrgId).eq("status", "paid")
			)
			.collect();

		return paidInvoices
			.filter(
				(invoice) =>
					invoice.paidAt != null &&
					invoice.paidAt >= start &&
					invoice.paidAt <= end
			)
			.map((invoice) => ({
				date: DateUtils.toLocalDateString(invoice.paidAt!, timezone),
				count: invoice.total,
				_creationTime: invoice.paidAt!,
			}));
	},
});

/**
 * Get organization journey progress for Getting Started component
 * Returns completion status for all 8 onboarding steps
 */
export interface JourneyProgress {
	hasOrganization: boolean;
	hasClient: boolean;
	hasProject: boolean;
	hasQuote: boolean;
	hasESignature: boolean;
	hasInvoice: boolean;
	hasStripeConnect: boolean;
	hasPayment: boolean;
}

export const getJourneyProgress = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<JourneyProgress | null> => {
		if (!ctx.orgId) {
			return {
				hasOrganization: false,
				hasClient: false,
				hasProject: false,
				hasQuote: false,
				hasESignature: false,
				hasInvoice: false,
				hasStripeConnect: false,
				hasPayment: false,
			};
		}
		const userOrgId = ctx.orgId;
		// Cross-object onboarding checklist: callers missing any view grant get
		// null (checklist hidden) instead of FORBIDDEN — mobile/web render it
		// unconditionally and older shipped mobile builds can't skip-guard.
		const gates = await Promise.all([
			ctx.gateRead("clients"),
			ctx.gateRead("projects"),
			ctx.gateRead("quotes"),
			ctx.gateRead("documents"),
			ctx.gateRead("invoices"),
		]);
		if (gates.some((ok) => !ok)) return null;

		// Get organization to check metadata completion and Stripe Connect
		const organization = await ctx.db.get(userOrgId);
		const hasOrganization = organization?.isMetadataComplete === true;
		const hasStripeConnect = !!organization?.stripeConnectAccountId;

		// Parallel queries for optimal performance - use .first() for existence checks
		const [client, project, quote, documentWithBoldsign, invoice, paidInvoice] =
			await Promise.all([
				// Check if any clients exist
				ctx.db
					.query("clients")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.first(),

				// Check if any projects exist
				ctx.db
					.query("projects")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.first(),

				// Check if any quotes exist
				ctx.db
					.query("quotes")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.first(),

				// Any e-signed document. undefined sorts below every string in a
				// Convex index, so gte("") is exactly "boldsignDocumentId is set".
				ctx.db
					.query("documents")
					.withIndex("by_org_boldsign", (q) =>
						q.eq("orgId", userOrgId).gte("boldsignDocumentId", "")
					)
					.first(),

				// Check if any invoices exist
				ctx.db
					.query("invoices")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.first(),

				// Check if any paid invoices exist
				ctx.db
					.query("invoices")
					.withIndex("by_status", (q) =>
						q.eq("orgId", userOrgId).eq("status", "paid")
					)
					.first(),
			]);

		return {
			hasOrganization,
			hasClient: !!client,
			hasProject: !!project,
			hasQuote: !!quote,
			hasESignature: !!documentWithBoldsign,
			hasInvoice: !!invoice,
			hasStripeConnect,
			hasPayment: !!paidInvoice,
		};
	},
});
