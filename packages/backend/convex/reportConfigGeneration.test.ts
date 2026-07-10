import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import {
	type GeneratedReport,
	parseCurrentConfig,
	sanitizeGeneratedFilters,
	toBuilderConfig,
	toExecuteReportArgs,
	toSavedReport,
	validateGeneratedReport,
} from "./reportConfigGeneration";
import { createTestIdentity, createTestOrg } from "./test.helpers";
import { setupConvexTest } from "./test.setup";

/** Minimal valid generated config; override per test. */
function gen(overrides: Partial<GeneratedReport> = {}): GeneratedReport {
	return {
		entityType: "invoices",
		groupBy: "status",
		measure: null,
		filters: null,
		columns: null,
		startDate: null,
		endDate: null,
		visualization: "bar",
		name: "Invoices by status",
		description: null,
		...overrides,
	};
}

describe("sanitizeGeneratedFilters", () => {
	it("drops valueless rules, keeps presence operators, strips empty groups", () => {
		const result = sanitizeGeneratedFilters({
			logic: "and",
			groups: [
				{
					logic: "or",
					rules: [
						{ field: "status", operator: "equals", value: null },
						{ field: "notes", operator: "is_empty", value: null },
					],
				},
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "" }],
				},
			],
		});
		expect(result).toEqual({
			logic: "and",
			groups: [
				{
					logic: "or",
					rules: [{ field: "notes", operator: "is_empty" }],
				},
			],
		});
		// Presence rules must not carry a value key (backend validator shape).
		expect("value" in result!.groups[0].rules[0]).toBe(false);
	});

	it("returns null when nothing survives", () => {
		expect(
			sanitizeGeneratedFilters({
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: null }],
					},
				],
			})
		).toBeNull();
		expect(sanitizeGeneratedFilters(null)).toBeNull();
	});
});

describe("validateGeneratedReport", () => {
	it("accepts a full valid config", () => {
		expect(
			validateGeneratedReport(
				gen({
					groupBy: "status",
					measure: { op: "sum", field: "total" },
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [
									{ field: "status", operator: "equals", value: "paid" },
									{ field: "total", operator: "greater_than", value: 500 },
								],
							},
						],
					},
					startDate: "2026-01-01",
					endDate: "2026-06-30",
				})
			)
		).toEqual([]);
	});

	it("accepts the widened visualization enum ('column', 'radar', 'radial')", () => {
		expect(validateGeneratedReport(gen({ visualization: "column" }))).toEqual([]);
		expect(validateGeneratedReport(gen({ visualization: "radar" }))).toEqual([]);
		expect(validateGeneratedReport(gen({ visualization: "radial" }))).toEqual([]);
	});

	it("rejects a groupBy the entity does not offer", () => {
		expect(validateGeneratedReport(gen({ groupBy: "leadSource" }))[0]).toMatch(
			/groupBy "leadSource" is not valid for invoices/
		);
	});

	it("rejects non-count measures without a numeric field", () => {
		expect(
			validateGeneratedReport(gen({ measure: { op: "sum", field: null } }))[0]
		).toMatch(/requires a field/);
		expect(
			validateGeneratedReport(
				gen({ measure: { op: "avg", field: "invoiceNumber" } })
			)[0]
		).toMatch(/must be a number or currency field/);
	});

	it("rejects non-count measures on legacy-only groupBys", () => {
		expect(
			validateGeneratedReport(
				gen({ groupBy: "month", measure: { op: "sum", field: "total" } })
			)[0]
		).toMatch(/cannot combine with groupBy "month"/);
		// Same measure with a registry groupBy is fine.
		expect(
			validateGeneratedReport(
				gen({ groupBy: "status", measure: { op: "sum", field: "total" } })
			)
		).toEqual([]);
	});

	it("rejects timestamp, unknown, and type-mismatched filter fields", () => {
		const errors = validateGeneratedReport(
			gen({
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [
								{ field: "issuedDate", operator: "greater_than", value: 1 },
								{ field: "nope", operator: "equals", value: "x" },
								{ field: "total", operator: "contains", value: "5" },
								{
									field: "invoiceNumber",
									operator: "greater_than",
									value: 5,
								},
								{ field: "status", operator: "equals", value: "bogus" },
							],
						},
					],
				},
			})
		);
		expect(errors).toHaveLength(5);
		expect(errors.join("\n")).toMatch(/is a date/);
		expect(errors.join("\n")).toMatch(/does not exist/);
		expect(errors.join("\n")).toMatch(/"contains" only applies to text/);
		expect(errors.join("\n")).toMatch(/only applies to numeric/);
		expect(errors.join("\n")).toMatch(/not a valid status value/);
	});

	it("rejects unknown table columns and bad dates", () => {
		expect(
			validateGeneratedReport(
				gen({ visualization: "table", groupBy: null, columns: ["nope"] })
			)[0]
		).toMatch(/column "nope" does not exist/);
		expect(
			validateGeneratedReport(gen({ startDate: "June 1st" }))[0]
		).toMatch(/must be YYYY-MM-DD/);
		// Shape-valid but impossible dates: Date.parse would roll 2026-02-31
		// into March and NaN the month-13 one (an unbounded filter).
		expect(
			validateGeneratedReport(gen({ startDate: "2026-02-31" }))[0]
		).toMatch(/real calendar date/);
		expect(
			validateGeneratedReport(gen({ endDate: "2026-13-45" }))[0]
		).toMatch(/real calendar date/);
		expect(
			validateGeneratedReport(
				gen({ startDate: "2026-06-30", endDate: "2026-01-01" })
			)[0]
		).toMatch(/startDate is after endDate/);
		expect(validateGeneratedReport(gen({ name: "  " }))[0]).toMatch(
			/name must not be empty/
		);
	});
});

