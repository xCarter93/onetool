import {
	BarChart3,
	Briefcase,
	DollarSign,
	FileText,
	ListChecks,
	PieChart,
	Table as TableIcon,
	TrendingUp,
	Users,
	type LucideIcon,
} from "lucide-react";

export type EntityType =
	| "clients"
	| "projects"
	| "tasks"
	| "quotes"
	| "invoices"
	| "activities";

export type VizType = "table" | "bar" | "line" | "pie";

export type ReportConfigShape = {
	entityType: EntityType;
	groupBy?: string[];
	dateRange?: { start?: number; end?: number };
};

export const entityOptions: {
	value: EntityType;
	label: string;
	description: string;
	icon: LucideIcon;
}[] = [
	{ value: "clients", label: "Clients", description: "Customers and prospects", icon: Users },
	{ value: "projects", label: "Projects", description: "Project information", icon: Briefcase },
	{ value: "tasks", label: "Tasks", description: "Tasks and schedule items", icon: ListChecks },
	{ value: "quotes", label: "Quotes", description: "Quotes and proposals", icon: FileText },
	{ value: "invoices", label: "Invoices", description: "Invoices and revenue", icon: DollarSign },
	{ value: "activities", label: "Activities", description: "Activity log", icon: TrendingUp },
];

export const groupByOptions: Record<string, { value: string; label: string }[]> = {
	clients: [
		{ value: "status", label: "Status" },
		{ value: "leadSource", label: "Lead Source" },
		{ value: "creationDate_month", label: "Created by Month" },
		{ value: "creationDate_week", label: "Created by Week" },
		{ value: "creationDate_day", label: "Created by Day" },
	],
	projects: [
		{ value: "status", label: "Status" },
		{ value: "projectType", label: "Project Type" },
		{ value: "creationDate_month", label: "Created by Month" },
		{ value: "creationDate_week", label: "Created by Week" },
		{ value: "creationDate_day", label: "Created by Day" },
	],
	tasks: [
		{ value: "status", label: "Status" },
		{ value: "completionRate", label: "Completion Rate" },
		{ value: "date_month", label: "By Month" },
		{ value: "date_week", label: "By Week" },
		{ value: "date_day", label: "By Day" },
	],
	quotes: [
		{ value: "status", label: "Status" },
		{ value: "conversionRate", label: "Conversion Rate" },
	],
	invoices: [
		{ value: "status", label: "Status" },
		{ value: "month", label: "Revenue by Month" },
		{ value: "client", label: "Revenue by Client" },
	],
	activities: [
		{ value: "activityType", label: "Activity Type" },
		{ value: "timestamp_month", label: "By Month" },
		{ value: "timestamp_week", label: "By Week" },
		{ value: "timestamp_day", label: "By Day" },
	],
};

export const visualizationOptions: {
	value: VizType;
	label: string;
	icon: LucideIcon;
}[] = [
	{ value: "bar", label: "Bar", icon: BarChart3 },
	{ value: "line", label: "Line", icon: TrendingUp },
	{ value: "pie", label: "Pie", icon: PieChart },
	{ value: "table", label: "Table", icon: TableIcon },
];

export const dateRangeOptions = [
	{ value: "all_time", label: "All Time" },
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "This Week" },
	{ value: "this_month", label: "This Month" },
	{ value: "this_quarter", label: "This Quarter" },
	{ value: "this_year", label: "This Year" },
	{ value: "last_7_days", label: "Last 7 Days" },
	{ value: "last_30_days", label: "Last 30 Days" },
	{ value: "last_90_days", label: "Last 90 Days" },
	{ value: "last_year", label: "Last Year" },
	{ value: "custom", label: "Custom Range" },
];

export const entityLabels: Record<string, string> = Object.fromEntries(
	entityOptions.map((o) => [o.value, o.label])
);

export const visualizationIcons: Record<VizType, LucideIcon> = {
	bar: BarChart3,
	line: TrendingUp,
	pie: PieChart,
	table: TableIcon,
};

/** Pre-built starting points surfaced on the reports landing page. */
export const reportTemplates: {
	id: string;
	name: string;
	description: string;
	entityType: EntityType;
	groupBy: string;
	viz: VizType;
	dateRange: string;
	icon: LucideIcon;
}[] = [
	{
		id: "client-status",
		name: "Client status breakdown",
		description: "Where clients sit in your pipeline",
		entityType: "clients",
		groupBy: "status",
		viz: "pie",
		dateRange: "all_time",
		icon: Users,
	},
	{
		id: "revenue-month",
		name: "Revenue by month",
		description: "Paid invoice revenue over time",
		entityType: "invoices",
		groupBy: "month",
		viz: "line",
		dateRange: "this_year",
		icon: DollarSign,
	},
	{
		id: "quote-conversion",
		name: "Quote conversion",
		description: "Sent vs. approved quotes",
		entityType: "quotes",
		groupBy: "status",
		viz: "bar",
		dateRange: "this_quarter",
		icon: FileText,
	},
	{
		id: "task-workload",
		name: "Task workload",
		description: "Open vs. completed tasks",
		entityType: "tasks",
		groupBy: "status",
		viz: "bar",
		dateRange: "all_time",
		icon: ListChecks,
	},
	{
		id: "new-clients",
		name: "New clients over time",
		description: "Acquisition by month",
		entityType: "clients",
		groupBy: "creationDate_month",
		viz: "line",
		dateRange: "this_year",
		icon: TrendingUp,
	},
	{
		id: "projects-status",
		name: "Projects by status",
		description: "Project pipeline health",
		entityType: "projects",
		groupBy: "status",
		viz: "bar",
		dateRange: "all_time",
		icon: Briefcase,
	},
];

