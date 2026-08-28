import { describe, it, expect } from "vitest";
import {
	DEFAULT_DETAIL_COLUMNS,
	buildMetric,
	builderStateToSaved,
	formatReportValue,
	genericGroupByOptions,
	isDetailModeActive,
	metricAggOf,
	metricOptionsFor,
	metricTargetOptionsFor,
	metricTargetValue,
	resolveReportQueryArgs,
	savedToBuilderState,
	type BuilderConfigState,
	type ReportConfigV2,
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

const v2 = (over: Partial<ReportConfigV2> = {}): ReportConfigV2 => ({
	version: 2,
	entityType: "invoices",
	metric: { op: "count" },
	...over,
});

describe("resolveReportQueryArgs — Group by: None", () => {
	it("table + groupBy None + no columns checked → detail mode with the per-entity default columns", () => {
		const args = resolveReportQueryArgs(v2(), { type: "table" });
		expect(args.detail).toEqual({ columns: DEFAULT_DETAIL_COLUMNS.invoices });
		expect(args.config.metric).toEqual({ op: "count" });
	});

	it("table + groupBy None + explicit columns checked → detail mode with those columns", () => {
		const args = resolveReportQueryArgs(
			v2({ columns: ["invoiceNumber", "total"] }),
			{ type: "table" }
		);
		expect(args.detail).toEqual({ columns: ["invoiceNumber", "total"] });
	});

	it("table + groupBy set + no columns checked → aggregated mode, no detail", () => {
		const args = resolveReportQueryArgs(v2({ groupBy: "status" }), {
			type: "table",
		});
		expect(args.detail).toBeUndefined();
		expect(args.config.groupBy).toBe("status");
	});

	it("table + groupBy set + columns checked → detail mode wins regardless of groupBy", () => {
		const args = resolveReportQueryArgs(
			v2({ groupBy: "status", columns: ["invoiceNumber"] }),
			{ type: "table" }
		);
		expect(args.detail).toEqual({ columns: ["invoiceNumber"] });
	});

	it("chart + groupBy None → detail mode (Slice 3-D3: charts require a groupBy; nothing to chart above)", () => {
		const args = resolveReportQueryArgs(v2(), { type: "bar" });
		expect(args.detail).toEqual({ columns: DEFAULT_DETAIL_COLUMNS.invoices });
	});

	it("chart + groupBy set → grouped count config", () => {
		const args = resolveReportQueryArgs(v2({ groupBy: "status" }), {
			type: "bar",
		});
		expect(args.config.groupBy).toBe("status");
		expect(args.config.metric).toEqual({ op: "count" });
	});

	it("ratio metric → aggregated mode even with no groupBy", () => {
		const args = resolveReportQueryArgs(
			{
				version: 2,
				entityType: "quotes",
				metric: { op: "ratio", ratioKey: "conversionRate" },
			},
			{ type: "pie" }
		);
		expect(args.detail).toBeUndefined();
	});

	it("seriesLimit rides in from visualization.options", () => {
		const args = resolveReportQueryArgs(v2({ groupBy: "clientId" }), {
			type: "bar",
			options: { seriesLimit: 10 },
		});
		expect(args.seriesLimit).toBe(10);
	});
});

describe("resolveReportQueryArgs — v1 magic-key expansion (staging rows until R14)", () => {
	it("invoices 'month' expands to the paid-revenue v2 config", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "invoices", groupBy: ["month"] },
			{ type: "bar" }
		);
		expect(args.config.groupBy).toBe("paidAt_month");
		expect(args.config.metric).toEqual({ op: "sum", field: "total" });
		expect(args.config.date?.field).toBe("paidAt");
	});

	it("invoices 'client' expands with an explicit series limit (d3)", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "invoices", groupBy: ["client"] },
			{ type: "bar" }
		);
		expect(args.config.groupBy).toBe("clientId");
		expect(args.seriesLimit).toBe(10);
	});

	it("quotes 'conversionRate' expands to the ratio metric", () => {
		const args = resolveReportQueryArgs(
			{ entityType: "quotes", groupBy: ["conversionRate"] },
			{ type: "pie" }
		);
		expect(args.config.metric).toEqual({ op: "ratio", ratioKey: "conversionRate" });
		expect(args.config.groupBy).toBeUndefined();
	});

	it("v1 aggregations carry into the config metric", () => {
		const args = resolveReportQueryArgs(
			{
				entityType: "invoices",
				groupBy: ["issuedDate_month"],
				aggregations: [{ field: "total", operation: "avg" }],
			},
			{ type: "line" }
		);
		expect(args.config.metric).toEqual({ op: "avg", field: "total" });
	});
});