describe("toSavedReport", () => {
	it("Slice 3-D3: a chart visualization with null groupBy is silently coerced to table", () => {
		// Charts require a groupBy to aggregate on — without one, there's
		// nothing to chart above the table, so the saved report is friendlier
		// as a plain table than a chart-labeled report that never renders one.
		const saved = toSavedReport(gen({ groupBy: null, visualization: "bar" }));
		expect(saved.visualization).toEqual({ type: "table" });
		expect(saved.config.groupBy).toBeUndefined();
	});

	it("Slice 3-D3: a chart visualization WITH a groupBy is left as the chosen chart", () => {
		const saved = toSavedReport(gen({ groupBy: "status", visualization: "pie" }));
		expect(saved.visualization).toEqual({ type: "pie" });
	});

	it("maps count measure to omitted aggregations and wraps groupBy", () => {
		const saved = toSavedReport(gen({ measure: { op: "count", field: null } }));
		expect(saved.config.groupBy).toEqual(["status"]);
		expect(saved.config.aggregations).toBeUndefined();
		expect(saved.config.columns).toBeUndefined();
		expect(saved.visualization).toEqual({ type: "bar" });
	});

	it("maps a sum measure to the saved aggregations shape", () => {
		const saved = toSavedReport(
			gen({ measure: { op: "sum", field: "total" } })
		);
		expect(saved.config.aggregations).toEqual([
			{ field: "total", operation: "sum" },
		]);
	});

	it("keeps columns only for table viz and converts dates to day bounds", () => {
		const saved = toSavedReport(
			gen({
				visualization: "table",
				groupBy: null,
				columns: ["invoiceNumber", "total"],
				startDate: "2026-01-01",
				endDate: "2026-01-31",
			})
		);
		expect(saved.config.columns).toEqual(["invoiceNumber", "total"]);
		expect(saved.config.dateRange).toEqual({
			start: Date.parse("2026-01-01T00:00:00.000Z"),
			end: Date.parse("2026-01-31T23:59:59.999Z"),
		});

		const chart = toSavedReport(gen({ columns: ["invoiceNumber"] }));
		expect(chart.config.columns).toBeUndefined();
	});
});

describe("toExecuteReportArgs", () => {
	it("uses detail mode with default columns for table + no groupBy", () => {
		const args = toExecuteReportArgs(
			gen({ visualization: "table", groupBy: null, columns: null })
		);
		expect(args.detail).toEqual({
			columns: ["invoiceNumber", "status", "total", "issuedDate"],
		});
		expect(args.aggregation).toBeUndefined();
	});

	it("prefers explicit columns in detail mode", () => {
		const args = toExecuteReportArgs(
			gen({ visualization: "table", groupBy: null, columns: ["total"] })
		);
		expect(args.detail).toEqual({ columns: ["total"] });
	});

	it("ungrouped charts → detail mode (Slice 3-D3: charts require a groupBy; nothing to chart above)", () => {
		const args = toExecuteReportArgs(gen({ groupBy: null }));
		expect(args.detail).toEqual({
			columns: ["invoiceNumber", "status", "total", "issuedDate"],
		});
		expect(args.aggregation).toBeUndefined();
	});

	it("omits aggregation for grouped count so legacy dispatch applies", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "month", measure: { op: "count", field: null } })
		);
		expect(args.groupBy).toBe("month");
		expect(args.aggregation).toBeUndefined();
	});

	it("passes non-count measures through as aggregation", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "status", measure: { op: "sum", field: "total" } })
		);
		expect(args.aggregation).toEqual({ op: "sum", field: "total" });
	});

	it("sends an explicit count aggregation for a grouped count on a NON-legacy (generic-only) groupBy", () => {
		// invoices.issuedDate_month is one of the newly-added, generic-only
		// options — a grouped count must NOT fall through to legacy dispatch
		// (which would silently mis-group it under the entity default).
		const args = toExecuteReportArgs(
			gen({ groupBy: "issuedDate_month", measure: { op: "count", field: null } })
		);
		expect(args.groupBy).toBe("issuedDate_month");
		expect(args.aggregation).toEqual({ op: "count" });
	});

	it("still omits aggregation for a grouped count on legacy-only groupBys (status, leadSource, etc.)", () => {
		expect(
			toExecuteReportArgs(
				gen({ groupBy: "status", measure: { op: "count", field: null } })
			).aggregation
		).toBeUndefined();
		expect(
			toExecuteReportArgs(
				gen({
					entityType: "clients",
					groupBy: "leadSource",
					measure: { op: "count", field: null },
				})
			).aggregation
		).toBeUndefined();
	});
});

