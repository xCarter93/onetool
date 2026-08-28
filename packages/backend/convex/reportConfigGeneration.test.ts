import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
	type GeneratedReport,
	describeCurrentConfig,
	generateConfigForBuilder,
	generatedReportSchema,
	parseCurrentConfig,
	reportConfigAgent,
	sanitizeGeneratedFilters,
	summarizeGeneratedReport,
	toBuilderConfig,
	toExecuteReportArgs,
	toSavedReport,
	validateGeneratedReport,
} from "./reportConfigGeneration";
import { DateUtils } from "./lib/shared";
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
		datePreset: null,
		visualization: "bar",
		name: "Invoices by status",
		description: null,
		...overrides,
	};
}

/** Measure literal with the nullable extension fields filled in. */
function measure(
	partial: Partial<NonNullable<GeneratedReport["measure"]>> & {
		op: NonNullable<GeneratedReport["measure"]>["op"];
	}
): GeneratedReport["measure"] {
	return { field: null, ratioKey: null, ...partial };
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
					measure: measure({ op: "sum", field: "total" }),
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
			validateGeneratedReport(gen({ measure: measure({ op: "sum", field: null }) }))[0]
		).toMatch(/requires a field/);
		expect(
			validateGeneratedReport(
				gen({ measure: measure({ op: "avg", field: "invoiceNumber" }) })
			)[0]
		).toMatch(/must be a number or currency field/);
	});

	it("rejects non-count measures on legacy-only groupBys", () => {
		expect(
			validateGeneratedReport(
				gen({ groupBy: "month", measure: measure({ op: "sum", field: "total" }) })
			)[0]
		).toMatch(/cannot combine with groupBy "month"/);
		// Same measure with a registry groupBy is fine.
		expect(
			validateGeneratedReport(
				gen({ groupBy: "status", measure: measure({ op: "sum", field: "total" }) })
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
		const saved = toSavedReport(gen({ measure: measure({ op: "count", field: null }) }));
		expect(saved.config.groupBy).toBe("status");
		expect(saved.config.metric).toEqual({ op: "count" });
		expect(saved.config.columns).toBeUndefined();
		expect(saved.visualization).toEqual({ type: "bar" });
	});

	it("maps a sum measure to the v2 metric shape", () => {
		const saved = toSavedReport(
			gen({ measure: measure({ op: "sum", field: "total" }) })
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
			gen({ groupBy: "month", measure: measure({ op: "count", field: null }) })
		);
		expect(args.config.groupBy).toBe("paidAt_month");
		expect(args.config.metric).toEqual({ op: "sum", field: "total" });
	});

	it("carries non-count measures into the config metric", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "status", measure: measure({ op: "sum", field: "total" }) })
		);
		expect(args.config.metric).toEqual({ op: "sum", field: "total" });
	});

	it("registry groupBy keys become grouped count configs", () => {
		const args = toExecuteReportArgs(
			gen({ groupBy: "issuedDate_month", measure: measure({ op: "count", field: null }) })
		);
		expect(args.config.groupBy).toBe("issuedDate_month");
		expect(args.config.metric).toEqual({ op: "count" });

		const clients = toExecuteReportArgs(
			gen({
				entityType: "clients",
				groupBy: "leadSource",
				measure: measure({ op: "count", field: null }),
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
				measure: measure({ op: "sum", field: "total" }),
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

describe('"number" visualization', () => {
	it("the schema accepts it, so an edit of a saved KPI can round-trip", () => {
		const parsed = generatedReportSchema.parse(
			gen({ visualization: "number", groupBy: null })
		);
		expect(parsed.visualization).toBe("number");
	});

	it("stays a number with a null groupBy instead of falling back to table", () => {
		const saved = toSavedReport(
			gen({
				visualization: "number",
				groupBy: null,
				measure: measure({ op: "sum", field: "total" }),
			})
		);
		expect(saved.visualization).toEqual({ type: "number" });
		expect(saved.config.groupBy).toBeUndefined();
		expect(saved.config.metric).toEqual({ op: "sum", field: "total" });
	});

	it("drops a groupBy the model sent alongside it, matching the builder", () => {
		const saved = toSavedReport(gen({ visualization: "number", groupBy: "status" }));
		expect(saved.visualization).toEqual({ type: "number" });
		expect(saved.config.groupBy).toBeUndefined();
	});

	it("applies and saves identically, and summarizes without the dropped grouping", () => {
		const generated = gen({ visualization: "number", groupBy: "status" });
		expect(toBuilderConfig(generated)).toEqual(toSavedReport(generated));
		expect(summarizeGeneratedReport(generated)).toBe("single metric of invoices");
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
				gen({ groupBy: "status", measure: measure({ op: "sum", field: "total" }) })
			)
		);
		expect(grouped.data).toEqual([]);
		expect(grouped.total).toBe(0);
	});
});

describe("new-vocabulary configs execute end-to-end", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("ratio, preset, dotted groupBy and date filters all run through executeReport", async () => {
		const org = await t.run(async (ctx) => await createTestOrg(ctx));
		const asUser = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);

		for (const generated of [
			gen({
				entityType: "quotes",
				groupBy: null,
				measure: measure({ op: "ratio", ratioKey: "conversionRate" }),
			}),
			gen({ groupBy: "clientId.leadSource", datePreset: "this_year" }),
			gen({
				groupBy: "status",
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [
								{ field: "issuedDate", operator: "after", value: "2026-01-01" },
								{
									field: "clientId.leadSource",
									operator: "equals",
									value: "referral",
								},
							],
						},
					],
				},
			}),
		]) {
			expect(validateGeneratedReport(generated)).toEqual([]);
			await expect(
				asUser.query(api.reportData.executeReport, toExecuteReportArgs(generated))
			).resolves.toBeDefined();
		}
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

// ---------------------------------------------------------------------------
// F4 vocabulary expansion (d15): presets, ratio metrics, date filter
// operators, dotted traversal paths.
// ---------------------------------------------------------------------------

const DAY = (iso: string, time: string) => Date.parse(`${iso}T${time}Z`);

describe("datePreset", () => {
	it("accepts a preset and rejects it alongside explicit days", () => {
		expect(validateGeneratedReport(gen({ datePreset: "this_month" }))).toEqual([]);
		expect(
			validateGeneratedReport(
				gen({ datePreset: "this_month", startDate: "2026-01-01" })
			)[0]
		).toMatch(/datePreset/);
		expect(
			validateGeneratedReport(
				gen({ datePreset: "last_year", endDate: "2026-01-01" })
			)[0]
		).toMatch(/datePreset/);
	});

	it("maps a preset to the native v2 preset range", () => {
		const saved = toSavedReport(gen({ datePreset: "last_30_days" }));
		expect(saved.config.date).toEqual({
			range: { kind: "preset", preset: "last_30_days" },
		});
	});

	it("keeps the legacy revenue date-field scope when combined with a magic groupBy", () => {
		const saved = toSavedReport(gen({ groupBy: "month", datePreset: "this_year" }));
		expect(saved.config.date).toEqual({
			field: "paidAt",
			range: { kind: "preset", preset: "this_year" },
		});
		expect(saved.config.groupBy).toBe("paidAt_month");
	});
});

describe("ratio measures", () => {
	const ratio = gen({
		entityType: "quotes",
		groupBy: null,
		measure: measure({ op: "ratio", ratioKey: "conversionRate" }),
		visualization: "pie",
		name: "Quote conversion",
	});

	it("accepts a ratio on its own entity with no grouping", () => {
		expect(validateGeneratedReport(ratio)).toEqual([]);
	});

	it("rejects a ratio on the wrong entity, with a groupBy, or without a key", () => {
		expect(
			validateGeneratedReport(gen({ measure: measure({ op: "ratio", ratioKey: "conversionRate" }), groupBy: null }))[0]
		).toMatch(/conversionRate/);
		expect(
			validateGeneratedReport({ ...ratio, groupBy: "status" })[0]
		).toMatch(/cannot combine with a groupBy/);
		expect(
			validateGeneratedReport({ ...ratio, measure: measure({ op: "ratio" }) })[0]
		).toMatch(/requires a ratioKey/);
	});

	it("maps to the native ratio metric as a single-metric visualization", () => {
		const saved = toSavedReport(ratio);
		expect(saved.config.metric).toEqual({
			op: "ratio",
			ratioKey: "conversionRate",
		});
		expect(saved.config.groupBy).toBeUndefined();
		// One value, no dimension — a chart pick would render an empty state.
		expect(saved.visualization).toEqual({ type: "number" });
		// Ratio metrics aggregate without a groupBy — never detail rows.
		expect(toExecuteReportArgs(ratio).detail).toBeUndefined();
	});
});

describe("related rollup measures are not generatable", () => {
	it("the schema rejects a measure with op \"related\"", () => {
		const parsed = generatedReportSchema.safeParse(
			gen({
				entityType: "clients",
				groupBy: null,
				measure: {
					op: "related",
					field: null,
					ratioKey: null,
					related: { entity: "invoices", field: "total", op: "sum" },
				},
			} as unknown as GeneratedReport)
		);
		expect(parsed.success).toBe(false);
	});
});

describe("timestamp filter operators", () => {
	function dateRule(field: string, operator: "before" | "after" | "on", value: unknown) {
		return gen({
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{ field, operator, value: value as string },
						],
					},
				],
			},
		});
	}

	it("accepts before/after/on with a YYYY-MM-DD value on a timestamp field", () => {
		for (const op of ["before", "after", "on"] as const) {
			expect(
				validateGeneratedReport(dateRule("issuedDate", op, "2026-09-01"))
			).toEqual([]);
		}
	});

	it("rejects date operators on non-timestamp fields and bad values", () => {
		expect(validateGeneratedReport(dateRule("status", "before", "2026-09-01"))[0]).toMatch(
			/only applies to date fields/
		);
		expect(validateGeneratedReport(dateRule("issuedDate", "on", "Sept 1"))[0]).toMatch(
			/YYYY-MM-DD/
		);
		expect(
			validateGeneratedReport(dateRule("issuedDate", "on", "2026-02-31"))[0]
		).toMatch(/real calendar date/);
		expect(validateGeneratedReport(dateRule("issuedDate", "after", 1234))[0]).toMatch(
			/YYYY-MM-DD/
		);
	});

	it("still rejects the other operators on a timestamp field", () => {
		expect(
			validateGeneratedReport(
				gen({
					filters: {
						logic: "and",
						groups: [
							{
								logic: "and",
								rules: [{ field: "issuedDate", operator: "equals", value: "2026-09-01" }],
							},
						],
					},
				})
			)[0]
		).toMatch(/is a date/);
	});

	it("converts day strings to the instants the web date picker writes", () => {
		const saved = toSavedReport(
			gen({
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [
								{ field: "issuedDate", operator: "before", value: "2026-09-01" },
								{ field: "dueDate", operator: "after", value: "2026-09-01" },
								{ field: "paidAt", operator: "on", value: "2026-09-01" },
							],
						},
					],
				},
			})
		);
		expect(saved.config.filters?.groups[0].rules).toEqual([
			{ field: "issuedDate", operator: "before", value: DAY("2026-09-01", "00:00:00.000") },
			{ field: "dueDate", operator: "after", value: DAY("2026-09-01", "23:59:59.999") },
			{ field: "paidAt", operator: "on", value: DAY("2026-09-01", "12:00:00.000") },
		]);
	});
});

