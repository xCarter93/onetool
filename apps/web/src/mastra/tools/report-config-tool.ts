import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Report Configuration Builder Tool
 * Translates natural language requests into structured report configurations
 */

// Report configuration schema matching what executeReport (Convex) actually
// supports: entityType, groupBy, dateRange. filters/aggregations are NOT
// implemented by the backend, so they're excluded here to avoid over-promising.
const reportConfigSchema = z.object({
	entityType: z.enum([
		"clients",
		"projects",
		"tasks",
		"quotes",
		"invoices",
		"activities",
	]),
	groupBy: z.array(z.string()).optional(),
	dateRange: z
		.object({
			start: z.number().optional(),
			end: z.number().optional(),
		})
		.optional(),
});

const visualizationSchema = z.object({
	type: z.enum(["table", "bar", "line", "pie"]),
	options: z
		.object({
			title: z.string().optional(),
			xAxisLabel: z.string().optional(),
			yAxisLabel: z.string().optional(),
			showLegend: z.boolean().optional(),
			colorScheme: z.string().optional(),
		})
		.optional(),
});

// Valid groupBy values for each entity type
const validGroupByValues: Record<string, string[]> = {
	clients: ["status", "leadSource", "creationDate_day", "creationDate_week", "creationDate_month"],
	projects: ["status", "projectType", "creationDate_day", "creationDate_week", "creationDate_month"],
	tasks: ["status", "completionRate", "date_day", "date_week", "date_month"],
	quotes: ["status", "conversionRate"],
	invoices: ["status", "month", "client"],
	activities: ["activityType", "timestamp_day", "timestamp_week", "timestamp_month"],
};

// Map common user inputs to valid groupBy values
function normalizeGroupBy(entityType: string, groupBy?: string): string | undefined {
	if (!groupBy) return undefined;
	
	const normalized = groupBy.toLowerCase().replace(/\s+/g, "_");
	
	// Direct match
	if (validGroupByValues[entityType]?.includes(groupBy)) {
		return groupBy;
	}
	
	// Common mappings for date-based groupings
	const datePatterns: Record<string, Record<string, string>> = {
		clients: {
			"_creationtime": "creationDate_month",
			"createdat": "creationDate_month",
			"created": "creationDate_month",
			"date": "creationDate_month",
			"day": "creationDate_day",
			"week": "creationDate_week",
			"month": "creationDate_month",
			"time": "creationDate_month",
			"created_by_day": "creationDate_day",
			"created_by_week": "creationDate_week",
			"created_by_month": "creationDate_month",
			"creation_date": "creationDate_month",
			"creationdate": "creationDate_month",
		},
		projects: {
			"_creationtime": "creationDate_month",
			"createdat": "creationDate_month",
			"created": "creationDate_month",
			"date": "creationDate_month",
			"day": "creationDate_day",
			"week": "creationDate_week",
			"month": "creationDate_month",
			"time": "creationDate_month",
			"type": "projectType",
			"projecttype": "projectType",
		},
		tasks: {
			"_creationtime": "date_month",
			"createdat": "date_month",
			"created": "date_month",
			"date": "date_month",
			"day": "date_day",
			"week": "date_week",
			"month": "date_month",
			"time": "date_month",
			"completion": "completionRate",
		},
		invoices: {
			"_creationtime": "month",
			"date": "month",
			"time": "month",
			"revenue": "month",
		},
		activities: {
			"_creationtime": "timestamp_month",
			"timestamp": "timestamp_month",
			"date": "timestamp_month",
			"day": "timestamp_day",
			"week": "timestamp_week",
			"month": "timestamp_month",
			"time": "timestamp_month",
			"type": "activityType",
			"activitytype": "activityType",
		},
	};
	
	const entityMappings = datePatterns[entityType] || {};
	if (entityMappings[normalized]) {
		return entityMappings[normalized];
	}
	
	// Check if it contains certain keywords
	if (normalized.includes("day")) {
		if (entityType === "tasks") return "date_day";
		if (entityType === "activities") return "timestamp_day";
		return "creationDate_day";
	}
	if (normalized.includes("week")) {
		if (entityType === "tasks") return "date_week";
		if (entityType === "activities") return "timestamp_week";
		return "creationDate_week";
	}
	if (normalized.includes("month") || normalized.includes("time") || normalized.includes("date") || normalized.includes("creat")) {
		if (entityType === "tasks") return "date_month";
		if (entityType === "invoices") return "month";
		if (entityType === "activities") return "timestamp_month";
		return "creationDate_month";
	}
	
	// Default to first valid value if not found
	return validGroupByValues[entityType]?.[0] || groupBy;
}

