import { describe, expect, it } from "vitest";
import expansionGolden from "../__goldens__/report-v1-expansion.json";
import {
	isV2Config,
	legacyConfigView,
	normalizeReportConfig,
	type ReportConfig,
	type ReportConfigV2,
	type ReportVisualization,
} from "./reportConfig";

/**
 * The expansion golden pins the *intended* v1 → v2 mapping (hand-checked, no
 * regeneration flag — blessing a change means editing the JSON deliberately).
 * Whether the expanded configs reproduce legacy executeReport output is R4a's
 * dual-run's job, not this file's.
 */
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type GoldenCase = {
	input: { config: ReportConfig; visualization: ReportVisualization };
	output: { config: ReportConfigV2; visualization: ReportVisualization };
};

describe("normalizeReportConfig — expansion golden", () => {
	const cases = expansionGolden as Record<string, GoldenCase>;

	for (const [name, testCase] of Object.entries(cases)) {
		it(name, () => {
			const result = normalizeReportConfig(
				testCase.input.config,
				testCase.input.visualization
			);
			expect(roundTrip(result)).toStrictEqual(testCase.output);
		});
	}

	it("every output is a v2 config", () => {
		for (const testCase of Object.values(cases)) {
			expect(isV2Config(testCase.output.config)).toBe(true);
		}
	});
});

describe("normalizeReportConfig — edge cases", () => {
	it("drops malformed v1 filters instead of carrying junk into v2", () => {
		const { config } = normalizeReportConfig(
			{ entityType: "clients", filters: { bogus: true } } as ReportConfig,
			{ type: "table" }
		);
		expect(config.filters).toBeUndefined();
	});

	it("treats an empty dateRange object as all-time (no date key)", () => {
		const { config } = normalizeReportConfig(
			{ entityType: "clients", dateRange: {} },
			{ type: "table" }
		);
		expect(config.date).toBeUndefined();
	});

	it("maps an explicit count aggregation entry to the count metric", () => {
		const { config } = normalizeReportConfig(
			{
				entityType: "clients",
				groupBy: ["status"],
				aggregations: [{ field: "status", operation: "count" }],
			},
			{ type: "bar" }
		);
		expect(config.metric).toStrictEqual({ op: "count" });
	});

	it("keeps explicit visualization options over the client-expansion defaults", () => {
		const { visualization } = normalizeReportConfig(
			{ entityType: "invoices", groupBy: ["client"] },
			{ type: "bar", options: { seriesLimit: 5 } }
		);
		expect(visualization.options).toStrictEqual({
			sort: "value_desc",
			seriesLimit: 5,
		});
	});

	it("refuses revenue expansion when OR-of-OR filters have no v2 representation", () => {
		expect(() =>
			normalizeReportConfig(
				{
					entityType: "invoices",
					groupBy: ["month"],
					filters: {
						logic: "or",
						groups: [
							{
								logic: "or",
								rules: [
									{ field: "status", operator: "equals", value: "sent" },
									{ field: "status", operator: "equals", value: "overdue" },
								],
							},
							{
								logic: "and",
								rules: [{ field: "total", operator: "greater_than", value: 0 }],
							},
						],
					},
				},
				{ type: "column" }
			)
		).toThrowError(/no v2 filter representation/);
	});
});

describe("legacyConfigView", () => {
	it("returns v1 configs untouched", () => {
		const config: ReportConfig = {
			entityType: "invoices",
			groupBy: ["month"],
			dateRange: { start: 1 },
		};
		expect(legacyConfigView(config)).toBe(config);
	});

	it("flattens a v2 sum config to the v1 shape", () => {
		expect(
			legacyConfigView({
				version: 2,
				entityType: "invoices",
				metric: { op: "sum", field: "total" },
				groupBy: "status",
				date: { range: { kind: "absolute", start: 1, end: 2 } },
				columns: ["total"],
			})
		).toStrictEqual({
			entityType: "invoices",
			aggregations: [{ field: "total", operation: "sum" }],
			groupBy: ["status"],
			columns: ["total"],
			dateRange: { start: 1, end: 2 },
		});
	});

	it("omits aggregations for count, ratio, and related metrics", () => {
		for (const metric of [
			{ op: "count" as const },
			{ op: "ratio" as const, ratioKey: "conversionRate" as const },
			{
				op: "related" as const,
				related: { entity: "invoices" as const, fk: "projectId", op: "sum" as const },
			},
		]) {
			const view = legacyConfigView({
				version: 2,
				entityType: "quotes",
				metric,
			});
			expect(view.aggregations).toBeUndefined();
		}
	});

	it("omits dateRange for preset ranges (nothing to resolve before R4a)", () => {
		const view = legacyConfigView({
			version: 2,
			entityType: "clients",
			metric: { op: "count" },
			date: { range: { kind: "preset", preset: "this_month" } },
		});
		expect(view.dateRange).toBeUndefined();
	});
});
