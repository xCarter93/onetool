import { beforeEach, describe, expect, it } from "vitest";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createTestClient,
	createTestProject,
	createTestTask,
	createTestQuote,
	createTestInvoice,
} from "./test.helpers";
import { api } from "./_generated/api";
import { REPORT_PRESETS } from "./lib/reportPresets";
import { resolveReportQueryArgs } from "./lib/reportQueryArgs";

/**
 * Every preset in the curated library must actually run through
 * executeReport without throwing. Presets are native v2 (config,
 * visualization) pairs, so they route through the same
 * resolveReportQueryArgs contract a saved report uses rather than a
 * test-local mapping.
 */

const TABLE_WORKLIST_PRESET_IDS = new Set(["overdue-invoices", "quotes-awaiting-response"]);

describe("REPORT_PRESETS", () => {
	it("has 16 presets with unique ids", () => {
		expect(REPORT_PRESETS).toHaveLength(16);
		expect(new Set(REPORT_PRESETS.map((p) => p.id)).size).toBe(16);
	});

	it("revenue-by-project resolves to a top-10 paid-revenue-by-project query", () => {
		const preset = REPORT_PRESETS.find((p) => p.id === "revenue-by-project");
		if (!preset) throw new Error("revenue-by-project preset is missing");

		expect(resolveReportQueryArgs(preset.config, preset.visualization)).toStrictEqual({
			entityType: "invoices",
			config: {
				version: 2,
				entityType: "invoices",
				filters: {
					logic: "and",
					groups: [
						{
							logic: "and",
							rules: [{ field: "status", operator: "equals", value: "paid" }],
						},
					],
				},
				date: { field: "paidAt", range: { kind: "preset", preset: "this_year" } },
				metric: { op: "sum", field: "total" },
				groupBy: "projectId",
			},
			seriesLimit: 10,
			sort: "value_desc",
		});
	});

	it("revenue-by-project and revenue-by-month share their revenue definition", () => {
		const byProject = REPORT_PRESETS.find((p) => p.id === "revenue-by-project");
		const byMonth = REPORT_PRESETS.find((p) => p.id === "revenue-by-month");
		if (!byProject || !byMonth) throw new Error("revenue presets are missing");

		expect(byProject.config.filters).toStrictEqual(byMonth.config.filters);
		expect(byProject.config.date).toStrictEqual(byMonth.config.date);
		expect(byProject.config.metric).toStrictEqual(byMonth.config.metric);
	});

	describe("round-trip through the real executeReport", () => {
		let t: ReturnType<typeof setupConvexTest>;

		beforeEach(() => {
			t = setupConvexTest();
		});

		it("every preset executes without throwing and returns the expected result shape", async () => {
			const org = await t.run(async (ctx) => await createTestOrg(ctx));
			const asOrg = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));

			const clientId = await t.run((ctx) =>
				createTestClient(ctx, org.orgId, { status: "active", leadSource: "website" })
			);
			await t.run(async (ctx) => {
				const completedProjectId = await createTestProject(ctx, org.orgId, clientId, {
					status: "completed",
				});
				await ctx.db.patch(completedProjectId, { completedAt: Date.now() });
				await createTestProject(ctx, org.orgId, clientId, { status: "planned" });

				await createTestTask(ctx, org.orgId, {
					status: "completed",
					assigneeUserId: org.userId,
				});
				await createTestTask(ctx, org.orgId, { status: "pending" });

				await createTestQuote(ctx, org.orgId, clientId, { status: "sent", total: 500 });
				await createTestQuote(ctx, org.orgId, clientId, { status: "approved", total: 900 });

				await createTestInvoice(ctx, org.orgId, clientId, {
					status: "paid",
					total: 1200,
					issuedDate: Date.now(),
					dueDate: Date.now(),
					paidAt: Date.now(),
				});
				await createTestInvoice(ctx, org.orgId, clientId, {
					status: "overdue",
					total: 300,
					issuedDate: Date.now(),
					dueDate: Date.now(),
				});
				await createTestInvoice(ctx, org.orgId, clientId, {
					status: "sent",
					total: 400,
					issuedDate: Date.now(),
					dueDate: Date.now(),
				});

				await ctx.db.insert("activities", {
					orgId: org.orgId,
					userId: org.userId,
					activityType: "client_created",
					entityType: "client",
					entityId: "fake-id",
					entityName: "Fake Entity",
					description: "test activity",
					timestamp: Date.now(),
					isVisible: true,
				});
			});

			for (const preset of REPORT_PRESETS) {
				const args = resolveReportQueryArgs(preset.config, preset.visualization);
				const result = await asOrg.query(api.reportData.executeReport, args);

				if (TABLE_WORKLIST_PRESET_IDS.has(preset.id)) {
					expect(result.detail, `${preset.id} should return detail rows`).toBeDefined();
				} else {
					expect(
						Array.isArray(result.data),
						`${preset.id} should return a data array`
					).toBe(true);
				}
			}
		});
	});
});
