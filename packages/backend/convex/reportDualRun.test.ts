import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createTestClient,
	createTestInvoice,
	createTestQuote,
	createTestTask,
} from "./test.helpers";
import { api } from "./_generated/api";
import { normalizeReportConfig, type ReportConfigV2 } from "./lib/reportConfig";
import {
	DEFAULT_GROUP_BY,
	DEFAULT_DETAIL_COLUMNS,
	getReportField,
	type ReportEntityType,
	type ReportFieldDef,
} from "./lib/reportFields";
import {
	GOLDEN_T0,
	LEGACY_MATRIX,
	seedCanonicalOrg,
	type MatrixArgs,
} from "./test.reportGoldenSeed";
import legacyDispatchGolden from "./__goldens__/report-legacy-dispatch.json";
import detailModeGolden from "./__goldens__/report-detail-mode.json";

/**
 * The unified pipeline's regression pin (PRD-reports-redesign §3.3, §8 d11):
 * every retired-dispatch fixture must be reproduced when the R2 expander's v2
 * config is executed through executeReport's `config` arg. This suite owns
 * report-legacy-dispatch.json since R4c deleted the dispatch itself (the
 * unknown-literal-fallback key was deleted with it — v2 validates groupBy and
 * throws).
 *
 * The comparator applies ONLY the approved transforms below — anything else
 * that diverges fails the run. No golden file is edited.
 */

const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** v1 magic keys → the registry keys the expander emits (§8 d11). */
const GROUP_BY_EXPANSION: Record<string, string> = {
	month: "paidAt_month",
	client: "clientId",
};

type GoldenPoint = {
	label: string;
	value: number;
	bucketKey?: string;
	metadata?: Record<string, unknown>;
};
type GoldenResult = {
	data: GoldenPoint[];
	total: number;
	metadata?: Record<string, unknown>;
	detail?: { rows: Record<string, unknown>[] };
};

/**
 * Drill-down added `bucketKey` per data point and `id`/`refs` per detail row,
 * all additive and (for ids) non-deterministic, so the fixtures predate them:
 * strip before comparing. bucketKey is deleted unconditionally because the
 * ratio matrix keys legitimately have none; presence is pinned in
 * reportData.test.ts, not here.
 */
function stripDrillDownFields(result: unknown): GoldenResult {
	const value = roundTrip(result) as GoldenResult;
	for (const point of value.data) delete point.bucketKey;
	for (const row of value.detail?.rows ?? []) {
		expect(typeof row.id).toBe("string");
		delete row.id;
		delete row.refs;
	}
	return value;
}

function optionLabel(def: ReportFieldDef, option: string): string {
	return (
		def.optionLabels?.[option] ??
		option
			.split(/[-_]/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ")
	);
}

function monthLabel(key: string): string {
	const [year, month] = key.split("-");
	return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
	});
}

/**
 * Applies the approved deltas to a legacy fixture so it matches unified-pipeline
 * output: d2 "Prospective"→"Lead"; the revenue month label change "2026-01"→
 * "Jan 2026" (plus the additive metadata.dateKey every other time report already
 * carries); the metadata.groupBy expansion mapping; and the Q9 canonical
 * options ordering (reorders value-desc legacy outputs like leadSource and
 * activityType into registry-options order, extras after).
 */
function transformExpected(args: MatrixArgs, golden: unknown): GoldenResult {
	const expected = structuredClone(golden) as GoldenResult;
	const groupBy = args.groupBy ?? DEFAULT_GROUP_BY[args.entityType];
	const v2GroupBy = GROUP_BY_EXPANSION[groupBy] ?? groupBy;

	if (expected.metadata && typeof expected.metadata.groupBy === "string") {
		expected.metadata.groupBy = v2GroupBy;
	}

	if (args.entityType === "clients" && v2GroupBy === "status") {
		for (const point of expected.data) {
			if (point.label === "Prospective") point.label = "Lead";
		}
	}

	if (groupBy === "month") {
		expected.data = expected.data.map(({ label, value }) => ({
			label: monthLabel(label),
			value,
			metadata: { dateKey: label },
		}));
	}

	const def = getReportField(args.entityType, v2GroupBy);
	if (def?.options) {
		const canonicalOrder = def.options.map((o) => optionLabel(def, o));
		expected.data = expected.data
			.map((point, index) => ({ point, index }))
			.sort((a, b) => {
				const ai = canonicalOrder.indexOf(a.point.label);
				const bi = canonicalOrder.indexOf(b.point.label);
				const aKey = ai === -1 ? canonicalOrder.length : ai;
				const bKey = bi === -1 ? canonicalOrder.length : bi;
				return aKey - bKey || a.index - b.index;
			})
			.map(({ point }) => point);
	}

	return expected;
}

