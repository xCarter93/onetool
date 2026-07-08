import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { mastra } from "@/mastra";

/**
 * API Route for the Report Agent
 * Handles natural language requests to generate report configurations
 */
export async function POST(request: NextRequest) {
	// Auth guard — unauthenticated requests get 401
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { prompt } = body;

		if (!prompt || typeof prompt !== "string") {
			return NextResponse.json(
				{ error: "Missing or invalid prompt" },
				{ status: 400 }
			);
		}

		// Get the report agent from Mastra
		const reportAgent = mastra.getAgent("reportAgent");

		if (!reportAgent) {
			return NextResponse.json(
				{ error: "Report agent not found" },
				{ status: 500 }
			);
		}

		// Generate report configuration using the agent
		const response = await reportAgent.generate(
			`Generate a report configuration for the following request: "${prompt}"
			
Use the available tools to:
1. First, get schema info to understand available entities
2. Then, build the report configuration based on the user's intent
3. Return the complete configuration

Respond with a JSON object containing:
- config: The report configuration object
- visualization: The visualization settings
- suggestedName: A suggested name for the report
- suggestedDescription: A suggested description`
		);

		// Parse the response to extract configuration
		const textContent = response.text;

		// Try to extract JSON from the response
		let result;
		try {
			// Look for JSON in the response
			const jsonMatch = textContent.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				result = JSON.parse(jsonMatch[0]);
			} else {
				// If no JSON found, create a default configuration based on common patterns
				result = inferConfigFromPrompt(prompt);
			}
		} catch {
			// If parsing fails, infer configuration from the prompt
			result = inferConfigFromPrompt(prompt);
		}

		// This JSON is free-text from the model, not schema-validated tool output —
		// strip filters/aggregations since executeReport doesn't support them.
		if (result?.config && typeof result.config === "object") {
			delete result.config.filters;
			delete result.config.aggregations;
		}

		return NextResponse.json(result);
	} catch (error) {
		console.error("Report agent error:", error);
		return NextResponse.json(
			{ error: "Failed to generate report configuration" },
			{ status: 500 }
		);
	}
}

/**
 * Parse specific dates from prompt text
 * Handles patterns like "December 1, 2025", "since November 2025", "from X to Y"
 */
function parseSpecificDates(prompt: string): { start?: number; end?: number } | null {
	const MONTH_NAMES: Record<string, number> = {
		january: 0, jan: 0,
		february: 1, feb: 1,
		march: 2, mar: 2,
		april: 3, apr: 3,
		may: 4,
		june: 5, jun: 5,
		july: 6, jul: 6,
		august: 7, aug: 7,
		september: 8, sep: 8, sept: 8,
		october: 9, oct: 9,
		november: 10, nov: 10,
		december: 11, dec: 11,
	};

	// Helper to parse a date string into a Date object
	const parseDate = (dateStr: string): Date | null => {
		const input = dateStr.toLowerCase().trim();

		// "Month Day, Year" (e.g., "december 1, 2025")
		const monthDayYearMatch = input.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/);
		if (monthDayYearMatch) {
			const month = MONTH_NAMES[monthDayYearMatch[1]];
			const day = parseInt(monthDayYearMatch[2], 10);
			const year = parseInt(monthDayYearMatch[3], 10);
			if (month !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
				return new Date(year, month, day);
			}
		}

		// "Day Month Year" (e.g., "1 december 2025")
		const dayMonthYearMatch = input.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s*(\d{4})/);
		if (dayMonthYearMatch) {
			const day = parseInt(dayMonthYearMatch[1], 10);
			const month = MONTH_NAMES[dayMonthYearMatch[2]];
			const year = parseInt(dayMonthYearMatch[3], 10);
			if (month !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
				return new Date(year, month, day);
			}
		}

		// "Month Year" (e.g., "december 2025" - assumes first of month)
		const monthYearMatch = input.match(/([a-z]+)\s+(\d{4})/);
		if (monthYearMatch) {
			const month = MONTH_NAMES[monthYearMatch[1]];
			const year = parseInt(monthYearMatch[2], 10);
			if (month !== undefined && year >= 1900 && year <= 2100) {
				return new Date(year, month, 1);
			}
		}

		return null;
	};

	// Look for "since [date]", "starting on [date]", "from [date]", "after [date]"
	const sinceMatch = prompt.match(/(?:since|starting\s+(?:on|from)?|from|after)\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i);
	if (sinceMatch) {
		const startDate = parseDate(sinceMatch[1]);
		if (startDate) {
			return { start: startDate.getTime() };
		}
	}

	// Look for "since [month year]" (e.g., "since november 2025")
	const sinceMonthMatch = prompt.match(/(?:since|starting\s+(?:on|from|in)?|from|after|in)\s+([a-z]+\s+\d{4})/i);
	if (sinceMonthMatch) {
		const startDate = parseDate(sinceMonthMatch[1]);
		if (startDate) {
			return { start: startDate.getTime() };
		}
	}

	// Look for standalone specific date (e.g., "december 1, 2025")
	const standaloneMatch = prompt.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/i);
	if (standaloneMatch) {
		const month = MONTH_NAMES[standaloneMatch[1].toLowerCase()];
		const day = parseInt(standaloneMatch[2], 10);
		const year = parseInt(standaloneMatch[3], 10);
		if (month !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
			const startDate = new Date(year, month, day);
			return { start: startDate.getTime() };
		}
	}

	// Look for "from [date] to [date]"
	const fromToMatch = prompt.match(/from\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})\s+to\s+([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i);
	if (fromToMatch) {
		const startDate = parseDate(fromToMatch[1]);
		const endDate = parseDate(fromToMatch[2]);
		if (startDate && endDate) {
			endDate.setHours(23, 59, 59, 999);
			return { start: startDate.getTime(), end: endDate.getTime() };
		}
	}

	return null;
}