describe("dotted traversal paths", () => {
	it("accepts a registry-resolvable dotted groupBy and passes it through verbatim", () => {
		const dotted = gen({ groupBy: "clientId.leadSource" });
		expect(validateGeneratedReport(dotted)).toEqual([]);
		expect(toSavedReport(dotted).config.groupBy).toBe("clientId.leadSource");
	});

	it("accepts a multi-hop path and an fk terminal", () => {
		expect(
			validateGeneratedReport(
				gen({ entityType: "invoiceLineItems", groupBy: "invoiceId.clientId.leadSource" })
			)
		).toEqual([]);
		expect(
			validateGeneratedReport(
				gen({ entityType: "invoiceLineItems", groupBy: "invoiceId.clientId" })
			)
		).toEqual([]);
		expect(
			validateGeneratedReport(
				gen({ groupBy: "clientId._creationTime_month" })
			)
		).toEqual([]);
	});

	it("rejects unresolvable paths", () => {
		expect(validateGeneratedReport(gen({ groupBy: "clientId.nope" }))[0]).toMatch(
			/Unknown report field "nope"/
		);
		expect(validateGeneratedReport(gen({ groupBy: "nope.status" }))[0]).toMatch(
			/Unknown relation "nope"/
		);
		expect(
			validateGeneratedReport(gen({ entityType: "tasks", groupBy: "assigneeUserId.status" }))[0]
		).toMatch(/not drillable/);
	});

	it("accepts a dotted filter with a field terminal", () => {
		const dotted = gen({
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{ field: "clientId.leadSource", operator: "equals", value: "referral" },
							{ field: "clientId._creationTime", operator: "after", value: "2026-01-01" },
						],
					},
				],
			},
		});
		expect(validateGeneratedReport(dotted)).toEqual([]);
		expect(toSavedReport(dotted).config.filters?.groups[0].rules).toEqual([
			{ field: "clientId.leadSource", operator: "equals", value: "referral" },
			{
				field: "clientId._creationTime",
				operator: "after",
				value: DAY("2026-01-01", "23:59:59.999"),
			},
		]);
	});

	it("rejects fk terminals, time buckets, and option mismatches in dotted filters", () => {
		function rule(field: string, value: string, overrides: Partial<GeneratedReport> = {}) {
			return gen({
				filters: {
					logic: "and",
					groups: [
						{ logic: "and", rules: [{ field, operator: "equals", value }] },
					],
				},
				...overrides,
			});
		}
		// A bare fk isn't in the registry at all; a dotted one resolves to a record.
		expect(validateGeneratedReport(rule("clientId", "x"))[0]).toMatch(
			/does not exist on invoices/
		);
		expect(
			validateGeneratedReport(
				rule("invoiceId.clientId", "x", {
					entityType: "invoiceLineItems",
					groupBy: "unit",
				})
			)[0]
		).toMatch(/related record, not a filterable value/);
		expect(
			validateGeneratedReport(rule("clientId._creationTime_month", "x"))[0]
		).toMatch(/time bucket/);
		expect(validateGeneratedReport(rule("clientId.leadSource", "nope"))[0]).toMatch(
			/not a valid clientId.leadSource value/
		);
	});
});

