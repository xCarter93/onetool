/**
 * Curated report preset library — pure data, no ctx/db imports, safe to
 * import from both the backend and the web app. Each preset is a canned
 * report config; the caller (assistant tool or builder "start from a
 * template" UI) maps it to executeReport args the same way a generated
 * report is mapped (see reportConfigGeneration.toExecuteReportArgs).
 */
import type { ReportFilters } from "./reportFilters";
import type { ReportEntityType } from "./reportFields";

export type ReportPresetDefinition = {
	id: string;
	name: string;
	description: string; // one sentence, user-facing
	entityType: ReportEntityType;
	groupBy: string | null;
	measure: {
		op: "count" | "sum" | "avg" | "min" | "max";
		field: string | null;
	} | null; // null = count
	filters: ReportFilters | null;
	columns: string[] | null; // only for table worklist presets
	dateRangePreset:
		| "all_time"
		| "today"
		| "this_week"
		| "this_month"
		| "this_quarter"
		| "this_year"
		| "last_7_days"
		| "last_30_days"
		| "last_90_days"
		| "last_year";
	visualization: "bar" | "column" | "line" | "pie" | "radar" | "radial" | "table";
};

export const REPORT_PRESETS: ReportPresetDefinition[] = [
	{
		id: "revenue-by-month",
		name: "Revenue by month",
		description: "Paid invoice revenue totaled by the month it was paid.",
		entityType: "invoices",
		groupBy: "month",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "this_year",
		visualization: "line",
	},
	{
		id: "overdue-invoices",
		name: "Overdue invoices",
		description: "Every invoice currently past its due date.",
		entityType: "invoices",
		groupBy: null,
		measure: null,
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
		dateRangePreset: "all_time",
		visualization: "table",
	},
	{
		id: "quote-conversion",
		name: "Quote conversion rate",
		description: "Share of sent quotes that were approved this quarter.",
		entityType: "quotes",
		groupBy: "conversionRate",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "this_quarter",
		visualization: "pie",
	},
	{
		id: "projects-by-status",
		name: "Projects by status",
		description: "How your active project pipeline breaks down by status.",
		entityType: "projects",
		groupBy: "status",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "all_time",
		visualization: "pie",
	},
	{
		id: "jobs-completed-by-month",
		name: "Jobs completed per month",
		description: "Completed projects bucketed by their completion month.",
		entityType: "projects",
		groupBy: "completedAt_month",
		measure: null,
		filters: {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "completed" }],
				},
			],
		},
		columns: null,
		dateRangePreset: "all_time",
		visualization: "column",
	},
	{
		id: "average-invoice-value",
		name: "Average invoice value",
		description: "Average invoice total by the month it was issued.",
		entityType: "invoices",
		groupBy: "issuedDate_month",
		measure: { op: "avg", field: "total" },
		filters: null,
		columns: null,
		dateRangePreset: "this_year",
		visualization: "line",
	},
	{
		id: "team-workload",
		name: "Team workload",
		description: "How many tasks are assigned to each team member this month.",
		entityType: "tasks",
		groupBy: "assigneeUserId",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "this_month",
		visualization: "bar",
	},
	{
		id: "top-clients",
		name: "Top clients by revenue",
		description: "Your highest-revenue clients from paid invoices.",
		entityType: "invoices",
		groupBy: "client",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "all_time",
		visualization: "bar",
	},
	{
		id: "new-clients-by-month",
		name: "New clients per month",
		description: "New client signups bucketed by the month they were created.",
		entityType: "clients",
		groupBy: "creationDate_month",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "this_year",
		visualization: "column",
	},
	{
		id: "lead-source-breakdown",
		name: "Lead source breakdown",
		description: "Where your clients came from.",
		entityType: "clients",
		groupBy: "leadSource",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "all_time",
		visualization: "pie",
	},
	{
		id: "projected-income",
		name: "Projected income",
		description: "Unpaid invoice value bucketed by due month.",
		entityType: "invoices",
		groupBy: "dueDate_month",
		measure: { op: "sum", field: "total" },
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
		columns: null,
		dateRangePreset: "all_time",
		visualization: "column",
	},
	{
		id: "quotes-awaiting-response",
		name: "Quotes awaiting response",
		description: "Sent quotes still waiting on a client decision.",
		entityType: "quotes",
		groupBy: null,
		measure: null,
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
		dateRangePreset: "all_time",
		visualization: "table",
	},
	{
		id: "tasks-by-status",
		name: "Tasks by status",
		description: "This week's tasks broken down by status.",
		entityType: "tasks",
		groupBy: "status",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "this_week",
		visualization: "pie",
	},
	{
		id: "clients-by-status",
		name: "Clients by status",
		description: "Your full client list broken down by status.",
		entityType: "clients",
		groupBy: "status",
		measure: null,
		filters: null,
		columns: null,
		dateRangePreset: "all_time",
		visualization: "bar",
	},
];