function toV2Request(args: MatrixArgs): {
	config: ReportConfigV2;
	seriesLimit?: number;
} {
	const groupBy = args.groupBy ?? DEFAULT_GROUP_BY[args.entityType];
	const { config, visualization } = normalizeReportConfig(
		{
			entityType: args.entityType,
			groupBy: [groupBy],
			...(args.dateRange ? { dateRange: args.dateRange } : {}),
		},
		{ type: "bar" }
	);
	return { config, seriesLimit: visualization.options?.seriesLimit };
}

describe("R4a dual-run: expanded v2 configs reproduce the legacy fixtures", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"], now: GOLDEN_T0 });
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("every matrix key matches its transformed fixture", async () => {
		const { asOrg } = await seedCanonicalOrg(t);
		const golden = legacyDispatchGolden as Record<string, unknown>;

		expect(Object.keys(golden).sort()).toStrictEqual(Object.keys(LEGACY_MATRIX).sort());

		for (const [key, args] of Object.entries(LEGACY_MATRIX)) {
			const { config, seriesLimit } = toV2Request(args);
			const result = await asOrg.query(api.reportData.executeReport, {
				entityType: args.entityType,
				config,
				...(seriesLimit !== undefined ? { seriesLimit } : {}),
			});
			expect(stripDrillDownFields(result), key).toStrictEqual(
				transformExpected(args, golden[key])
			);
		}
	});

	it("detail mode through a v2 config matches the detail fixtures byte-for-byte", async () => {
		const { asOrg } = await seedCanonicalOrg(t);
		const golden = detailModeGolden as Record<string, unknown>;

		for (const entityType of Object.keys(DEFAULT_DETAIL_COLUMNS) as ReportEntityType[]) {
			const { config } = normalizeReportConfig({ entityType }, { type: "table" });
			const result = await asOrg.query(api.reportData.executeReport, {
				entityType,
				config,
				detail: { columns: DEFAULT_DETAIL_COLUMNS[entityType] },
			});
			expect(stripDrillDownFields(result), entityType).toStrictEqual(golden[entityType]);
		}
	});
});