describe("describeCurrentConfig round-trips", () => {
	/** Render a v2 config the way the prompt sees it, then map back the way a
	 * well-behaved model would answer — the config must survive the round trip. */
	function render(config: Record<string, unknown>): string {
		const current = parseCurrentConfig(
			JSON.stringify({ config: { version: 2, ...config }, visualization: { type: "bar" } })
		);
		return describeCurrentConfig(current!);
	}

	it("re-expresses a ratio metric", () => {
		const config = {
			entityType: "quotes" as const,
			metric: { op: "ratio" as const, ratioKey: "conversionRate" as const },
		};
		expect(render(config)).toContain("metric: ratio (conversionRate)");
		const saved = toSavedReport(
			gen({
				entityType: "quotes",
				groupBy: null,
				measure: measure({ op: "ratio", ratioKey: "conversionRate" }),
			})
		);
		expect(saved.config.metric).toEqual(config.metric);
	});

	it("re-expresses a preset date range", () => {
		const config = {
			entityType: "invoices" as const,
			metric: { op: "count" as const },
			date: { range: { kind: "preset" as const, preset: "this_quarter" as const } },
		};
		expect(render(config)).toContain("date range: this_quarter");
		const saved = toSavedReport(gen({ groupBy: null, datePreset: "this_quarter" }));
		expect(saved.config.date).toEqual(config.date);
	});

	it("re-expresses a dotted groupBy", () => {
		const config = {
			entityType: "invoices" as const,
			metric: { op: "count" as const },
			groupBy: "clientId.leadSource",
		};
		expect(render(config)).toContain("group by: clientId.leadSource");
		const saved = toSavedReport(gen({ groupBy: "clientId.leadSource" }));
		expect(saved.config.groupBy).toBe(config.groupBy);
	});
});

