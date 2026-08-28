import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api } from "./_generated/api";
import { GOLDEN_T0, seedCanonicalOrg } from "./test.reportGoldenSeed";
import { REPORT_PRESETS } from "./lib/reportPresets";
import { resolveReportQueryArgs } from "./lib/reportQueryArgs";
import { DEFAULT_DETAIL_COLUMNS, type ReportEntityType } from "./lib/reportFields";
import presetArgsGolden from "./__goldens__/report-preset-args.json";
import detailModeGolden from "./__goldens__/report-detail-mode.json";

/**
 * R0 characterization goldens (PRD-reports-redesign §6). Since R4c retired the
 * legacy dispatch, the legacy-output fixture (report-legacy-dispatch.json) is
 * owned by reportDualRun.test.ts, which holds the unified pipeline to it; this
 * file keeps the preset→args mapping pin (now config-shaped — the fixture was
 * deliberately hand-rewritten at R4c when the contract began emitting v2
 * configs), the detail-mode fixtures, and the scan-ceiling pin.
 *
 * Preset args carry no resolved dates: the fixture pins the config→args
 * mapping; relative date windows resolve server-side from the stored preset.
 * Fixtures are hand-checked JSON in __goldens__/ compared with
 * toStrictEqual after a JSON round-trip (so key presence matters, undefined
 * doesn't hide drift). There is deliberately NO regeneration flag: to
 * regenerate one, temporarily log the actual JSON, review the diff by hand,
 * and commit — blessing drift must stay a deliberate act.
 */

function roundTrip(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Detail rows gained a non-deterministic `id` and a `refs` map of FK ids
 * (drill-down parent links), which no fixture can pin: assert the id's shape,
 * then strip both before comparing.
 */
function stripRowIds(result: unknown): unknown {
	const value = roundTrip(result) as { detail?: { rows: Record<string, unknown>[] } };
	for (const row of value.detail?.rows ?? []) {
		expect(typeof row.id).toBe("string");
		delete row.id;
		delete row.refs;
	}
	return value;
}

describe("preset → executeReport args goldens", () => {
	it("all 15 presets map to their pinned args", () => {
		const actual = Object.fromEntries(
			REPORT_PRESETS.map((preset) => [
				preset.id,
				roundTrip(resolveReportQueryArgs(preset.config, preset.visualization)),
			])
		);
		expect(actual).toStrictEqual(presetArgsGolden);
	});
});

describe("executeReport output goldens", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let clock: number;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"], now: GOLDEN_T0 });
		clock = GOLDEN_T0;
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function tick() {
		clock += 1000;
		vi.setSystemTime(clock);
	}

	it("detail mode with default columns matches its fixture per entity", async () => {
		const { asOrg } = await seedCanonicalOrg(t);
		const golden = detailModeGolden as Record<string, unknown>;

		const entities = Object.keys(DEFAULT_DETAIL_COLUMNS) as ReportEntityType[];
		expect(Object.keys(golden).sort()).toStrictEqual([...entities].sort());

		for (const entityType of entities) {
			const result = await asOrg.query(api.reportData.executeReport, {
				entityType,
				detail: { columns: DEFAULT_DETAIL_COLUMNS[entityType] },
			});
			expect(stripRowIds(result), entityType).toStrictEqual(golden[entityType]);
		}
	});

	it(
		"scan ceiling: metadata.truncated flips once an org exceeds 10,000 rows",
		{ timeout: 120_000 },
		async () => {
			const org = await t.run((ctx) =>
				createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
			);
			const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));

			// REPORT_SCAN_CEILING + 1 minimal rows, batched to keep transactions sane.
			const TOTAL = 10_001;
			const BATCH = 500;
			for (let start = 0; start < TOTAL; start += BATCH) {
				const count = Math.min(BATCH, TOTAL - start);
				tick();
				await t.run(async (ctx) => {
					for (let i = 0; i < count; i++) {
						await ctx.db.insert("tasks", {
							orgId: org.orgId,
							title: "T",
							date: Date.UTC(2026, 4, 1, 15),
							status: "pending",
							type: "internal",
						});
					}
				});
			}

			const result = await asOrg.query(api.reportData.executeReport, {
				entityType: "tasks",
				aggregation: { op: "count" },
			});

			expect(result.metadata?.truncated).toBe(true);
			expect(result.total).toBe(10_000);
		}
	);
});
