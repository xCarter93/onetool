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
	invoiceCountsAggregate,
	invoiceRevenueAggregate,
} from "./aggregates";
import { computeHomeStats } from "./homeStatsOptimized";

/**
 * Home dashboard statistics queries
 * Provides real-time metrics for the business overview section
 */

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
	invoicesSent: {
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
	invoicesSent: {
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
 * Get comprehensive home dashboard statistics.
 *
 * Delegates to the aggregate-based {@link computeHomeStats} so a single query
 * never scans an entire org table (which tripped Convex's document-read limit
 * on large orgs). This mirrors what the web and mobile dashboards call
 * directly via `homeStatsOptimized.getHomeStats`.
 */
export const getHomeStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<HomeStats> => {
		if (!ctx.orgId) return EMPTY_HOME_STATS;
		const userOrgId = ctx.orgId;
		await ctx.requireLevel("clients", "view");
		await ctx.requireLevel("projects", "view");
		await ctx.requireLevel("quotes", "view");
		await ctx.requireLevel("invoices", "view");
		await ctx.requireLevel("tasks", "view");

		return computeHomeStats(ctx, userOrgId);
	},
});

/**
 * Get simple task count for pending tasks widget
 */
// TODO: Candidate for deletion if confirmed unused.
export const getPendingTasksCount = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<{ count: number; dueThisWeek: number }> => {
		if (!ctx.orgId) return { count: 0, dueThisWeek: 0 };
		const userOrgId = ctx.orgId;
		await ctx.requireLevel("tasks", "view");
		const weekRange = getWeekRange();

		const pendingTasks = await ctx.db
			.query("tasks")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.or(
					q.eq(q.field("status"), "pending"),
					q.eq(q.field("status"), "in-progress")
				)
			)
			.collect();

		const dueThisWeek = pendingTasks.filter(
			(task) => task.date >= weekRange.start && task.date < weekRange.end
		).length;

		return {
			count: pendingTasks.length,
			dueThisWeek,
		};
	},
});

/**
 * Get clients count with month-over-month comparison
 */
// TODO: Candidate for deletion if confirmed unused.
export const getClientsStats = optionalUserQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{
		total: number;
		thisMonth: number;
		lastMonth: number;
		change: number;
		changeType: "increase" | "decrease" | "neutral";
	}> => {
		if (!ctx.orgId) {
			return {
				total: 0,
				thisMonth: 0,
				lastMonth: 0,
				change: 0,
				changeType: "neutral",
			};
		}
		const userOrgId = ctx.orgId;
		await ctx.requireLevel("clients", "view");
		const { thisMonthStart, lastMonthStart, lastMonthEnd } =
			getMonthComparisonPeriods();

		// Aggregate reads instead of a full-table `.collect()` so this never
		// scans the entire clients table for large orgs.
		const [total, thisMonth, lastMonth] = await Promise.all([
			clientCountsAggregate.count(ctx, { namespace: userOrgId }),
			clientCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: { lower: { key: thisMonthStart, inclusive: true } },
			}),
			clientCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: lastMonthStart, inclusive: true },
					upper: { key: lastMonthEnd, inclusive: true },
				},
			}),
		]);

		const change = thisMonth - lastMonth;

		return {
			total,
			thisMonth,
			lastMonth,
			change: Math.abs(change),
			changeType: getChangeType(change),
		};
	},
});

/**
 * Get revenue goal progress
 */
export const getRevenueGoalProgress = optionalUserQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{
		percentage: number;
		current: number;
		target: number;
		isOnTrack: boolean;
	}> => {
		if (!ctx.orgId) {
			return {
				percentage: 0,
				current: 0,
				target: 0,
				isOnTrack: false,
			};
		}
		const userOrgId = ctx.orgId;
		await ctx.requireLevel("invoices", "view");

		// Get organization to fetch revenue target
		const organization = await ctx.db.get(userOrgId);
		const monthlyTarget = organization?.monthlyRevenueTarget || 50000;

		// Sum this month's paid invoices via aggregate instead of collecting them,
		// so this query never scans the entire invoices table.
		const { thisMonthStart } = getMonthComparisonPeriods();
		const now = Date.now();
		const currentRevenue =
			(await invoiceRevenueAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["paid", thisMonthStart], inclusive: true },
					upper: { key: ["paid", now], inclusive: true },
				},
			})) || 0;

		const percentage = Math.round((currentRevenue / monthlyTarget) * 100);

		// Consider "on track" if we're at least at the expected percentage for this point in the month
		const daysInMonth = new Date(
			new Date().getFullYear(),
			new Date().getMonth() + 1,
			0
		).getDate();
		const dayOfMonth = new Date().getDate();
		const expectedPercentage = Math.round((dayOfMonth / daysInMonth) * 100);

		return {
			percentage,
			current: currentRevenue,
			target: monthlyTarget,
			isOnTrack: percentage >= expectedPercentage,
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
		await ctx.requireLevel("clients", "view");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		// Get all clients created in range
		const clientsThisMonth = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.gte(q.field("_creationTime"), start),
					q.lte(q.field("_creationTime"), end)
				)
			)
			.collect();

		// Count clients created before the range via aggregate instead of
		// collecting the whole table.
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
		await ctx.requireLevel("projects", "view");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		// Get all projects with status = 'completed' in range
		const projectsThisMonth = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "completed"),
					q.neq(q.field("completedAt"), null),
					q.gte(q.field("completedAt"), start),
					q.lte(q.field("completedAt"), end)
				)
			)
			.collect();

		// Count completed projects before the range via aggregate (keyed on
		// [status, completedAt]); the lower bound of 1 excludes null completedAt.
		const baselineCount = await projectCountsAggregate.count(ctx, {
			namespace: userOrgId,
			bounds: {
				lower: { key: ["completed", 1], inclusive: true },
				upper: { key: ["completed", start], inclusive: false },
			},
		});

		const projectsThisMonthWithCompletedAt = projectsThisMonth.filter(
			(
				project
			): project is (typeof projectsThisMonth)[number] & {
				completedAt: number;
			} => typeof project.completedAt === "number"
		);

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
 * Get quotes approved by date range for daily chart visualization
 */
