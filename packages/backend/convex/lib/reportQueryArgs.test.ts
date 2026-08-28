import { describe, it, expect } from "vitest";
import { resolveReportQueryArgs } from "./reportQueryArgs";
import type { ReportConfigV2, ReportVisualization } from "./reportConfig";

/**
 * The comparison gating table (PRD-reports-redesign R11). A saved
 * `date.comparison` only reaches executeReport when the report can actually
 * draw a second series; every other case is stripped here so the executor's
 * backstops stay unreachable.
 */

const BASE: ReportConfigV2 = {
	version: 2,
	entityType: "invoices",
	metric: { op: "count" },
	groupBy: "issuedDate_month",
	date: {
		field: "issuedDate",
		range: { kind: "preset", preset: "this_month" },
		comparison: { kind: "previous_period" },
	},
};

function comparisonOf(
	config: ReportConfigV2,
	visualization: ReportVisualization = { type: "column" }
) {
	return resolveReportQueryArgs(config, visualization).config.date?.comparison;
}

describe("resolveReportQueryArgs comparison gating", () => {
	it("passes a chartable, bounded, unsegmented comparison through", () => {
		expect(comparisonOf(BASE)).toEqual({ kind: "previous_period" });
		expect(comparisonOf(BASE, { type: "table" })).toEqual({
			kind: "previous_period",
		});
	});

	it("(a) strips it in detail mode", () => {
		const { groupBy: _dropped, ...noGroupBy } = BASE;
		expect(comparisonOf(noGroupBy, { type: "table" })).toBeUndefined();
		expect(
			comparisonOf({ ...BASE, columns: ["total"] }, { type: "table" })
		).toBeUndefined();
	});

	it("(b) strips it for pie, radar and radial", () => {
		for (const type of ["pie", "radar", "radial"] as const) {
			expect(comparisonOf(BASE, { type }), type).toBeUndefined();
		}
	});

	it("(c) strips it for an unbounded date range", () => {
		const withRange = (date: ReportConfigV2["date"]) =>
			comparisonOf({ ...BASE, date });
		expect(withRange(undefined)).toBeUndefined();
		expect(
			withRange({ range: { kind: "preset", preset: "all_time" }, comparison: { kind: "previous_year" } })
		).toBeUndefined();
		expect(
			withRange({
				range: { kind: "absolute", start: Date.UTC(2026, 0, 1) },
				comparison: { kind: "previous_period" },
			})
		).toBeUndefined();
		expect(
			withRange({
				range: { kind: "absolute", end: Date.UTC(2026, 0, 31) },
				comparison: { kind: "previous_period" },
			})
		).toBeUndefined();
		expect(
			withRange({
				range: {
					kind: "absolute",
					start: Date.UTC(2026, 0, 1),
					end: Date.UTC(2026, 0, 31),
				},
				comparison: { kind: "previous_period" },
			})
		).toEqual({ kind: "previous_period" });
	});

	it("(d) strips it when the report is segmented", () => {
		expect(comparisonOf({ ...BASE, segmentBy: "status" })).toBeUndefined();
	});

	it("leaves the rest of the config untouched when stripping", () => {
		const args = resolveReportQueryArgs({ ...BASE, segmentBy: "status" }, {
			type: "column",
		});
		expect(args.config.date).toEqual({
			field: "issuedDate",
			range: { kind: "preset", preset: "this_month" },
		});
		expect(args.config.segmentBy).toBe("status");
		expect(args.config.groupBy).toBe("issuedDate_month");
	});
});