export function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatRelativeTime(timestamp: number) {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return formatDate(timestamp);
}

export function getDateRange(
	preset: string
): { start?: number; end?: number } | undefined {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const endOfToday = new Date(today);
	endOfToday.setHours(23, 59, 59, 999);

	switch (preset) {
		case "today":
			return { start: today.getTime(), end: endOfToday.getTime() };
		case "this_week": {
			const dayOfWeek = today.getDay();
			const startOfWeek = new Date(today);
			startOfWeek.setDate(today.getDate() - dayOfWeek);
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(startOfWeek.getDate() + 6);
			endOfWeek.setHours(23, 59, 59, 999);
			return { start: startOfWeek.getTime(), end: endOfWeek.getTime() };
		}
		case "this_month": {
			const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
			const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
			endOfMonth.setHours(23, 59, 59, 999);
			return { start: startOfMonth.getTime(), end: endOfMonth.getTime() };
		}
		case "this_quarter": {
			const quarter = Math.floor(today.getMonth() / 3);
			const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
			const endOfQuarter = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
			endOfQuarter.setHours(23, 59, 59, 999);
			return { start: startOfQuarter.getTime(), end: endOfQuarter.getTime() };
		}
		case "this_year": {
			const startOfYear = new Date(today.getFullYear(), 0, 1);
			const endOfYear = new Date(today.getFullYear(), 11, 31);
			endOfYear.setHours(23, 59, 59, 999);
			return { start: startOfYear.getTime(), end: endOfYear.getTime() };
		}
		case "last_7_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 6);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_30_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 29);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_90_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 89);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_year": {
			const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
			const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
			endOfLastYear.setHours(23, 59, 59, 999);
			return { start: startOfLastYear.getTime(), end: endOfLastYear.getTime() };
		}
		case "all_time":
		default:
			return undefined;
	}
}

/**
 * Decides whether a report's `total` and per-item `value`s are dollar
 * amounts, mirroring the semantics of packages/backend/convex/reportData.ts.
 * Charts must use this instead of inferring currency from value magnitude —
 * a magnitude heuristic mislabels a count (e.g. 12 invoices) as a dollar
 * figure when the real `total` prop is a much larger sum (e.g. $40,000).
 */
export function getReportValueTypes(
	entityType: string,
	groupBy?: string
): { totalIsCurrency: boolean; itemValueIsCurrency: boolean } {
	// conversionRate / completionRate reports: total is a 0-100 rate, items are counts.
	if (groupBy === "conversionRate" || groupBy === "completionRate") {
		return { totalIsCurrency: false, itemValueIsCurrency: false };
	}
	if (entityType === "invoices") {
		// "month"/"client" groupBy = revenue aggregates (item value already $).
		// default/"status" groupBy = per-status counts (dollar total lives in
		// each item's metadata.totalValue, not the item's `value` itself).
		return {
			totalIsCurrency: true,
			itemValueIsCurrency: groupBy === "month" || groupBy === "client",
		};
	}
	if (entityType === "quotes") {
		return { totalIsCurrency: true, itemValueIsCurrency: false };
	}
	return { totalIsCurrency: false, itemValueIsCurrency: false };
}

/**
 * Formats a report metric as USD or a plain count. `isCurrency` must come
 * from getReportValueTypes (or be otherwise explicit) — never from the
 * value's own magnitude.
 */
export function formatReportValue(
	value: number,
	isCurrency: boolean,
	options: { compact?: boolean } = {}
): string {
	if (!isCurrency) {
		return value.toLocaleString("en-US");
	}
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: options.compact ? "compact" : "standard",
		maximumFractionDigits: options.compact ? 1 : 0,
	}).format(value);
}

export function detectDateRangePreset(dateRange: {
	start?: number;
	end?: number;
}): string {
	if (!dateRange.start) return "all_time";

	const now = new Date();
	const startDate = new Date(dateRange.start);

	if (
		startDate.getMonth() === now.getMonth() &&
		startDate.getFullYear() === now.getFullYear() &&
		startDate.getDate() === 1
	) {
		return "this_month";
	}

	const currentQuarter = Math.floor(now.getMonth() / 3);
	const startQuarter = Math.floor(startDate.getMonth() / 3);
	if (startQuarter === currentQuarter && startDate.getFullYear() === now.getFullYear()) {
		return "this_quarter";
	}

	if (
		startDate.getFullYear() === now.getFullYear() &&
		startDate.getMonth() === 0 &&
		startDate.getDate() === 1
	) {
		return "this_year";
	}

	return "all_time";
}