describe("org-timezone date anchors", () => {
	// Auckland is UTC+13 in January — far enough east that UTC noon is already
	// the next local day, which is what the pre-fix anchors got wrong.
	const TZ = "Pacific/Auckland";

	function dateRules(rules: GeneratedReport["filters"]) {
		return gen({ filters: rules });
	}

	it("anchors an \"on\" value to org-local noon so the day key matches", () => {
		const saved = toSavedReport(
			dateRules({
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "paidAt", operator: "on", value: "2026-01-15" }],
					},
				],
			}),
			TZ
		);
		const value = saved.config.filters?.groups[0].rules[0].value as number;
		expect(DateUtils.toLocalDateString(value, TZ)).toBe("2026-01-15");
		expect(value).toBe(Date.parse("2026-01-14T23:00:00.000Z"));
	});

	it("anchors before/after to org-local day bounds", () => {
		const saved = toSavedReport(
			dateRules({
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [
							{ field: "issuedDate", operator: "before", value: "2026-01-15" },
							{ field: "dueDate", operator: "after", value: "2026-01-15" },
						],
					},
				],
			}),
			TZ
		);
		expect(saved.config.filters?.groups[0].rules).toEqual([
			{
				field: "issuedDate",
				operator: "before",
				value: Date.parse("2026-01-14T11:00:00.000Z"),
			},
			{
				field: "dueDate",
				operator: "after",
				value: Date.parse("2026-01-15T10:59:59.999Z"),
			},
		]);
	});

	it("anchors an explicit startDate/endDate range to org-local day bounds", () => {
		const saved = toSavedReport(
			gen({ startDate: "2026-01-01", endDate: "2026-01-31" }),
			TZ
		);
		expect(saved.config.date?.range).toEqual({
			kind: "absolute",
			start: Date.parse("2025-12-31T11:00:00.000Z"),
			end: Date.parse("2026-01-31T10:59:59.999Z"),
		});
	});

	it("passes the timezone through toExecuteReportArgs and toBuilderConfig", () => {
		const generated = gen({ startDate: "2026-01-01", endDate: "2026-01-31" });
		expect(toExecuteReportArgs(generated, TZ).config.date?.range).toEqual({
			kind: "absolute",
			start: Date.parse("2025-12-31T11:00:00.000Z"),
			end: Date.parse("2026-01-31T10:59:59.999Z"),
		});
		expect(toBuilderConfig(generated, TZ)).toEqual(toSavedReport(generated, TZ));
	});

	it("falls back to UTC when the org has no timezone", () => {
		const generated = gen({ startDate: "2026-01-01", endDate: "2026-01-31" });
		expect(toSavedReport(generated, undefined)).toEqual(toSavedReport(generated));
		expect(toSavedReport(generated).config.date?.range).toEqual({
			kind: "absolute",
			start: Date.parse("2026-01-01T00:00:00.000Z"),
			end: Date.parse("2026-01-31T23:59:59.999Z"),
		});
	});
});
