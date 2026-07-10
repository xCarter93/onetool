import { describe, it, expect } from "vitest";
import {
	DEFAULT_DETAIL_COLUMNS,
	dateRangeToBuilderState,
	getReportValueTypes,
	formatReportValue,
	resolveReportQueryArgs,
	type ReportConfigShape,
} from "./report-config";

describe("getReportValueTypes", () => {
	it("invoices status-grouped (or ungrouped): total is $, item values are counts", () => {
		expect(getReportValueTypes("invoices", "status")).toEqual({
			totalIsCurrency: true,
			itemValueIsCurrency: false,
		});
		expect(getReportValueTypes("invoices", undefined)).toEqual({
			totalIsCurrency: true,
			itemValueIsCurrency: false,
		});
	});

	it("invoices revenue-by-month/client: total and item values are both $", () => {
		expect(getReportValueTypes("invoices", "month")).toEqual({
			totalIsCurrency: true,
			itemValueIsCurrency: true,
		});
		expect(getReportValueTypes("invoices", "client")).toEqual({
			totalIsCurrency: true,
			itemValueIsCurrency: true,
		});
	});

	it("quotes status-grouped: total is $, item values are counts", () => {
		expect(getReportValueTypes("quotes", "status")).toEqual({
			totalIsCurrency: true,
			itemValueIsCurrency: false,
		});
	});

	it("rate reports (conversionRate/completionRate): total is a rate, not $", () => {
		expect(getReportValueTypes("quotes", "conversionRate")).toEqual({
			totalIsCurrency: false,
			itemValueIsCurrency: false,
		});
		expect(getReportValueTypes("tasks", "completionRate")).toEqual({
			totalIsCurrency: false,
			itemValueIsCurrency: false,
		});
	});

	it("clients/projects/tasks/activities are always plain counts", () => {
		expect(getReportValueTypes("clients", "status")).toEqual({
			totalIsCurrency: false,
			itemValueIsCurrency: false,
		});
		expect(getReportValueTypes("projects", "creationDate_month")).toEqual({
			totalIsCurrency: false,
			itemValueIsCurrency: false,
		});
		expect(getReportValueTypes("activities", "activityType")).toEqual({
			totalIsCurrency: false,
			itemValueIsCurrency: false,
		});
	});
});

describe("formatReportValue", () => {
	it("formats counts as plain locale numbers, no currency symbol", () => {
		expect(formatReportValue(12, false)).toBe("12");
	});

	it("formats currency values as USD", () => {
		expect(formatReportValue(40000, true)).toBe("$40,000");
	});

	it("compact currency abbreviates large totals", () => {
		expect(formatReportValue(12345, true, { compact: true })).toBe("$12.3K");
	});

	it("regression: a $40,000 total must never render as the record count (12)", () => {
		// This is the reported bug: 12 invoices worth $40k rendered "Total: $12"
		// because the old code reduced over item counts and formatted that.
		// The fix: format the real dollar `total`, gated by the explicit flag
		// from getReportValueTypes — never inferred from magnitude.
		const total = 40000;
		const { totalIsCurrency } = getReportValueTypes("invoices", "status");

		const rendered = formatReportValue(total, totalIsCurrency);

		expect(rendered).toBe("$40,000");
		expect(rendered).not.toBe("$12");
		expect(rendered).not.toBe("12");
	});
});

describe("resolveReportQueryArgs — Group by: None", () => {
	const baseConfig: ReportConfigShape = {
		entityType: "invoices",
		groupBy: undefined,
		dateRange: undefined,
		filters: undefined,
		aggregation: undefined,
		columns: undefined,
	};

	it("table + groupBy None + no columns checked → detail mode with the per-entity default columns", () => {
		const args = resolveReportQueryArgs(baseConfig, "table");
		expect(args.detail).toEqual({ columns: DEFAULT_DETAIL_COLUMNS.invoices });
		expect(args.aggregation).toBeUndefined();
	});

	it("table + groupBy None + explicit columns checked → detail mode with those columns", () => {
		const args = resolveReportQueryArgs(
			{ ...baseConfig, columns: ["invoiceNumber", "total"] },
			"table"
		);
		expect(args.detail).toEqual({ columns: ["invoiceNumber", "total"] });
	});

	it("table + groupBy set + no columns checked → aggregated mode, no detail", () => {
		const args = resolveReportQueryArgs({ ...baseConfig, groupBy: ["status"] }, "table");
		expect(args.detail).toBeUndefined();
		expect(args.groupBy).toBe("status");
	});

	it("table + groupBy set + columns checked → detail mode wins regardless of groupBy", () => {
		const args = resolveReportQueryArgs(
			{ ...baseConfig, groupBy: ["status"], columns: ["invoiceNumber"] },
			"table"
		);
		expect(args.detail).toEqual({ columns: ["invoiceNumber"] });
	});

	it("chart + groupBy None → explicit count aggregation is sent, not left undefined", () => {
		// Regression: the backend's legacy dispatch (runReportByConfig) silently
		// re-groups by status when both groupBy and aggregation are omitted —
		// wrong for an intentional "no grouping" chart. Must send {op:"count"}.
		const args = resolveReportQueryArgs(baseConfig, "bar");
		expect(args.groupBy).toBeUndefined();
		expect(args.aggregation).toEqual({ op: "count" });
		expect(args.detail).toBeUndefined();
	});

	it("chart + groupBy None + a non-count measure → the configured aggregation is sent as-is", () => {
		const args = resolveReportQueryArgs(
			{ ...baseConfig, aggregation: { op: "sum", field: "total" } },
			"pie"
		);
		expect(args.aggregation).toEqual({ op: "sum", field: "total" });
	});

	it("chart + groupBy set → aggregation passes through unchanged (legacy grouped-chart behavior)", () => {
		const args = resolveReportQueryArgs({ ...baseConfig, groupBy: ["status"] }, "bar");
		expect(args.groupBy).toBe("status");
		expect(args.aggregation).toBeUndefined();
	});
});

describe("dateRangeToBuilderState", () => {
	it("maps an empty range to All Time", () => {
		expect(dateRangeToBuilderState(null)).toEqual({ preset: "all_time" });
		expect(dateRangeToBuilderState(undefined)).toEqual({ preset: "all_time" });
		expect(dateRangeToBuilderState({})).toEqual({ preset: "all_time" });
	});

	it("recognizes a current-period preset", () => {
		const now = new Date();
		const monthStart = new Date(
			now.getFullYear(),
			now.getMonth(),
			1
		).getTime();
		expect(dateRangeToBuilderState({ start: monthStart })).toEqual({
			preset: "this_month",
		});
	});

	it("falls back to the custom preset for arbitrary ranges instead of All Time", () => {
		// Regression: detectDateRangePreset returns "all_time" for anything it
		// doesn't recognize, which would silently drop an AI-generated bound.
		const start = Date.parse("2024-02-15T00:00:00.000Z");
		const end = Date.parse("2024-03-15T23:59:59.999Z");
		const state = dateRangeToBuilderState({ start, end });
		expect(state.preset).toBe("custom");
		expect(state.customRange?.from?.getTime()).toBe(start);
		expect(state.customRange?.to?.getTime()).toBe(end);
	});

	it("handles a one-sided range as custom", () => {
		const end = Date.parse("2024-03-15T23:59:59.999Z");
		const state = dateRangeToBuilderState({ end });
		expect(state.preset).toBe("custom");
		expect(state.customRange?.from).toBeUndefined();
		expect(state.customRange?.to?.getTime()).toBe(end);
	});
});