describe("isDetailModeActive — Slice 3-D3 (chart above table model)", () => {
	it("any viz type with groupBy None → detail (a chart with nothing to group on has nothing to chart above)", () => {
		expect(isDetailModeActive(v2(), "table")).toBe(true);
		expect(isDetailModeActive(v2(), "bar")).toBe(true);
		expect(isDetailModeActive(v2({ columns: ["invoiceNumber"] }), "pie")).toBe(true);
	});

	it("table + groupBy set + columns checked → detail (explicit raw-row override)", () => {
		expect(
			isDetailModeActive(
				v2({ groupBy: "status", columns: ["invoiceNumber"] }),
				"table"
			)
		).toBe(true);
	});

	it("table + groupBy set + no columns → grouped table, not detail", () => {
		expect(isDetailModeActive(v2({ groupBy: "status" }), "table")).toBe(false);
	});

	it("chart + groupBy set → grouped (aggregated) mode, not detail — feeds chart + table together", () => {
		expect(isDetailModeActive(v2({ groupBy: "status" }), "bar")).toBe(false);
		// Columns are table-viz-only; a chart ignores any leftover column
		// selection and still aggregates instead of going to detail mode.
		expect(
			isDetailModeActive(v2({ groupBy: "status", columns: ["invoiceNumber"] }), "bar")
		).toBe(false);
	});

	it("a ratio metric is never detail — it aggregates without a groupBy", () => {
		expect(
			isDetailModeActive(
				{
					version: 2,
					entityType: "quotes",
					metric: { op: "ratio", ratioKey: "conversionRate" },
				},
				"table"
			)
		).toBe(false);
	});
});

const baseState = (over: Partial<BuilderConfigState> = {}): BuilderConfigState => ({
	entityType: "invoices",
	dateRangePreset: "all_time",
	metric: { op: "count" },
	columns: [],
	vizType: "table",
	...over,
});

describe("builderStateToSaved ↔ savedToBuilderState round trips (R8a)", () => {
	it("a preset date range survives hydrate → save unchanged", () => {
		const config = v2({
			groupBy: "issuedDate_month",
			date: { range: { kind: "preset", preset: "this_year" } },
		});
		const state = savedToBuilderState(config, { type: "column" });
		expect(state.dateRangePreset).toBe("this_year");

		const saved = builderStateToSaved(state);
		expect(saved.config).toEqual(config);
		expect(saved.visualization).toEqual({ type: "column" });
	});

	it("regression: a custom absolute range survives hydrate → save (the old builder reset it to All Time)", () => {
		const start = Date.parse("2024-02-15T00:00:00.000");
		const end = new Date(2024, 2, 15, 23, 59, 59, 999).getTime();
		const config = v2({
			groupBy: "status",
			date: { range: { kind: "absolute", start, end } },
		});

		const state = savedToBuilderState(config, { type: "table" });
		expect(state.dateRangePreset).toBe("custom");
		expect(state.customDateRange?.from?.getTime()).toBe(start);

		const saved = builderStateToSaved(state);
		expect(saved.config).toEqual(config);
	});

	it("v2-only fields (date.field, ratio metric, includeEmptyValues, segmentBy, viz options) all round-trip", () => {
		const ratioConfig: ReportConfigV2 = {
			version: 2,
			entityType: "quotes",
			metric: { op: "ratio", ratioKey: "conversionRate" },
			date: { range: { kind: "preset", preset: "this_quarter" } },
		};
		const ratioTrip = builderStateToSaved(
			savedToBuilderState(ratioConfig, { type: "pie" })
		);
		expect(ratioTrip.config).toEqual(ratioConfig);

		const fullConfig = v2({
			groupBy: "issuedDate_month",
			segmentBy: "status",
			includeEmptyValues: true,
			date: { field: "paidAt", range: { kind: "preset", preset: "this_year" } },
			metric: { op: "sum", field: "total" },
		});
		const viz = { type: "bar" as const, options: { seriesLimit: 10, sort: "value_desc" as const } };
		const fullTrip = builderStateToSaved(savedToBuilderState(fullConfig, viz));
		expect(fullTrip.config).toEqual(fullConfig);
		expect(fullTrip.visualization).toEqual(viz);
	});

	it("a date.field override with an all-time range keeps its date object", () => {
		const config = v2({
			groupBy: "paidAt_month",
			metric: { op: "sum", field: "total" },
			date: { field: "paidAt", range: { kind: "preset", preset: "all_time" } },
		});
		const trip = builderStateToSaved(savedToBuilderState(config, { type: "line" }));
		expect(trip.config).toEqual(config);
	});

	it("v1 rows hydrate through the normalizer (magic keys expand before reaching state)", () => {
		const state = savedToBuilderState(
			{ entityType: "invoices", groupBy: ["month"] },
			{ type: "bar" }
		);
		expect(state.groupBy).toBe("paidAt_month");
		expect(state.metric).toEqual({ op: "sum", field: "total" });
		expect(state.dateField).toBe("paidAt");
	});

	it("all-time with no field override stores no date at all", () => {
		const saved = builderStateToSaved(baseState({ groupBy: "status" }));
		expect(saved.config.date).toBeUndefined();
	});

	it("a Table saved with both a grouping and columns hydrates to columns only", () => {
		const state = savedToBuilderState(
			v2({ groupBy: "status", columns: ["invoiceNumber"] }),
			{ type: "table" }
		);
		expect(state.groupBy).toBeUndefined();
		expect(state.columns).toEqual(["invoiceNumber"]);
	});

	it("a chart keeps its grouping even when stale columns ride along", () => {
		const state = savedToBuilderState(
			v2({ groupBy: "status", columns: ["invoiceNumber"] }),
			{ type: "bar" }
		);
		expect(state.groupBy).toBe("status");
	});

	it("a one-sided absolute range hydrates as custom", () => {
		const end = new Date(2024, 2, 15, 23, 59, 59, 999).getTime();
		const state = savedToBuilderState(
			v2({ date: { range: { kind: "absolute", end } } }),
			{ type: "table" }
		);
		expect(state.dateRangePreset).toBe("custom");
		expect(state.customDateRange?.from).toBeUndefined();
		expect(state.customDateRange?.to?.getTime()).toBe(end);
	});
});