export const getQuotesApprovedByDateRange = optionalUserQuery({
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
		await ctx.requireLevel("quotes", "view");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		// Get all quotes approved in range
		const quotesThisMonth = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "approved"),
					q.gte(q.field("approvedAt"), start),
					q.lte(q.field("approvedAt"), end)
				)
			)
			.collect();

		// Count approved quotes before the range via aggregate instead of
		// collecting the whole table.
		const baselineCount = await quoteCountsAggregate.count(ctx, {
			namespace: userOrgId,
			bounds: {
				lower: { key: ["approved", 0], inclusive: true },
				upper: { key: ["approved", start], inclusive: false },
			},
		});

		const data = quotesThisMonth.map((quote) => ({
			date: DateUtils.toLocalDateString(quote.approvedAt!, timezone),
			count: 1,
			_creationTime: quote.approvedAt!,
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
 * Get invoices paid by date range for daily chart visualization
 */
export const getInvoicesPaidByDateRange = optionalUserQuery({
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
		await ctx.requireLevel("invoices", "view");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		// Get all invoices with status = 'paid' in range
		const invoicesThisMonth = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "paid"),
					q.neq(q.field("paidAt"), null),
					q.gte(q.field("paidAt"), start),
					q.lte(q.field("paidAt"), end)
				)
			)
			.collect();

		// Count paid invoices before the range via aggregate (keyed on
		// [status, paidAt]); the lower bound of 1 excludes null paidAt.
		const baselineCount = await invoiceCountsAggregate.count(ctx, {
			namespace: userOrgId,
			bounds: {
				lower: { key: ["paid", 1], inclusive: true },
				upper: { key: ["paid", start], inclusive: false },
			},
		});

		const invoicesThisMonthWithPaidAt = invoicesThisMonth.filter(
			(
				invoice
			): invoice is (typeof invoicesThisMonth)[number] & { paidAt: number } =>
				typeof invoice.paidAt === "number"
		);

		const data = invoicesThisMonthWithPaidAt.map((invoice) => ({
			date: DateUtils.toLocalDateString(invoice.paidAt, timezone),
			count: 1,
			_creationTime: invoice.paidAt,
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
		await ctx.requireLevel("invoices", "view");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		// Get all paid invoices in range
		const paidInvoicesThisMonth = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "paid"),
					q.gte(q.field("paidAt"), start),
					q.lte(q.field("paidAt"), end)
				)
			)
			.collect();

		// Return only paid invoices
		return paidInvoicesThisMonth.map((invoice) => ({
			date: DateUtils.toLocalDateString(invoice.paidAt!, timezone),
			count: invoice.total, // Use the invoice total as the count for revenue
			_creationTime: invoice.paidAt!,
		}));
	},
});

/**
 * Get tasks created by date range for daily chart visualization
 */
export const getTasksCreatedByDateRange = optionalUserQuery({
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
		await ctx.requireLevel("tasks", "view");
		const { from, to } = args;
		const { start, end } = getDateRangeBounds(from, to);

		// Get organization timezone
		const organization = await ctx.db.get(userOrgId);
		const timezone = organization?.timezone;

		// Get all tasks created in range
		const tasksThisMonth = await ctx.db
			.query("tasks")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.gte(q.field("_creationTime"), start),
					q.lte(q.field("_creationTime"), end)
				)
			)
			.collect();

		return tasksThisMonth.map((task) => ({
			date: DateUtils.toLocalDateString(task._creationTime, timezone),
			count: 1,
			_creationTime: task._creationTime,
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

				// Check if any documents with BoldSign integration exist
				ctx.db
					.query("documents")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.filter((q) => q.neq(q.field("boldsignDocumentId"), undefined))
					.first(),

				// Check if any invoices exist
				ctx.db
					.query("invoices")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.first(),

				// Check if any paid invoices exist
				ctx.db
					.query("invoices")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.filter((q) => q.eq(q.field("status"), "paid"))
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
