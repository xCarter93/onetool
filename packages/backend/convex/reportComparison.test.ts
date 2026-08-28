import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createTestClient,
	createTestInvoice,
	createTestTask,
} from "./test.helpers";
import { api } from "./_generated/api";
import { resolveDayAnchors } from "./lib/reportDates";
import type { ReportConfigV2 } from "./lib/reportConfig";

/**
 * Comparison-range execution (PRD-reports-redesign R11): a second scan over the
 * earlier window merged into the current series.
 *
 * Every case here uses an absolute range so the windows are fixed regardless of
 * when the suite runs — the preset → previous-window calendar math is pinned in
 * lib/reportDates.test.ts.
 */

const MAR_2026 = {
	start: Date.UTC(2026, 2, 1),
	end: Date.UTC(2026, 2, 31, 23, 59, 59, 999),
};
const FEB_2026 = {
	start: Date.UTC(2026, 1, 1),
	end: Date.UTC(2026, 1, 28, 23, 59, 59, 999),
};

describe("executeReport comparison ranges", () => {
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

	/** Bucket key → (value, compareValue), the pairing this slice is about. */
	function pairs(data: { bucketKey?: string; value: number; compareValue?: number }[]) {
		return data.map((point) => ({
			bucketKey: point.bucketKey,
			value: point.value,
			compareValue: point.compareValue,
		}));
	}

	it("pairs month buckets by calendar slot across a gap in the current period", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			const at = async (issuedDate: number, count: number) => {
				for (let i = 0; i < count; i++) {
					await createTestInvoice(ctx, org.orgId, clientId, { issuedDate });
				}
			};
			// Current window: Jan, (no Feb), Mar, Apr 2026.
			await at(Date.UTC(2026, 0, 15), 1);
			await at(Date.UTC(2026, 2, 10), 2);
			await at(Date.UTC(2026, 3, 5), 3);
			// Comparison window (the 120 days before it): Sep–Dec 2025.
			await at(Date.UTC(2025, 8, 15), 1);
			await at(Date.UTC(2025, 9, 15), 2);
			await at(Date.UTC(2025, 10, 15), 3);
			await at(Date.UTC(2025, 11, 15), 4);
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "issuedDate_month",
				date: {
					field: "issuedDate",
					range: {
						kind: "absolute",
						start: Date.UTC(2026, 0, 1),
						end: Date.UTC(2026, 3, 30, 23, 59, 59, 999),
					},
					comparison: { kind: "previous_period" },
				},
			},
		});

		// Sep→Jan, Oct→Feb (no current bucket, dropped), Nov→Mar, Dec→Apr.
		// Index pairing would slide Oct onto Mar and Nov onto Apr.
		expect(pairs(result.data)).toEqual([
			{ bucketKey: "2026-01", value: 1, compareValue: 1 },
			{ bucketKey: "2026-03", value: 2, compareValue: 3 },
			{ bucketKey: "2026-04", value: 3, compareValue: 4 },
		]);
		expect(result.total).toBe(6);
		expect(result.metadata?.compareTotal).toBe(10);
		expect(result.metadata?.compareTruncated).toBe(false);
	});

	it("pairs previous_year month buckets with the same month a year earlier", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			for (let i = 0; i < 2; i++) {
				await createTestInvoice(ctx, org.orgId, clientId, {
					issuedDate: Date.UTC(2026, 2, 12),
				});
			}
			for (let i = 0; i < 5; i++) {
				await createTestInvoice(ctx, org.orgId, clientId, {
					issuedDate: Date.UTC(2025, 2, 12),
				});
			}
			// A year earlier but a different month — no pair.
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2025, 1, 12),
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "issuedDate_month",
				date: {
					field: "issuedDate",
					range: { kind: "absolute", ...MAR_2026 },
					comparison: { kind: "previous_year" },
				},
			},
		});

		expect(pairs(result.data)).toEqual([
			{ bucketKey: "2026-03", value: 2, compareValue: 5 },
		]);
		expect(result.metadata?.compareTotal).toBe(5);
	});

	it("pairs previous_year day buckets across a leap year and drops Feb 29", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			const at = async (issuedDate: number, count: number) => {
				for (let i = 0; i < count; i++) {
					await createTestInvoice(ctx, org.orgId, clientId, { issuedDate });
				}
			};
			await at(Date.UTC(2025, 1, 28), 1);
			await at(Date.UTC(2025, 2, 1), 1);
			await at(Date.UTC(2024, 1, 28), 3);
			await at(Date.UTC(2024, 1, 29), 5);
			await at(Date.UTC(2024, 2, 1), 2);
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "issuedDate_day",
				date: {
					field: "issuedDate",
					range: {
						kind: "absolute",
						start: Date.UTC(2025, 0, 1),
						end: Date.UTC(2025, 11, 31, 23, 59, 59, 999),
					},
					comparison: { kind: "previous_year" },
				},
			},
		});

		// A day-count offset (365 across this pair of windows) would slide every
		// bucket after the leap day by one; the leap day itself has no 2025 slot.
		expect(pairs(result.data)).toEqual([
			{ bucketKey: "2025-02-28", value: 1, compareValue: 3 },
			{ bucketKey: "2025-03-01", value: 1, compareValue: 2 },
		]);
		expect(result.metadata?.compareTotal).toBe(10);
	});

	it("resolves both windows and both keys on a non-UTC org calendar", async () => {
		const NZ = "Pacific/Auckland";
		const { org, asOrg } = await seedOrg(NZ);
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			// Mar 1 2026 09:00 NZDT — February in UTC, March on the org calendar.
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 1, 28, 20),
			});
			// Mar 1 2025 09:00 NZDT — the comparison window's first day.
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2025, 1, 28, 20),
			});
			// Feb 28 2026 18:00 NZDT — before the window starts on the org calendar.
			await createTestInvoice(ctx, org.orgId, clientId, {
				issuedDate: Date.UTC(2026, 1, 28, 5),
			});
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "issuedDate_month",
				date: {
					field: "issuedDate",
					range: {
						kind: "absolute",
						start: resolveDayAnchors("2026-03-01", NZ).start,
						end: resolveDayAnchors("2026-03-31", NZ).end,
					},
					comparison: { kind: "previous_year" },
				},
			},
		});

		expect(pairs(result.data)).toEqual([
			{ bucketKey: "2026-03", value: 1, compareValue: 1 },
		]);
		expect(result.total).toBe(1);
		expect(result.metadata?.compareTotal).toBe(1);
	});

	it("key-matches non-time buckets and drops comparison-only ones", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			const at = async (
				date: number,
				status: "pending" | "completed" | "cancelled",
				count: number
			) => {
				for (let i = 0; i < count; i++) {
					await createTestTask(ctx, org.orgId, { date, status });
				}
			};
			await at(Date.UTC(2026, 2, 5), "pending", 1);
			await at(Date.UTC(2026, 2, 6), "completed", 2);
			await at(Date.UTC(2026, 1, 5), "pending", 3);
			await at(Date.UTC(2026, 1, 6), "cancelled", 4);
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: {
				version: 2,
				entityType: "tasks",
				metric: { op: "count" },
				groupBy: "status",
				date: {
					field: "date",
					range: { kind: "absolute", ...MAR_2026 },
					comparison: { kind: "absolute", ...FEB_2026 },
				},
			},
		});

		expect(pairs(result.data)).toEqual([
			{ bucketKey: "pending", value: 1, compareValue: 3 },
			{ bucketKey: "completed", value: 2, compareValue: undefined },
		]);
		expect(result.data[1]).not.toHaveProperty("compareValue");
		expect(result.metadata?.compareTotal).toBe(7);
	});

	it("shifts an absolute comparison's buckets by the offset between the windows", async () => {
		const { org, asOrg } = await seedOrg();
		const clientId = await t.run((ctx) => createTestClient(ctx, org.orgId));
		await t.run(async (ctx) => {
			for (let i = 0; i < 2; i++) {
				await createTestInvoice(ctx, org.orgId, clientId, {
					issuedDate: Date.UTC(2026, 2, 12),
				});
			}
			for (let i = 0; i < 5; i++) {
				await createTestInvoice(ctx, org.orgId, clientId, {
					issuedDate: Date.UTC(2025, 0, 12),
				});
			}
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				metric: { op: "count" },
				groupBy: "issuedDate_month",
				date: {
					field: "issuedDate",
					range: { kind: "absolute", ...MAR_2026 },
					comparison: {
						kind: "absolute",
						start: Date.UTC(2025, 0, 1),
						end: Date.UTC(2025, 0, 31, 23, 59, 59, 999),
					},
				},
			},
		});

		expect(pairs(result.data)).toEqual([
			{ bucketKey: "2026-03", value: 2, compareValue: 5 },
		]);
	});

	it("shifts an absolute range's previous_period back by its exact span", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			// The 31-day span puts the comparison window at Jan 29 – Feb 28.
			await createTestTask(ctx, org.orgId, { date: Date.UTC(2026, 0, 28, 12) });
			await createTestTask(ctx, org.orgId, { date: Date.UTC(2026, 0, 29) });
			await createTestTask(ctx, org.orgId, {
				date: Date.UTC(2026, 1, 28, 23, 59, 59, 999),
			});
			await createTestTask(ctx, org.orgId, { date: Date.UTC(2026, 2, 10) });
			await createTestTask(ctx, org.orgId, { date: Date.UTC(2026, 2, 11) });
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: {
				version: 2,
				entityType: "tasks",
				metric: { op: "count" },
				date: {
					field: "date",
					range: { kind: "absolute", ...MAR_2026 },
					comparison: { kind: "previous_period" },
				},
			},
		});

		expect(result.total).toBe(2);
		expect(result.metadata?.compareTotal).toBe(2);
		// The ungrouped "Total" point has no bucket to pair with.
		expect(result.data).toEqual([{ label: "Total", value: 2 }]);
	});

	it("reports the comparison ratio as compareTotal for a ratio metric", async () => {
		const { org, asOrg } = await seedOrg();
		await t.run(async (ctx) => {
			const at = async (
				date: number,
				status: "pending" | "completed",
				count: number
			) => {
				for (let i = 0; i < count; i++) {
					await createTestTask(ctx, org.orgId, { date, status });
				}
			};
			await at(Date.UTC(2026, 2, 5), "completed", 3);
			await at(Date.UTC(2026, 2, 6), "pending", 1);
			await at(Date.UTC(2026, 1, 5), "completed", 1);
			await at(Date.UTC(2026, 1, 6), "pending", 3);
		});

		const result = await asOrg.query(api.reportData.executeReport, {
			entityType: "tasks",
			config: {
				version: 2,
				entityType: "tasks",
				metric: { op: "ratio", ratioKey: "completionRate" },
				date: {
					field: "date",
					range: { kind: "absolute", ...MAR_2026 },
					comparison: { kind: "absolute", ...FEB_2026 },
				},
			},
		});

		expect(result.total).toBe(75);
		expect(result.metadata?.compareTotal).toBe(25);
		expect(result.metadata?.compareTruncated).toBe(false);
		expect(result.data).toEqual([
			{ label: "Completed", value: 3 },
			{ label: "Pending", value: 1 },
		]);
	});

	describe("backstops (reachable only if the query-args gating was skipped)", () => {
		const comparedConfig = (extra: Partial<ReportConfigV2> = {}): ReportConfigV2 => ({
			version: 2,
			entityType: "tasks",
			metric: { op: "count" },
			groupBy: "status",
			date: {
				field: "date",
				range: { kind: "absolute", ...MAR_2026 },
				comparison: { kind: "previous_period" },
			},
			...extra,
		});

		it("rejects a comparison combined with segmentBy", async () => {
			const { asOrg } = await seedOrg();
			await expect(
				asOrg.query(api.reportData.executeReport, {
					entityType: "tasks",
					config: comparedConfig({ segmentBy: "type" }),
				})
			).rejects.toThrow(/segmentBy/);
		});

		it("rejects a comparison over an unbounded range", async () => {
			const { asOrg } = await seedOrg();
			await expect(
				asOrg.query(api.reportData.executeReport, {
					entityType: "tasks",
					config: comparedConfig({
						date: {
							field: "date",
							range: { kind: "preset", preset: "all_time" },
							comparison: { kind: "previous_period" },
						},
					}),
				})
			).rejects.toThrow(/both bounds/);
			await expect(
				asOrg.query(api.reportData.executeReport, {
					entityType: "tasks",
					config: comparedConfig({
						date: {
							field: "date",
							range: { kind: "absolute", start: MAR_2026.start },
							comparison: { kind: "previous_period" },
						},
					}),
				})
			).rejects.toThrow(/both bounds/);
		});

		it("ignores the comparison on a detail request instead of failing", async () => {
			const { org, asOrg } = await seedOrg();
			await t.run((ctx) =>
				createTestTask(ctx, org.orgId, { date: Date.UTC(2026, 2, 10) })
			);

			const result = await asOrg.query(api.reportData.executeReport, {
				entityType: "tasks",
				// segmentBy would throw in aggregation mode — drill-down must not.
				config: comparedConfig({ segmentBy: "type" }),
				detail: { columns: ["title", "status"] },
			});

			expect(result.detail?.rows).toHaveLength(1);
			expect(result.metadata?.compareTotal).toBeUndefined();
			expect(result.metadata?.compareTruncated).toBeUndefined();
		});
	});
});