/**
 * Infer report configuration from natural language prompt
 * Fallback when agent parsing fails
 */
function inferConfigFromPrompt(prompt: string): {
	config: {
		entityType: string;
		groupBy?: string[];
		dateRange?: { start?: number; end?: number };
	};
	visualization: { type: string };
	suggestedName: string;
	suggestedDescription: string;
} {
	const promptLower = prompt.toLowerCase();

	// Detect entity type
	let entityType = "clients";
	if (promptLower.includes("client") || promptLower.includes("customer")) {
		entityType = "clients";
	} else if (promptLower.includes("project")) {
		entityType = "projects";
	} else if (promptLower.includes("task")) {
		entityType = "tasks";
	} else if (promptLower.includes("quote") || promptLower.includes("proposal")) {
		entityType = "quotes";
	} else if (
		promptLower.includes("invoice") ||
		promptLower.includes("revenue") ||
		promptLower.includes("payment")
	) {
		entityType = "invoices";
	} else if (promptLower.includes("activity") || promptLower.includes("log")) {
		entityType = "activities";
	}

	// Detect groupBy
	let groupBy: string | undefined;
	if (promptLower.includes("by status")) {
		groupBy = "status";
	} else if (
		promptLower.includes("by source") ||
		promptLower.includes("lead source")
	) {
		groupBy = "leadSource";
	} else if (promptLower.includes("by type")) {
		groupBy = entityType === "projects" ? "projectType" : "activityType";
	} else if (promptLower.includes("by month") || promptLower.includes("monthly")) {
		// Use the correct month groupBy based on entity type
		if (entityType === "invoices") {
			groupBy = "month";
		} else if (entityType === "activities") {
			groupBy = "timestamp_month";
		} else if (entityType === "tasks") {
			groupBy = "date_month";
		} else {
			groupBy = "creationDate_month";
		}
	} else if (promptLower.includes("by week") || promptLower.includes("weekly")) {
		if (entityType === "activities") {
			groupBy = "timestamp_week";
		} else if (entityType === "tasks") {
			groupBy = "date_week";
		} else {
			groupBy = "creationDate_week";
		}
	} else if (
		promptLower.includes("by day") ||
		promptLower.includes("daily") ||
		promptLower.includes("by date") ||
		promptLower.includes("by created date") ||
		promptLower.includes("grouped by date") ||
		promptLower.includes("grouped by created")
	) {
		// Use the correct day groupBy based on entity type
		if (entityType === "activities") {
			groupBy = "timestamp_day";
		} else if (entityType === "tasks") {
			groupBy = "date_day";
		} else {
			groupBy = "creationDate_day";
		}
	} else if (promptLower.includes("by client")) {
		groupBy = "client";
	} else if (
		promptLower.includes("conversion") ||
		promptLower.includes("approved")
	) {
		groupBy = entityType === "quotes" ? "conversionRate" : "status";
	} else if (promptLower.includes("completion")) {
		groupBy = "completionRate";
	} else {
		// Default groupBy based on entity
		groupBy = "status";
	}

	// Detect visualization type
	let vizType = "bar";

	// Check if it's a time-series groupBy
	const isTimeSeries = groupBy && (
		groupBy.startsWith("creationDate_") ||
		groupBy.startsWith("timestamp_") ||
		groupBy.startsWith("date_") ||
		groupBy === "month"
	);

	if (
		promptLower.includes("line chart") ||
		promptLower.includes("trend") ||
		promptLower.includes("over time") ||
		promptLower.includes("monthly") ||
		promptLower.includes("by day") ||
		promptLower.includes("by date") ||
		promptLower.includes("by week") ||
		isTimeSeries
	) {
		vizType = "line";
	} else if (
		promptLower.includes("pie") ||
		promptLower.includes("distribution") ||
		promptLower.includes("breakdown")
	) {
		vizType = "pie";
	} else if (promptLower.includes("table") || promptLower.includes("list")) {
		vizType = "table";
	} else if (promptLower.includes("bar chart") || promptLower.includes("bar graph")) {
		vizType = "bar";
	}

	// Detect date range
	let dateRange: { start?: number; end?: number } | undefined;
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	// Try to parse specific dates first
	const specificDateRange = parseSpecificDates(promptLower);
	if (specificDateRange) {
		dateRange = specificDateRange;
	} else if (promptLower.includes("this month")) {
		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
		endOfMonth.setHours(23, 59, 59, 999);
		dateRange = { start: startOfMonth.getTime(), end: endOfMonth.getTime() };
	} else if (
		promptLower.includes("this quarter") ||
		promptLower.includes("quarterly")
	) {
		const quarter = Math.floor(today.getMonth() / 3);
		const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
		const endOfQuarter = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
		endOfQuarter.setHours(23, 59, 59, 999);
		dateRange = { start: startOfQuarter.getTime(), end: endOfQuarter.getTime() };
	} else if (promptLower.includes("this year") || promptLower.includes("yearly")) {
		const startOfYear = new Date(today.getFullYear(), 0, 1);
		const endOfYear = new Date(today.getFullYear(), 11, 31);
		endOfYear.setHours(23, 59, 59, 999);
		dateRange = { start: startOfYear.getTime(), end: endOfYear.getTime() };
	} else if (promptLower.includes("last 7 days") || promptLower.includes("last week")) {
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - 7);
		dateRange = { start: startDate.getTime(), end: now.getTime() };
	} else if (promptLower.includes("last 30 days") || promptLower.includes("last month")) {
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - 30);
		dateRange = { start: startDate.getTime(), end: now.getTime() };
	} else if (promptLower.includes("last 90 days") || promptLower.includes("last 3 months")) {
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - 90);
		dateRange = { start: startDate.getTime(), end: now.getTime() };
	}

	// Generate name
	const entityLabel =
		entityType.charAt(0).toUpperCase() + entityType.slice(1);
	const groupByLabel = groupBy
		? groupBy.charAt(0).toUpperCase() + groupBy.slice(1)
		: "";
	const suggestedName = groupBy
		? `${entityLabel} by ${groupByLabel}`
		: `${entityLabel} Report`;

	return {
		config: {
			entityType,
			groupBy: groupBy ? [groupBy] : undefined,
			dateRange,
		},
		visualization: { type: vizType },
		suggestedName,
		suggestedDescription: prompt,
	};
}