describe("v2 execution semantics beyond the fixtures", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg(timezone?: string) {
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx, {
				clerkUserId: "user_1",
				clerkOrgId: "org_1",
			});
			if (timezone) await ctx.db.patch(setup.orgId, { timezone });
			return setup;
		});
		const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		return { org, asOrg };
	}

	it("seriesLimit truncates buckets after sort while total stays scan-wide", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			for (let i = 0; i < 12; i++) {
				const clientId = await createTestClient(ctx, org.orgId, {
					companyName: `Client ${i + 1}`,
				});
				await createTestInvoice(ctx, org.orgId, clientId, {
					status: "paid",
					total: (i + 1) * 100,
					paidAt: Date.UTC(2026, 0, 10),
				});
			}
		});

		const { config, seriesLimit } = toV2Request({
			entityType: "invoices",
			groupBy: "client",
		});
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
			seriesLimit,
		});

		expect(result.data).toHaveLength(10);
		expect(result.data[0]).toMatchObject({ label: "Client 12", value: 1200 });
		expect(result.data[9]).toMatchObject({ label: "Client 3", value: 300 });
		expect(result.total).toBe(7800);
	});

	it("time grouping excludes rows without a usable timestamp from data AND total", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 500,
				paidAt: Date.UTC(2026, 0, 10),
			});
			// Paid but never stamped — legacy scanPaidInvoices dropped these too.
			await createTestInvoice(ctx, org.orgId, clientId, {
				status: "paid",
				total: 999,
			});
		});

		const { config } = toV2Request({ entityType: "invoices", groupBy: "month" });
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
		});

		expect(result.data).toHaveLength(1);
		expect(result.total).toBe(500);
	});

	it("preset ranges resolve server-side at execution time", async () => {
		const { org, asOrg } = await seedOrg("America/New_York");
		const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, { status: "pending", date: Date.now() });
			await createTestTask(ctx, org.orgId, { status: "pending", date: sixtyDaysAgo });
		});

		const config: ReportConfigV2 = {
			version: 2,
			entityType: "tasks",
			date: { range: { kind: "preset", preset: "this_month" } },
			metric: { op: "count" },
			groupBy: "status",
		};
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config,
		});

		expect(result.total).toBe(1);
		expect(result.metadata?.dateRange).toBeDefined();
	});

	it("includeEmptyValues defaults to dropping empty option buckets", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run((ctx) => createTestTask(ctx, org.orgId, { status: "pending" }));

		const config: ReportConfigV2 = {
			version: 2,
			entityType: "tasks",
			metric: { op: "count" },
			groupBy: "status",
		};
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config,
		});

		expect(result.data).toEqual([{ label: "Pending", value: 1, bucketKey: "pending" }]);
	});

	it("segmentBy stacks a second dimension with a shared ordered key set", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			await createTestTask(ctx, org.orgId, {
				status: "completed",
				date: Date.UTC(2026, 0, 5),
			});
			await createTestTask(ctx, org.orgId, {
				status: "pending",
				date: Date.UTC(2026, 0, 20),
			});
			await createTestTask(ctx, org.orgId, {
				status: "pending",
				date: Date.UTC(2026, 1, 5),
			});
		});

		const config: ReportConfigV2 = {
			version: 2,
			entityType: "tasks",
			date: {
				range: { kind: "absolute", start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 2, 1) },
			},
			metric: { op: "count" },
			groupBy: "date_month",
			segmentBy: "status",
		};
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config,
		});

		expect(result.metadata?.segmentBy).toBe("status");
		expect(result.metadata?.segments).toEqual([
			{ key: "pending", label: "Pending" },
			{ key: "completed", label: "Completed" },
		]);
		expect(result.data).toHaveLength(2);
		expect(result.data[0].segments).toEqual({ completed: 1, pending: 1 });
		expect(result.data[1].segments).toEqual({ pending: 1 });
	});

	it("rejects a config whose entityType disagrees with the args", async () => {
		const { asOrg } = await seedOrg();
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				config: { version: 2, entityType: "tasks", metric: { op: "count" } },
			})
		).rejects.toThrow(/does not match/);
	});

	it("rejects unknown v2 groupBy fields instead of falling back", async () => {
		const { asOrg } = await seedOrg();
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				config: {
					version: 2,
					entityType: "clients",
					metric: { op: "count" },
					groupBy: "totallyBogusGroupBy",
				},
			})
		).rejects.toThrow(/Unknown report groupBy/);
	});

	it("rejects an unknown date.field override", async () => {
		const { asOrg } = await seedOrg();
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "invoices",
				config: {
					version: 2,
					entityType: "invoices",
					date: { field: "status", range: { kind: "preset", preset: "all_time" } },
					metric: { op: "count" },
				},
			})
		).rejects.toThrow(/Unknown report date field/);
	});

	it("ratio metric honors filters and the pinned percentage shape", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestQuote(ctx, org.orgId, clientId, { status: "draft", total: 100 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 200 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "approved", total: 300 });
			await createTestQuote(ctx, org.orgId, clientId, { status: "declined", total: 900 });
		});

		const config: ReportConfigV2 = {
			version: 2,
			entityType: "quotes",
			metric: { op: "ratio", ratioKey: "conversionRate" },
			filters: {
				logic: "and",
				groups: [
					{
						logic: "and",
						rules: [{ field: "total", operator: "less_than", value: 500 }],
					},
				],
			},
		};
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "quotes",
			config,
		});

		// Declined quote filtered out: 1 approved / 2 resolved = 50%.
		expect(result.total).toBe(50);
		expect(result.data).toEqual([
			{ label: "Approved", value: 1 },
			{ label: "Not Approved", value: 1 },
		]);
		expect(result.metadata?.groupBy).toBe("conversionRate");
	});

	it("ratio metric rejects the wrong entity and any grouping", async () => {
		const { asOrg } = await seedOrg();
		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "clients",
				config: {
					version: 2,
					entityType: "clients",
					metric: { op: "ratio", ratioKey: "conversionRate" },
				},
			})
		).rejects.toThrow(/not available/);

		await expect(
			asOrg.query(api.reportData.executeReport, {
				entityType: "quotes",
				config: {
					version: 2,
					entityType: "quotes",
					metric: { op: "ratio", ratioKey: "conversionRate" },
					groupBy: "status",
				},
			})
		).rejects.toThrow(/does not support grouping/);
	});

	it("grouped count on an entity with a summary value field keeps the dollar column on the generic path too", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			await createTestInvoice(ctx, org.orgId, clientId, { status: "sent", total: 200 });
			await createTestInvoice(ctx, org.orgId, clientId, { status: "sent", total: 300 });
		});

		const config: ReportConfigV2 = {
			version: 2,
			entityType: "invoices",
			metric: { op: "count" },
			groupBy: "status",
		};
		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config,
		});

		expect(result.data).toEqual([
			{ label: "Sent", value: 2, bucketKey: "sent", metadata: { totalValue: 500 } },
		]);
		expect(result.total).toBe(500);
		expect(result.metadata?.totalIsCurrency).toBe(true);
		expect(result.metadata?.itemValueIsCurrency).toBeUndefined();
	});
});
