import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DateUtils } from "./lib/shared";
import {
	getOptionalOrgId,
	getDateRangeBounds,
	getMonthComparisonPeriods,
	getWeekRange,
	toChartData,
} from "./lib/queries";
import { optionalUserQuery, userMutation } from "./lib/factories";

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
 * Get comprehensive home dashboard statistics
 */
export const getHomeStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<HomeStats> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return EMPTY_HOME_STATS;
		}

		const { thisMonthStart, lastMonthStart, lastMonthEnd } =
			getMonthComparisonPeriods();
		const weekRange = getWeekRange();

		// Get organization to fetch revenue target
		const organization = await ctx.db.get(userOrgId);

		// Parallel queries for better performance
		const [allClients, allProjects, allQuotes, allInvoices, allTasks] =
			await Promise.all([
				// Get all clients
				ctx.db
					.query("clients")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.collect(),

				// Get all projects
				ctx.db
					.query("projects")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.collect(),

				// Get all quotes
				ctx.db
					.query("quotes")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.collect(),

				// Get all invoices
				ctx.db
					.query("invoices")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.collect(),

				// Get all tasks
				ctx.db
					.query("tasks")
					.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
					.collect(),
			]);

		// Calculate client statistics
		const clientsThisMonth = allClients.filter(
			(client) => client._creationTime >= thisMonthStart
		).length;
		const clientsLastMonth = allClients.filter(
			(client) =>
				client._creationTime >= lastMonthStart &&
				client._creationTime <= lastMonthEnd
		).length;
		const clientsChange = clientsThisMonth - clientsLastMonth;

		// Calculate completed projects statistics
		// Count all projects with status = 'completed' that were completed this month
		const completedProjectsThisMonth = allProjects.filter(
			(project) =>
				project.status === "completed" &&
				project.completedAt &&
				project.completedAt >= thisMonthStart
		);
		const completedProjectsLastMonth = allProjects.filter(
			(project) =>
				project.status === "completed" &&
				project.completedAt &&
				project.completedAt >= lastMonthStart &&
				project.completedAt <= lastMonthEnd
		);
		const projectsChange =
			completedProjectsThisMonth.length - completedProjectsLastMonth.length;

		// Calculate project value by summing approved quotes for completed projects
		const completedProjectIds = new Set(
			completedProjectsThisMonth.map((p) => p._id)
		);
		const projectsValue = allQuotes
			.filter(
				(quote) =>
					quote.status === "approved" &&
					quote.projectId &&
					completedProjectIds.has(quote.projectId)
			)
			.reduce((sum, quote) => sum + quote.total, 0);

		// Calculate approved quotes statistics
		const approvedQuotesThisMonth = allQuotes.filter(
			(quote) =>
				quote.status === "approved" &&
				(quote.approvedAt ? quote.approvedAt >= thisMonthStart : false)
		);
		const approvedQuotesLastMonth = allQuotes.filter(
			(quote) =>
				quote.status === "approved" &&
				quote.approvedAt &&
				quote.approvedAt >= lastMonthStart &&
				quote.approvedAt <= lastMonthEnd
		);
		const quotesChange =
			approvedQuotesThisMonth.length - approvedQuotesLastMonth.length;
		const quotesTotalValue = approvedQuotesThisMonth.reduce(
			(sum, quote) => sum + quote.total,
			0
		);

		// Calculate invoice statistics - only paid invoices
		const invoicesThisMonth = allInvoices.filter(
			(invoice) =>
				invoice.status === "paid" &&
				invoice.paidAt &&
				invoice.paidAt >= thisMonthStart
		);
		const invoicesLastMonth = allInvoices.filter(
			(invoice) =>
				invoice.status === "paid" &&
				invoice.paidAt &&
				invoice.paidAt >= lastMonthStart &&
				invoice.paidAt <= lastMonthEnd
		);
		const invoicesChange = invoicesThisMonth.length - invoicesLastMonth.length;
		const invoicesTotalValue = invoicesThisMonth.reduce(
			(sum, invoice) => sum + invoice.total,
			0
		);
		const outstandingInvoices = allInvoices
			.filter(
				(invoice) => invoice.status === "sent" || invoice.status === "overdue"
			)
			.reduce((sum, invoice) => sum + invoice.total, 0);

		// Calculate revenue goal progress
		// Use only paid invoices for revenue tracking
		const monthlyTarget = organization?.monthlyRevenueTarget || 50000; // Default target
		const currentRevenue = invoicesThisMonth
			.filter((invoice) => invoice.status === "paid")
			.reduce((sum, invoice) => sum + invoice.total, 0);
		const currentPercentage = Math.round(
			(currentRevenue / monthlyTarget) * 100
		);

		// Calculate last month's revenue from paid invoices only
		const lastMonthRevenue = invoicesLastMonth
			.filter((invoice) => invoice.status === "paid")
			.reduce((sum, invoice) => sum + invoice.total, 0);
		const lastMonthPercentage = Math.round(
			(lastMonthRevenue / monthlyTarget) * 100
		);
		const revenuePercentageChange = currentPercentage - lastMonthPercentage;

		const totalCompletedProjects = allProjects.filter(
			(project) => project.status === "completed" && project.completedAt
		).length;

		const totalApprovedQuotes = allQuotes.filter(
			(quote) => quote.status === "approved" && quote.approvedAt
		).length;

		const totalPaidInvoices = allInvoices.filter(
			(invoice) => invoice.status === "paid" && invoice.paidAt
		).length;

		// Calculate pending tasks using shared week range
		const pendingTasks = allTasks.filter(
			(task) => task.status === "pending" || task.status === "in-progress"
		);
		const tasksThisWeek = pendingTasks.filter(
			(task) => task.date >= weekRange.start && task.date < weekRange.end
		).length;

		return {
			totalClients: {
				current: allClients.length,
				previous: allClients.length - clientsThisMonth + clientsLastMonth,
				change: Math.abs(clientsChange),
				changeType: getChangeType(clientsChange),
			},
			completedProjects: {
				current: totalCompletedProjects,
				previous: totalCompletedProjects - completedProjectsThisMonth.length,
				change: Math.abs(projectsChange),
				changeType: getChangeType(projectsChange),
				totalValue: projectsValue,
			},
			approvedQuotes: {
				current: totalApprovedQuotes,
				previous: totalApprovedQuotes - approvedQuotesThisMonth.length,
				change: Math.abs(quotesChange),
				changeType: getChangeType(quotesChange),
				totalValue: quotesTotalValue,
			},
			invoicesSent: {
				current: totalPaidInvoices,
				previous: totalPaidInvoices - invoicesThisMonth.length,
				change: Math.abs(invoicesChange),
				changeType: getChangeType(invoicesChange),
				totalValue: invoicesTotalValue,
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
 * Get simple task count for pending tasks widget
 */
// TODO: Candidate for deletion if confirmed unused.
export const getPendingTasksCount = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<{ count: number; dueThisWeek: number }> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return { count: 0, dueThisWeek: 0 };
		}
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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				total: 0,
				thisMonth: 0,
				lastMonth: 0,
				change: 0,
				changeType: "neutral",
			};
		}
		const { thisMonthStart, lastMonthStart, lastMonthEnd } =
			getMonthComparisonPeriods();

		const allClients = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.collect();

		const thisMonth = allClients.filter(
			(client) => client._creationTime >= thisMonthStart
		).length;

		const lastMonth = allClients.filter(
			(client) =>
				client._creationTime >= lastMonthStart &&
				client._creationTime <= lastMonthEnd
		).length;

		const change = thisMonth - lastMonth;

		return {
			total: allClients.length,
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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				percentage: 0,
				current: 0,
				target: 0,
				isOnTrack: false,
			};
		}

		// Get organization to fetch revenue target
		const organization = await ctx.db.get(userOrgId);
		const monthlyTarget = organization?.monthlyRevenueTarget || 50000;

		// Get this month's paid invoices
		const { thisMonthStart } = getMonthComparisonPeriods();
		const paidInvoices = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "paid"),
					q.gte(q.field("paidAt"), thisMonthStart)
				)
			)
			.collect();

		// Use only paid invoices for revenue tracking
		const currentRevenue = paidInvoices.reduce(
			(sum, invoice) => sum + invoice.total,
			0
		);
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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				baselineCount: 0,
				totalInRange: 0,
				totalThroughEnd: 0,
				data: [],
			};
		}
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

		const clientsBeforeRange = await ctx.db
			.query("clients")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) => q.lt(q.field("_creationTime"), start))
			.collect();

		const data = clientsThisMonth.map((client: Doc<"clients">) => ({
			date: DateUtils.toLocalDateString(client._creationTime, timezone),
			count: 1, // Each client counts as 1
			_creationTime: client._creationTime,
			status: client.status as "lead" | "active" | "inactive" | "archived",
		}));

		const totalInRange = data.reduce((sum, item) => sum + item.count, 0);
		const baselineCount = clientsBeforeRange.length;

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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				baselineCount: 0,
				totalInRange: 0,
				totalThroughEnd: 0,
				data: [],
			};
		}
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

		const projectsBeforeRange = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "completed"),
					q.neq(q.field("completedAt"), null),
					q.lt(q.field("completedAt"), start)
				)
			)
			.collect();

		const projectsThisMonthWithCompletedAt = projectsThisMonth.filter(
			(
				project
			): project is (typeof projectsThisMonth)[number] & {
				completedAt: number;
			} => typeof project.completedAt === "number"
		);

		const projectsBeforeRangeWithCompletedAt = projectsBeforeRange.filter(
			(
				project
			): project is (typeof projectsBeforeRange)[number] & {
				completedAt: number;
			} => typeof project.completedAt === "number"
		);

		const data = projectsThisMonthWithCompletedAt.map((project) => ({
			date: DateUtils.toLocalDateString(project.completedAt, timezone),
			count: 1,
			_creationTime: project.completedAt,
		}));

		const totalInRange = data.reduce((sum, item) => sum + item.count, 0);
		const baselineCount = projectsBeforeRangeWithCompletedAt.length;

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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				baselineCount: 0,
				totalInRange: 0,
				totalThroughEnd: 0,
				data: [],
			};
		}
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

		const quotesBeforeRange = await ctx.db
			.query("quotes")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "approved"),
					q.lt(q.field("approvedAt"), start)
				)
			)
			.collect();

		const data = quotesThisMonth.map((quote) => ({
			date: DateUtils.toLocalDateString(quote.approvedAt!, timezone),
			count: 1,
			_creationTime: quote.approvedAt!,
		}));

		const totalInRange = data.reduce((sum, item) => sum + item.count, 0);
		const baselineCount = quotesBeforeRange.length;

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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return {
				baselineCount: 0,
				totalInRange: 0,
				totalThroughEnd: 0,
				data: [],
			};
		}
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

		const invoicesBeforeRange = await ctx.db
			.query("invoices")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "paid"),
					q.neq(q.field("paidAt"), null),
					q.lt(q.field("paidAt"), start)
				)
			)
			.collect();

		const invoicesThisMonthWithPaidAt = invoicesThisMonth.filter(
			(
				invoice
			): invoice is (typeof invoicesThisMonth)[number] & { paidAt: number } =>
				typeof invoice.paidAt === "number"
		);

		const invoicesBeforeRangeWithPaidAt = invoicesBeforeRange.filter(
			(
				invoice
			): invoice is (typeof invoicesBeforeRange)[number] & { paidAt: number } =>
				typeof invoice.paidAt === "number"
		);

		const data = invoicesThisMonthWithPaidAt.map((invoice) => ({
			date: DateUtils.toLocalDateString(invoice.paidAt, timezone),
			count: 1,
			_creationTime: invoice.paidAt,
		}));

		const totalInRange = data.reduce((sum, item) => sum + item.count, 0);
		const baselineCount = invoicesBeforeRangeWithPaidAt.length;

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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}
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
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
			return [];
		}
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
	handler: async (ctx): Promise<JourneyProgress> => {
		const userOrgId = await getOptionalOrgId(ctx);
		if (!userOrgId) {
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
