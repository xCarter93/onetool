/**
 * Curated report preset library — pure data, no ctx/db imports, safe to
 * import from both the backend and the web app. Each preset is a canned v2
 * report config; the caller (assistant tool or builder "start from a
 * template" UI) maps it to executeReport args through
 * lib/reportQueryArgs.resolveReportQueryArgs, exactly like a saved report.
 */
import type { ReportConfigV2, ReportVisualization } from "./reportConfig";

export type ReportPresetDefinition = {
	id: string;
	name: string;
	description: string; // one sentence, user-facing
	config: ReportConfigV2;
	visualization: ReportVisualization;
};

export const REPORT_PRESETS: ReportPresetDefinition[] = [
	{
		id: "revenue-by-month",
		name: "Revenue by month",
		description: "Paid invoice revenue totaled by the month it was paid.",
		config: {
			version: 2,
			entityType: "invoices",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "paid" }],
					},
				],
			},
			date: { field: "paidAt", range: { kind: "preset", preset: "this_year" } },
			metric: { op: "sum", field: "total" },
			groupBy: "paidAt_month",
		},
		visualization: { type: "line" },
	},
	{
		id: "overdue-invoices",
		name: "Overdue invoices",
		description: "Every invoice currently past its due date.",
		config: {
			version: 2,
			entityType: "invoices",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "overdue" }],
					},
				],
			},
			columns: ["invoiceNumber", "status", "total", "issuedDate", "dueDate"],
			metric: { op: "count" },
		},
		visualization: { type: "table" },
	},
	{
		id: "payments-due",
		name: "Payments due",
		description: "Every payment still waiting to be collected.",
		// No date window on purpose: dueDate is the entity dateField, so a bounded
		// window would silently hide old unpaid payments (§8 d12).
		config: {
			version: 2,
			entityType: "payments",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "or",
						rules: [
							{ field: "status", operator: "equals", value: "pending" },
							{ field: "status", operator: "equals", value: "sent" },
							{ field: "status", operator: "equals", value: "overdue" },
						],
					},
				],
			},
			columns: ["description", "status", "paymentAmount", "dueDate"],
			metric: { op: "count" },
		},
		visualization: { type: "table" },
	},
	{
		id: "quote-conversion",
		name: "Quote conversion rate",
		description: "Share of sent quotes that were approved this quarter.",
		config: {
			version: 2,
			entityType: "quotes",
			date: { range: { kind: "preset", preset: "this_quarter" } },
			metric: { op: "ratio", ratioKey: "conversionRate" },
		},
		visualization: { type: "pie" },
	},
	{
		id: "projects-by-status",
		name: "Projects by status",
		description: "How your active project pipeline breaks down by status.",
		config: {
			version: 2,
			entityType: "projects",
			metric: { op: "count" },
			groupBy: "status",
		},
		visualization: { type: "pie" },
	},
	{
		id: "jobs-completed-by-month",
		name: "Jobs completed per month",
		description: "Completed projects bucketed by their completion month.",
		config: {
			version: 2,
			entityType: "projects",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "completed" }],
					},
				],
			},
			metric: { op: "count" },
			groupBy: "completedAt_month",
		},
		visualization: { type: "column" },
	},
	{
		id: "average-invoice-value",
		name: "Average invoice value",
		description: "Average invoice total by the month it was issued.",
		config: {
			version: 2,
			entityType: "invoices",
			date: { range: { kind: "preset", preset: "this_year" } },
			metric: { op: "avg", field: "total" },
			groupBy: "issuedDate_month",
		},
		visualization: { type: "line" },
	},
	{
		id: "team-workload",
		name: "Team workload",
		description: "How many tasks are assigned to each team member this month.",
		config: {
			version: 2,
			entityType: "tasks",
			date: { range: { kind: "preset", preset: "this_month" } },
			metric: { op: "count" },
			groupBy: "assigneeUserId",
		},
		visualization: { type: "bar" },
	},
	{
		id: "top-clients",
		name: "Top clients by revenue",
		description: "Your highest-revenue clients from paid invoices.",
		config: {
			version: 2,
			entityType: "invoices",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "paid" }],
					},
				],
			},
			date: { field: "paidAt", range: { kind: "preset", preset: "all_time" } },
			metric: { op: "sum", field: "total" },
			groupBy: "clientId",
		},
		// seriesLimit is the "top 10" — dropping it makes this unbounded (§8 d3).
		visualization: { type: "bar", options: { sort: "value_desc", seriesLimit: 10 } },
	},
	{
		id: "new-clients-by-month",
		name: "New clients per month",
		description: "New client signups bucketed by the month they were created.",
		config: {
			version: 2,
			entityType: "clients",
			date: { range: { kind: "preset", preset: "this_year" } },
			metric: { op: "count" },
			groupBy: "creationDate_month",
		},
		visualization: { type: "column" },
	},
	{
		id: "lead-source-breakdown",
		name: "Lead source breakdown",
		description: "Where your clients came from.",
		config: {
			version: 2,
			entityType: "clients",
			metric: { op: "count" },
			groupBy: "leadSource",
		},
		visualization: { type: "pie" },
	},
	{
		id: "projected-income",
		name: "Projected income",
		description: "Unpaid invoice value bucketed by due month.",
		config: {
			version: 2,
			entityType: "invoices",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "or",
						rules: [
							{ field: "status", operator: "equals", value: "sent" },
							{ field: "status", operator: "equals", value: "overdue" },
						],
					},
				],
			},
			metric: { op: "sum", field: "total" },
			groupBy: "dueDate_month",
		},
		visualization: { type: "column" },
	},
	{
		id: "quotes-awaiting-response",
		name: "Quotes awaiting response",
		description: "Sent quotes still waiting on a client decision.",
		config: {
			version: 2,
			entityType: "quotes",
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "sent" }],
					},
				],
			},
			columns: ["quoteNumber", "title", "total", "sentAt"],
			metric: { op: "count" },
		},
		visualization: { type: "table" },
	},
	{
		id: "tasks-by-status",
		name: "Tasks by status",
		description: "This week's tasks broken down by status.",
		config: {
			version: 2,
			entityType: "tasks",
			date: { range: { kind: "preset", preset: "this_week" } },
			metric: { op: "count" },
			groupBy: "status",
			includeEmptyValues: true,
		},
		visualization: { type: "pie" },
	},
	{
		id: "clients-by-status",
		name: "Clients by status",
		description: "Your full client list broken down by status.",
		config: {
			version: 2,
			entityType: "clients",
			metric: { op: "count" },
			groupBy: "status",
		},
		visualization: { type: "bar" },
	},
];
