import { describe, it, expect } from "vitest";
import {
	DEFAULT_DETAIL_COLUMNS,
	dateRangeToBuilderState,
	formatReportValue,
	isDetailModeActive,
	resolveReportQueryArgs,
	type ReportConfigShape,
} from "./report-config";

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
		// The reported bug: 12 invoices worth $40k rendered "Total: $12" because
		// the old code reduced over item counts and formatted that. The fix:
		// format the real dollar `total`, gated by the result's explicit
		// metadata flag (emitted only when true) — never inferred from magnitude.
		const total = 40000;
		const metadata = { totalIsCurrency: true };

		const rendered = formatReportValue(total, metadata.totalIsCurrency === true);

		expect(rendered).toBe("$40,000");
		expect(rendered).not.toBe("$12");
		expect(rendered).not.toBe("12");
	});

	it("an absent currency flag means counts — never fall back to entity heuristics", () => {
		// A count grouped on issuedDate_month omits both flags; treating absence
		// as "invoices are money" rendered a count of 12 as "$12".
		const metadata: { totalIsCurrency?: boolean } = {};
		expect(formatReportValue(12, metadata.totalIsCurrency === true)).toBe("12");
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
		expect(args.config.metric).toEqual({ op: "count" });
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
		expect(args.config.groupBy).toBe("status");
	});

	it("table + groupBy set + columns checked → detail mode wins regardless of groupBy", () => {
		const args = resolveReportQueryArgs(
			{ ...baseConfig, groupBy: ["status"], columns: ["invoiceNumber"] },
			"table"
		);
		expect(args.detail).toEqual({ columns: ["invoiceNumber"] });
	});

	it("chart + groupBy None → detail mode (Slice 3-D3: charts require a groupBy; nothing to chart above)", () => {
		// A chart with no grouping has nothing to chart above the table —
		// falls back to raw-row detail mode with default columns, same as
		// table + groupBy None.
		const args = resolveReportQueryArgs(baseConfig, "bar");
		expect(args.detail).toEqual({ columns: DEFAULT_DETAIL_COLUMNS.invoices });
	});

	it("chart + groupBy None + a non-count measure → still detail mode (measure ignored, same as table)", () => {
		const args = resolveReportQueryArgs(
			{ ...baseConfig, aggregation: { op: "sum", field: "total" } },
			"pie"
		);
		expect(args.detail).toEqual({ columns: DEFAULT_DETAIL_COLUMNS.invoices });
	});

	it("chart + groupBy set → grouped count config", () => {
		const args = resolveReportQueryArgs({ ...baseConfig, groupBy: ["status"] }, "bar");
		expect(args.config.groupBy).toBe("status");
		expect(args.config.metric).toEqual({ op: "count" });
	});
});

describe("resolveReportQueryArgs — magic-key expansion (post-R4c contract)", () => {
	it("invoices 'month' expands to the paid-revenue v2 config", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "invoices", groupBy: ["month"] },
			"bar"
		);
		expect(args.config.groupBy).toBe("paidAt_month");
		expect(args.config.metric).toEqual({ op: "sum", field: "total" });
		expect(args.config.date?.field).toBe("paidAt");
	});

	it("invoices 'client' expands with an explicit series limit (d3)", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "invoices", groupBy: ["client"] },
			"bar"
		);
		expect(args.config.groupBy).toBe("clientId");
		expect(args.seriesLimit).toBe(10);
	});

	it("quotes 'conversionRate' expands to the ratio metric", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "quotes", groupBy: ["conversionRate"] },
			"pie"
		);
		expect(args.config.metric).toEqual({ op: "ratio", ratioKey: "conversionRate" });
		expect(args.config.groupBy).toBeUndefined();
	});

	it("registry keys pass through as grouped counts", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "invoices", groupBy: ["issuedDate_month"] },
			"line"
		);
		expect(args.config.groupBy).toBe("issuedDate_month");
		expect(args.config.metric).toEqual({ op: "count" });
	});

	it("non-count measures carry into the config metric", () => {
		const args = resolveReportQueryArgs(
			{
				entityType: "invoices",
				groupBy: ["issuedDate_month"],
				aggregation: { op: "avg", field: "total" },
			},
			"line"
		);
		expect(args.config.metric).toEqual({ op: "avg", field: "total" });
	});
});

describe("isDetailModeActive — Slice 3-D3 (chart above table model)", () => {
	it("any viz type with groupBy None → detail (a chart with nothing to group on has nothing to chart above)", () => {
		expect(isDetailModeActive("table", undefined, undefined)).toBe(true);
		expect(isDetailModeActive("bar", undefined, undefined)).toBe(true);
		expect(isDetailModeActive("pie", undefined, ["invoiceNumber"])).toBe(true);
	});

	it("table + groupBy set + columns checked → detail (explicit raw-row override)", () => {
		expect(isDetailModeActive("table", "status", ["invoiceNumber"])).toBe(true);
	});

	it("table + groupBy set + no columns → grouped table, not detail", () => {
		expect(isDetailModeActive("table", "status", undefined)).toBe(false);
	});

	it("chart + groupBy set → grouped (aggregated) mode, not detail — feeds chart + table together", () => {
		expect(isDetailModeActive("bar", "status", undefined)).toBe(false);
		// Columns are table-viz-only; a chart ignores any leftover column
		// selection and still aggregates instead of going to detail mode.
		expect(isDetailModeActive("bar", "status", ["invoiceNumber"])).toBe(false);
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