describe("executeReport comparison scan ceiling", () => {
	let t: ReturnType<typeof setupConvexTest>;
	const CURRENT_T0 = Date.UTC(2026, 5, 1);

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 0, 1) });
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it(
		"flags compareTruncated on its own when only the comparison scan hits the ceiling",
		{ timeout: 120_000 },
		async () => {
			const org = await t.run((ctx) =>
				createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" })
			);
			const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));

			// REPORT_SCAN_CEILING + 1 rows created inside the comparison window.
			const TOTAL = 10_001;
			const BATCH = 500;
			let clock = Date.UTC(2026, 0, 1);
			for (let start = 0; start < TOTAL; start += BATCH) {
				const count = Math.min(BATCH, TOTAL - start);
				clock += 1000;
				vi.setSystemTime(clock);
				await t.run(async (ctx) => {
					for (let i = 0; i < count; i++) {
						await ctx.db.insert("tasks", {
							orgId: org.orgId,
							title: "T",
							date: clock,
							status: "pending",
							type: "internal",
						});
					}
				});
			}

			vi.setSystemTime(CURRENT_T0);
			await t.run(async (ctx) => {
				for (let i = 0; i < 3; i++) {
					await ctx.db.insert("tasks", {
						orgId: org.orgId,
						title: "T",
						date: CURRENT_T0,
						status: "pending",
						type: "internal",
					});
				}
			});

			const result = await asOrg.query(api.reportData.executeReport, {
				entityType: "tasks",
				config: {
					version: 2,
					entityType: "tasks",
					metric: { op: "count" },
					date: {
						// Bucketing on _creationTime lets the newest-first scan stop early
						// for the current window while the older one runs to the ceiling.
						field: "_creationTime",
						range: {
							kind: "absolute",
							start: CURRENT_T0,
							end: Date.UTC(2026, 5, 30, 23, 59, 59, 999),
						},
						comparison: {
							kind: "absolute",
							start: Date.UTC(2026, 0, 1),
							end: Date.UTC(2026, 0, 31, 23, 59, 59, 999),
						},
					},
				},
			});

			expect(result.total).toBe(3);
			expect(result.metadata?.truncated).toBe(false);
			expect(result.metadata?.compareTruncated).toBe(true);
			expect(result.metadata?.compareTotal).toBeLessThan(TOTAL);
		}
	);
});