export const reportConfigTool = createTool({
	id: "build-report-config",
	description:
		"Build a report configuration from a natural language description. Use this after understanding what the user wants to see in their report.",
	inputSchema: z.object({
		intent: z
			.string()
			.describe(
				"The user's intent for the report, e.g., 'Show me client counts by status'"
			),
		entityType: z
			.enum([
				"clients",
				"projects",
				"tasks",
				"quotes",
				"invoices",
				"activities",
			])
			.describe("The primary entity type for this report"),
		groupBy: z
			.string()
			.optional()
			.describe(
				"Field to group results by. MUST be one of the valid values: " +
				"clients: status, leadSource, creationDate_day, creationDate_week, creationDate_month; " +
				"projects: status, projectType, creationDate_day, creationDate_week, creationDate_month; " +
				"tasks: status, completionRate, date_day, date_week, date_month; " +
				"quotes: status, conversionRate; " +
				"invoices: status, month, client; " +
				"activities: activityType"
			),
		aggregation: z
			.enum(["count", "sum", "avg", "min", "max"])
			.optional()
			.default("count")
			.describe(
				"Aggregation operation, used only to pick a visualization type — the backend does not run custom aggregations"
			),
		dateRangeType: z
			.enum(["today", "this_week", "this_month", "this_quarter", "this_year", "custom", "all_time"])
			.optional()
			.default("this_month")
			.describe("Date range type. IMPORTANT: Use 'custom' when user mentions specific dates like 'December 1, 2025' or 'starting on [date]' or 'from [date] to [date]'"),
		customStartDate: z
			.number()
			.optional()
			.describe("Custom start date as Unix timestamp in MILLISECONDS. REQUIRED when user specifies a start date like 'starting on December 1, 2025'. Example: Dec 1, 2025 = 1733029200000"),
		customEndDate: z
			.number()
			.optional()
			.describe("Custom end date as Unix timestamp in MILLISECONDS. Use when user specifies an end date. If only start date given, omit this to show data from start date to now"),
		visualizationType: z
			.enum(["table", "bar", "line", "pie"])
			.optional()
			.default("bar")
			.describe("How to visualize the report"),
	}),
	outputSchema: z.object({
		config: reportConfigSchema,
		visualization: visualizationSchema,
		suggestedName: z.string().describe("Suggested name for the report"),
		suggestedDescription: z.string().describe("Suggested description for the report"),
	}),
	execute: async (input) => {
		const {
			intent,
			entityType,
			groupBy: rawGroupBy,
			aggregation,
			dateRangeType,
			customStartDate,
			customEndDate,
			visualizationType,
		} = input;

		// Normalize the groupBy value to a valid one
		const groupBy = normalizeGroupBy(entityType, rawGroupBy);

		// Calculate date range based on type
		const now = Date.now();
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		
		let dateRange: { start?: number; end?: number } | undefined;

		switch (dateRangeType) {
			case "today": {
				const startOfDay = today.getTime();
				const endOfDay = new Date(today);
				endOfDay.setHours(23, 59, 59, 999);
				dateRange = { start: startOfDay, end: endOfDay.getTime() };
				break;
			}
			case "this_week": {
				const startOfWeek = new Date(today);
				startOfWeek.setDate(today.getDate() - today.getDay());
				const endOfWeek = new Date(startOfWeek);
				endOfWeek.setDate(startOfWeek.getDate() + 6);
				endOfWeek.setHours(23, 59, 59, 999);
				dateRange = { start: startOfWeek.getTime(), end: endOfWeek.getTime() };
				break;
			}
			case "this_month": {
				const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
				const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
				endOfMonth.setHours(23, 59, 59, 999);
				dateRange = { start: startOfMonth.getTime(), end: endOfMonth.getTime() };
				break;
			}
			case "this_quarter": {
				const quarter = Math.floor(today.getMonth() / 3);
				const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
				const endOfQuarter = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
				endOfQuarter.setHours(23, 59, 59, 999);
				dateRange = { start: startOfQuarter.getTime(), end: endOfQuarter.getTime() };
				break;
			}
			case "this_year": {
				const startOfYear = new Date(today.getFullYear(), 0, 1);
				const endOfYear = new Date(today.getFullYear(), 11, 31);
				endOfYear.setHours(23, 59, 59, 999);
				dateRange = { start: startOfYear.getTime(), end: endOfYear.getTime() };
				break;
			}
			case "custom":
				if (customStartDate || customEndDate) {
					dateRange = { start: customStartDate, end: customEndDate || now };
				}
				break;
			case "all_time":
			default:
				// No date range filter
				dateRange = undefined;
		}

		// Build the report configuration — matches executeReport's supported args
		const config = {
			entityType,
			groupBy: groupBy ? [groupBy] : undefined,
			dateRange,
		};

		// Determine best visualization type
		let vizType = visualizationType || "bar";
		
		// Use line chart for time-series data
		const isTimeSeries = groupBy && (
			groupBy.startsWith("creationDate_") ||
			groupBy.startsWith("date_") ||
			groupBy.startsWith("timestamp_") ||
			groupBy === "month"
		);
		
		if (isTimeSeries) {
			vizType = "line";
		} else if (
			aggregation === "count" &&
			["status", "leadSource", "projectType", "type", "activityType"].includes(groupBy || "")
		) {
			vizType = "pie";
		}

		const visualization = {
			type: vizType as "table" | "bar" | "line" | "pie",
			options: {
				title: generateTitle(entityType, groupBy, aggregation),
				showLegend: vizType === "pie",
			},
		};

		// Generate suggested name and description
		const suggestedName = generateReportName(entityType, groupBy, dateRangeType);
		const suggestedDescription = `${intent}. Generated report showing ${entityType} data${groupBy ? ` grouped by ${groupBy}` : ""}.`;

		return {
			config,
			visualization,
			suggestedName,
			suggestedDescription,
		};
	},
});

function generateTitle(
	entityType: string,
	groupBy?: string,
	aggregation?: string
): string {
	const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
	if (groupBy) {
		const groupByName = groupBy
			.split(/(?=[A-Z])|_/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
			.join(" ");
		return `${entityName} by ${groupByName}`;
	}
	return `${entityName} ${aggregation === "sum" ? "Total" : "Count"}`;
}

function generateReportName(
	entityType: string,
	groupBy?: string,
	dateRangeType?: string
): string {
	const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
	const groupByPart = groupBy
		? ` by ${groupBy.split(/(?=[A-Z])|_/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")}`
		: "";
	const datePart = dateRangeType && dateRangeType !== "all_time"
		? ` (${dateRangeType.replace(/_/g, " ")})`
		: "";
	return `${entityName}${groupByPart}${datePart}`;
}