describe("parseCurrentConfig", () => {
	it("parses a JSON object and rejects everything else", () => {
		expect(parseCurrentConfig('{"entityType":"invoices"}')).toEqual({
			entityType: "invoices",
		});
		expect(parseCurrentConfig("not json")).toBeNull();
		expect(parseCurrentConfig('["array"]')).toBeNull();
		expect(parseCurrentConfig('"string"')).toBeNull();
		expect(parseCurrentConfig(null)).toBeNull();
		expect(parseCurrentConfig(undefined)).toBeNull();
		expect(parseCurrentConfig(`{"pad":"${"x".repeat(5000)}"}`)).toBeNull();
	});
});

describe("toBuilderConfig", () => {
	it("normalizes the generated config for the builder", () => {
		const config = toBuilderConfig(
			gen({
				groupBy: null,
				visualization: "table",
				columns: ["invoiceNumber", "total"],
				measure: { op: "sum", field: "total" },
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [
								{ field: "status", operator: "equals", value: "paid" },
								{ field: "status", operator: "equals", value: null },
							],
						},
					],
				},
				startDate: "2026-01-01",
				endDate: null,
				name: "  Paid invoices  ",
			})
		);
		expect(config).toEqual({
			entityType: "invoices",
			groupBy: null,
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "status", operator: "equals", value: "paid" }],
					},
				],
			},
			measure: { op: "sum", field: "total" },
			columns: ["invoiceNumber", "total"],
			dateRange: { start: Date.parse("2026-01-01T00:00:00.000Z") },
			visualization: "table",
			name: "Paid invoices",
			description: null,
		});
	});

	it("drops columns for chart visualizations", () => {
		const config = toBuilderConfig(gen({ columns: ["invoiceNumber"] }));
		expect(config.columns).toBeNull();
		expect(config.dateRange).toBeNull();
	});

	it("Slice 3-D3: a chart visualization with null groupBy is coerced to table (keeps the builder's chart-requires-groupBy invariant)", () => {
		const config = toBuilderConfig(gen({ groupBy: null, visualization: "column" }));
		expect(config.visualization).toBe("table");
		expect(config.groupBy).toBeNull();
	});
});

describe("generated configs execute end-to-end", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("detail and generic-aggregation args from generated configs run through executeReport", async () => {
		const org = await t.run(async (ctx) => await createTestOrg(ctx));
		const asUser = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);

		const detail = await asUser.query(
			api.reportData.executeReport,
			toExecuteReportArgs(
				gen({
					visualization: "table",
					groupBy: null,
					columns: null,
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [
									{ field: "status", operator: "equals", value: "paid" },
								],
							},
						],
					},
				})
			)
		);
		expect(detail.detail?.columns.map((c) => c.field)).toEqual([
			"invoiceNumber",
			"status",
			"total",
			"issuedDate",
		]);

		const grouped = await asUser.query(
			api.reportData.executeReport,
			toExecuteReportArgs(
				gen({ groupBy: "status", measure: { op: "sum", field: "total" } })
			)
		);
		expect(grouped.data).toEqual([]);
		expect(grouped.total).toBe(0);
	});
});

describe("recordUsage explicit attribution", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("inserts a row from explicit orgId/userId with no thread meta", async () => {
		const org = await t.run(async (ctx) => await createTestOrg(ctx));

		await t.mutation(internal.assistantAgent.recordUsage, {
			orgId: org.orgId,
			userId: org.userId,
			agentName: "report-config-generator",
			model: "gpt-5.4-mini",
			provider: "openai",
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		});

		const rows = await t.run(
			async (ctx) => await ctx.db.query("agentUsage").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			orgId: org.orgId,
			userId: org.userId,
			agentName: "report-config-generator",
			totalTokens: 150,
		});
		expect(rows[0].threadId).toBeUndefined();
	});

	it("still skips thread-less usage without explicit attribution", async () => {
		await t.mutation(internal.assistantAgent.recordUsage, {
			model: "gpt-5.4-mini",
			provider: "openai",
			inputTokens: 1,
			outputTokens: 1,
			totalTokens: 2,
		});
		const rows = await t.run(
			async (ctx) => await ctx.db.query("agentUsage").collect()
		);
		expect(rows).toHaveLength(0);
	});
});
