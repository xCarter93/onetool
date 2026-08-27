import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
	type GeneratedReport,
	describeCurrentConfig,
	generateConfigForBuilder,
	parseCurrentConfig,
	reportConfigAgent,
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

	it("saves a native v2 config", () => {
		const saved = toSavedReport(gen());
		expect(saved.config.version).toBe(2);
		expect(saved.config.entityType).toBe("invoices");
	});

	it("maps a count measure to a count metric and a plain-string groupBy", () => {
		const saved = toSavedReport(gen({ measure: { op: "count", field: null } }));
		expect(saved.config.groupBy).toBe("status");
		expect(saved.config.metric).toEqual({ op: "count" });
		expect(saved.config.columns).toBeUndefined();
		expect(saved.visualization).toEqual({ type: "bar" });
	});

	it("maps a sum measure to the v2 metric shape", () => {
		const saved = toSavedReport(
			gen({ measure: { op: "sum", field: "total" } })
		);
		expect(saved.config.metric).toEqual({ op: "sum", field: "total" });
	});

	it("expands generatable magic group-bys so the saved config is executable", () => {
		const saved = toSavedReport(gen({ groupBy: "month" }));
		expect(saved.config.groupBy).toBe("paidAt_month");
		expect(saved.config.metric).toEqual({ op: "sum", field: "total" });
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
		expect(saved.config.date).toEqual({
			range: {
				kind: "absolute",
				start: Date.parse("2026-01-01T00:00:00.000Z"),
				end: Date.parse("2026-01-31T23:59:59.999Z"),
			},
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
		expect(args.config.metric).toEqual({ op: "count" });
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
	});

	it("expands the 'month' magic key to the paid-revenue v2 config", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "month", measure: { op: "count", field: null } })
		);
		expect(args.config.groupBy).toBe("paidAt_month");
		expect(args.config.metric).toEqual({ op: "sum", field: "total" });
	});

	it("carries non-count measures into the config metric", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "status", measure: { op: "sum", field: "total" } })
		);
		expect(args.config.metric).toEqual({ op: "sum", field: "total" });
	});

	it("registry groupBy keys become grouped count configs", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "issuedDate_month", measure: { op: "count", field: null } })
		);
		expect(args.config.groupBy).toBe("issuedDate_month");
		expect(args.config.metric).toEqual({ op: "count" });

		const clients = toExecuteReportArgs(
			gen({
				entityType: "clients",
				groupBy: "leadSource",
				measure: { op: "count", field: null },
			})
		);
		expect(clients.config.groupBy).toBe("leadSource");
		expect(clients.config.metric).toEqual({ op: "count" });
	});
});

describe("parseCurrentConfig", () => {
	/** The builder publishes its live draft as a saved (config, visualization) pair. */
	function relay(
		config: Record<string, unknown> = {},
		visualization: unknown = { type: "bar" }
	): string {
		return JSON.stringify({
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				...config,
			},
			visualization,
		});
	}

	it("parses a v2 (config, visualization) pair", () => {
		expect(parseCurrentConfig(relay({ groupBy: "status" }))).toEqual({
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "status",
			},
			visualization: { type: "bar" },
		});
	});

	it("keeps the config when the visualization is missing or unusable", () => {
		expect(parseCurrentConfig(relay({}, null))?.visualization).toBeNull();
		expect(parseCurrentConfig(relay({}, { nope: 1 }))?.visualization).toBeNull();
	});

	it("rejects malformed, oversized, and non-v2 relays", () => {
		expect(parseCurrentConfig("not json")).toBeNull();
		expect(parseCurrentConfig('["array"]')).toBeNull();
		expect(parseCurrentConfig('"string"')).toBeNull();
		expect(parseCurrentConfig(null)).toBeNull();
		expect(parseCurrentConfig(undefined)).toBeNull();
		expect(parseCurrentConfig(`{"pad":"${"x".repeat(5000)}"}`)).toBeNull();
		// The pre-R8a flat shape is no longer accepted.
		expect(parseCurrentConfig('{"entityType":"invoices"}')).toBeNull();
		expect(parseCurrentConfig(relay({ version: 1 }))).toBeNull();
		expect(parseCurrentConfig(relay({ entityType: "aliens" }))).toBeNull();
		expect(parseCurrentConfig(relay({ metric: { op: "median" } }))).toBeNull();
	});

	it("renders the draft in v2 vocabulary for the prompt", () => {
		const current = parseCurrentConfig(
			relay({
				groupBy: "clientId",
				metric: { op: "sum", field: "total" },
				date: { field: "paidAt", range: { kind: "preset", preset: "this_year" } },
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "paid" }],
						},
					],
				},
			})
		);
		expect(describeCurrentConfig(current!)).toBe(
			[
				"entity: invoices",
				"metric: sum of total",
				"group by: clientId",
				"date range: this_year on paidAt",
				"filters: 1 rule",
				"visualization: bar",
			].join("\n")
		);
	});

	it("renders ratio metrics and absolute ranges", () => {
		const current = parseCurrentConfig(
			relay({
				entityType: "quotes",
				metric: { op: "ratio", ratioKey: "conversionRate" },
				date: {
					range: {
						kind: "absolute",
						start: Date.parse("2026-01-01T00:00:00.000Z"),
					},
				},
			})
		);
		expect(describeCurrentConfig(current!)).toContain(
			"metric: ratio (conversionRate)"
		);
		expect(describeCurrentConfig(current!)).toContain(
			"date range: 2026-01-01 to now"
		);
		expect(describeCurrentConfig(current!)).toContain("group by: none");
	});
});

