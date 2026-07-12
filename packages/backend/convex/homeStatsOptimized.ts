import { query } from "./_generated/server";
import { getCurrentUserOrgId } from "./lib/auth";
import { DateUtils } from "./lib/shared";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
	invoiceCountsAggregate,
} from "./aggregates";
import type { HomeStats } from "./homeStats";
import { optionalUserQuery, userMutation } from "./lib/factories";

/**
 * Optimized home dashboard statistics using aggregates
 * Provides O(log n) performance instead of O(n)
 */
export const getHomeStats = optionalUserQuery({
	args: {},
	handler: async (ctx): Promise<HomeStats> => {
		const emptyStats: HomeStats = {
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

		if (!ctx.orgId) return emptyStats;
		const userOrgId = ctx.orgId;
		await ctx.requireLevel("clients", "view");
		await ctx.requireLevel("projects", "view");
		await ctx.requireLevel("quotes", "view");
		await ctx.requireLevel("invoices", "view");
		await ctx.requireLevel("tasks", "view");

		const now = Date.now();
		const startOfThisMonth = new Date(new Date(now).setDate(1));
		startOfThisMonth.setHours(0, 0, 0, 0);
		const startOfLastMonth = new Date(startOfThisMonth);
		startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
		const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);

		const thisMonthStart = startOfThisMonth.getTime();
		const lastMonthStart = startOfLastMonth.getTime();
		const lastMonthEnd = endOfLastMonth.getTime();

		// Get organization to fetch revenue target
		const organization = await ctx.db.get(userOrgId);

		// Parallel aggregate queries - much faster than collecting all documents!
		const [
			totalClients,
			clientsThisMonth,
			clientsLastMonth,
			completedProjectsThisMonth,
			completedProjectsLastMonth,
			approvedQuotesThisMonth,
			approvedQuotesLastMonth,
			quotesTotalValue,
			invoicesThisMonth,
			invoicesLastMonth,
			currentRevenue,
			lastMonthRevenue,
			sentInvoicesValue,
			overdueInvoicesValue,
			sentInvoicesThisMonthValue,
		] = await Promise.all([
			// Total clients
			clientCountsAggregate.count(ctx, { namespace: userOrgId }),

			// Clients this month
			clientCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: thisMonthStart, inclusive: true },
				},
			}),

			// Clients last month
			clientCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: lastMonthStart, inclusive: true },
					upper: { key: lastMonthEnd, inclusive: true },
				},
			}),

			// Completed projects this month
			projectCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["completed", thisMonthStart], inclusive: true },
					upper: { key: ["completed", now], inclusive: true },
				},
			}),

			// Completed projects last month
			projectCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["completed", lastMonthStart], inclusive: true },
					upper: { key: ["completed", lastMonthEnd], inclusive: true },
				},
			}),

			// Approved quotes this month
			quoteCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["approved", thisMonthStart], inclusive: true },
					upper: { key: ["approved", now], inclusive: true },
				},
			}),

			// Approved quotes last month
			quoteCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["approved", lastMonthStart], inclusive: true },
					upper: { key: ["approved", lastMonthEnd], inclusive: true },
				},
			}),

			// Total value of approved quotes this month
			quoteCountsAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["approved", thisMonthStart], inclusive: true },
					upper: { key: ["approved", now], inclusive: true },
				},
			}),

			// Paid invoices count this month
			invoiceCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["paid", thisMonthStart], inclusive: true },
					upper: { key: ["paid", now], inclusive: true },
				},
			}),

			// Paid invoices count last month
			invoiceCountsAggregate.count(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["paid", lastMonthStart], inclusive: true },
					upper: { key: ["paid", lastMonthEnd], inclusive: true },
				},
			}),

			// Revenue this month (sum of paid invoices)
			invoiceRevenueAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["paid", thisMonthStart], inclusive: true },
					upper: { key: ["paid", now], inclusive: true },
				},
			}),

			// Revenue last month
			invoiceRevenueAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["paid", lastMonthStart], inclusive: true },
					upper: { key: ["paid", lastMonthEnd], inclusive: true },
				},
			}),

			// Outstanding invoices - sent status
			invoiceRevenueAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: { prefix: ["sent"] },
			}),

			// Outstanding invoices - overdue status
			invoiceRevenueAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: { prefix: ["overdue"] },
			}),

			// Sent invoices total value this month
			invoiceRevenueAggregate.sum(ctx, {
				namespace: userOrgId,
				bounds: {
					lower: { key: ["sent", thisMonthStart], inclusive: true },
					upper: { key: ["sent", now], inclusive: true },
				},
			}),
		]);

		// Calculate outstanding invoices total
		const outstandingInvoices =
			(sentInvoicesValue || 0) + (overdueInvoicesValue || 0);

		// Calculate changes
		const clientsChange = clientsThisMonth - clientsLastMonth;
		const projectsChange =
			completedProjectsThisMonth - completedProjectsLastMonth;
		const quotesChange = approvedQuotesThisMonth - approvedQuotesLastMonth;
		const invoicesChange = invoicesThisMonth - invoicesLastMonth;

		// Calculate revenue goal progress
		const monthlyTarget = organization?.monthlyRevenueTarget ?? 50000;
		const currentRevenueValue = currentRevenue || 0;
		const lastMonthRevenueValue = lastMonthRevenue || 0;

		// Guard against division by zero
		let currentPercentage: number;
		let lastMonthPercentage: number;
		let revenuePercentageChange: number;

		if (monthlyTarget === 0) {
			currentPercentage = 0;
			lastMonthPercentage = 0;
			revenuePercentageChange = 0;
		} else {
			currentPercentage = Math.round(
				(currentRevenueValue / monthlyTarget) * 100
			);
			lastMonthPercentage = Math.round(
				(lastMonthRevenueValue / monthlyTarget) * 100
			);
			revenuePercentageChange = currentPercentage - lastMonthPercentage;
		}

		// Get pending tasks (keeping this as-is for now since it's simpler)
		const today = DateUtils.startOfDay(now);
		const nextWeek = DateUtils.addDays(today, 7);
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

		const tasksThisWeek = pendingTasks.filter(
			(task) => task.date >= today && task.date < nextWeek
		).length;

		// Helper function to determine change type
		const getChangeType = (
			change: number
		): "increase" | "decrease" | "neutral" => {
			if (change > 0) return "increase";
			if (change < 0) return "decrease";
			return "neutral";
		};

		// Fetch actual completed projects this month to link with their quote values
		const completedProjectsThisMonthRecords = await ctx.db
			.query("projects")
			.withIndex("by_org", (q) => q.eq("orgId", userOrgId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "completed"),
					q.gte(q.field("completedAt"), thisMonthStart),
					q.lte(q.field("completedAt"), now)
				)
			)
			.collect();

		// Calculate total value from linked quotes for completed projects this month
		let completedProjectsThisMonthValue = 0;
		for (const project of completedProjectsThisMonthRecords) {
			// Find approved quotes linked to this project
			const quotes = await ctx.db
				.query("quotes")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.filter((q) => q.eq(q.field("status"), "approved"))
				.collect();

			// Sum the quote values for this project
			for (const quote of quotes) {
				completedProjectsThisMonthValue += quote.total;
			}
		}

		return {
			totalClients: {
				current: totalClients,
				previous: totalClients - clientsThisMonth + clientsLastMonth,
				change: Math.abs(clientsChange),
				changeType: getChangeType(clientsChange),
			},
			completedProjects: {
				current: completedProjectsThisMonth,
				previous: completedProjectsLastMonth,
				change: Math.abs(projectsChange),
				changeType: getChangeType(projectsChange),
				totalValue: completedProjectsThisMonthValue,
			},
			approvedQuotes: {
				current: approvedQuotesThisMonth,
				previous: approvedQuotesLastMonth,
				change: Math.abs(quotesChange),
				changeType: getChangeType(quotesChange),
				totalValue: quotesTotalValue || 0,
			},
			invoicesSent: {
				current: invoicesThisMonth,
				previous: invoicesLastMonth,
				change: Math.abs(invoicesChange),
				changeType: getChangeType(invoicesChange),
				// Fixed: totalValue now reflects sent invoices this month (matching field name)
				// Previously was set to currentRevenueValue (paid invoices), causing semantic mismatch
				totalValue: sentInvoicesThisMonthValue || 0,
				outstanding: outstandingInvoices,
			},
			revenueGoal: {
				percentage: currentPercentage,
				current: currentRevenueValue,
				target: monthlyTarget,
				previousPercentage: lastMonthPercentage,
				changePercentage: revenuePercentageChange,
				changeType: getChangeType(revenuePercentageChange),
			},
			pendingTasks: {
				total: pendingTasks.length,
				dueThisWeek: tasksThisWeek,
			},
		};
	},
});