describe("related-object traversal (d15) — dotted paths from REPORT_RELATIONS", () => {
	it("quoteLineItems can group by quoteId in the picker", () => {
		expect(genericGroupByOptions.quoteLineItems).toContainEqual({
			value: "quoteId",
			label: "Quote",
		});
	});

	it("a dotted groupBy with a granularity suffix survives hydrate → save", () => {
		const config: ReportConfigV2 = {
			version: 2,
			entityType: "quoteLineItems",
			metric: { op: "count" },
			groupBy: "quoteId.projectId.startDate_month",
		};
		const state = savedToBuilderState(config, { type: "column" });
		expect(state.groupBy).toBe("quoteId.projectId.startDate_month");
		expect(builderStateToSaved(state).config).toEqual(config);
	});

	it("an fk-terminal dotted groupBy survives hydrate → save", () => {
		const config: ReportConfigV2 = {
			version: 2,
			entityType: "quoteLineItems",
			metric: { op: "count" },
			groupBy: "quoteId.projectId",
		};
		const state = savedToBuilderState(config, { type: "bar" });
		expect(state.groupBy).toBe("quoteId.projectId");
		expect(builderStateToSaved(state).config).toEqual(config);
	});
});

describe("metric target + aggregation split (d15 amendment)", () => {
	const quoteTargets = () => metricTargetOptionsFor("quotes");
	const targetFor = (value: string) =>
		quoteTargets().find((o) => o.value === value);

	it("count of records leads the target list and takes no aggregation", () => {
		expect(quoteTargets()[0]).toEqual({
			value: "count",
			label: "Count of records",
			group: "Fields",
			target: { kind: "count" },
			aggregatable: false,
		});
	});

	it("a direct currency field is one aggregatable target, not four entries", () => {
		expect(targetFor("field:total")).toEqual({
			value: "field:total",
			label: "Total",
			group: "Fields",
			target: { kind: "field", field: "total" },
			aggregatable: true,
		});
		expect(quoteTargets().filter((o) => o.label === "Total")).toHaveLength(1);
	});

	it("named ratios are entity-gated, non-aggregatable targets", () => {
		expect(targetFor("ratio:conversionRate")).toEqual({
			value: "ratio:conversionRate",
			label: "Conversion rate",
			group: "Ratios",
			target: { kind: "ratio", ratioKey: "conversionRate" },
			aggregatable: false,
		});
		expect(
			metricTargetOptionsFor("clients").some((o) => o.group === "Ratios")
		).toBe(false);
	});

	it("buildMetric maps every target kind onto a ReportMetric", () => {
		expect(buildMetric({ kind: "count" }, "sum")).toEqual({ op: "count" });
		expect(buildMetric({ kind: "field", field: "total" }, "avg")).toEqual({
			op: "avg",
			field: "total",
		});
		expect(
			buildMetric({ kind: "ratio", ratioKey: "conversionRate" }, "sum")
		).toEqual({ op: "ratio", ratioKey: "conversionRate" });
	});

	it("every metric shape reads back as its target value plus aggregation", () => {
		expect(metricTargetValue({ op: "count" })).toBe("count");
		expect(metricAggOf({ op: "count" })).toBeUndefined();

		expect(metricTargetValue({ op: "avg", field: "total" })).toBe("field:total");
		expect(metricAggOf({ op: "avg", field: "total" })).toBe("avg");

		expect(
			metricTargetValue({ op: "ratio", ratioKey: "conversionRate" })
		).toBe("ratio:conversionRate");
		expect(
			metricAggOf({ op: "ratio", ratioKey: "conversionRate" })
		).toBeUndefined();
	});

	it("the flat label vocabulary keeps its old entries", () => {
		const options = metricOptionsFor("quotes");
		const byValue = (value: string) => options.find((o) => o.value === value);

		expect(byValue("count")?.label).toBe("Count of records");
		expect(byValue("sum:total")?.label).toBe("Sum of Total");
		expect(byValue("ratio:conversionRate")?.label).toBe("Conversion rate");
		expect(byValue("avg:total")?.label).toBe("Average of Total");
	});
});