describe("toBuilderConfig", () => {
	it("seeds the builder with the same v2 pair the saved report gets", () => {
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
			name: "Paid invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "sum", field: "total" },
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "paid" }],
						},
					],
				},
				date: {
					range: {
						kind: "absolute",
						start: Date.parse("2026-01-01T00:00:00.000Z"),
					},
				},
				columns: ["invoiceNumber", "total"],
			},
			visualization: { type: "table" },
		});
	});

	it("applies and saves identically — same input, same config", () => {
		for (const generated of [
			gen(),
			gen({ groupBy: "month" }),
			gen({ groupBy: null, visualization: "column" }),
			gen({
				visualization: "table",
				groupBy: null,
				columns: ["invoiceNumber"],
				startDate: "2026-01-01",
			}),
			gen({ entityType: "tasks", groupBy: "status" }),
		]) {
			expect(toBuilderConfig(generated)).toEqual(toSavedReport(generated));
		}
	});

	it("drops columns for chart visualizations", () => {
		const config = toBuilderConfig(gen({ columns: ["invoiceNumber"] }));
		expect(config.config.columns).toBeUndefined();
		expect(config.config.date).toBeUndefined();
	});

	it("Slice 3-D3: a chart visualization with null groupBy is coerced to table (keeps the builder's chart-requires-groupBy invariant)", () => {
		const config = toBuilderConfig(gen({ groupBy: null, visualization: "column" }));
		expect(config.visualization).toEqual({ type: "table" });
		expect(config.config.groupBy).toBeUndefined();
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

describe("NL generation plan gate (nlReportGeneration)", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/** The pipeline reaches for runQuery/runMutation only; a free org's gate
	 * returns before anything richer is touched. */
	function toolCtx(asUser: ReturnType<typeof t.withIdentity>) {
		return {
			runQuery: (ref: never, args: never) => asUser.query(ref, args),
			runMutation: (ref: never, args: never) => asUser.mutation(ref, args),
			runAction: (ref: never, args: never) => asUser.action(ref, args),
		} as unknown as Parameters<typeof generateConfigForBuilder>[0];
	}

	async function seed(premium: boolean) {
		const org = await t.run(async (ctx) => createTestOrg(ctx));
		if (premium) {
			await t.run(async (ctx) => {
				await ctx.db.patch(org.orgId, { hasPremiumFeatureAccess: true });
			});
		}
		return {
			org,
			asUser: t.withIdentity(
				createTestIdentity(org.clerkUserId, org.clerkOrgId)
			),
		};
	}

	it("a free org gets the structured denial and never reaches the model", async () => {
		const { asUser } = await seed(false);
		const spy = vi.spyOn(reportConfigAgent, "generateObject");
		try {
			const result = await generateConfigForBuilder(
				toolCtx(asUser),
				"invoices by status"
			);
			// Denial is data the assistant relays, never a throw.
			expect(result.ok).toBe(false);
			expect(result.ok === false && result.error).toContain("Business plan");
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});

	it("the denied ask still costs the org its daily assistant message", async () => {
		const { asUser } = await seed(false);
		const { threadId } = await asUser.mutation(
			api.assistantChat.createThread,
			{}
		);
		await asUser.mutation(api.assistantChat.sendMessage, {
			threadId,
			prompt: "build me a report of invoices by status",
		});

		const result = await generateConfigForBuilder(
			toolCtx(asUser),
			"invoices by status"
		);
		expect(result.ok).toBe(false);

		const mine = await asUser.query(api.entitlements.getMine, {});
		expect(
			mine.meters.find((meter) => meter.key === "assistantMessages")
		).toMatchObject({ used: 1 });
	});

	it("a business org passes the gate into generation", async () => {
		const { asUser } = await seed(true);
		const spy = vi
			.spyOn(reportConfigAgent, "generateObject")
			.mockResolvedValue({ object: gen() } as never);
		try {
			const result = await generateConfigForBuilder(
				toolCtx(asUser),
				"invoices by status"
			);
			expect(spy).toHaveBeenCalled();
			expect(result.ok).toBe(true);
			expect(result.ok === true && result.config.config.entityType).toBe(
				"invoices"
			);
		} finally {
			spy.mockRestore();
		}
	});
});
