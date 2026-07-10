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
import { REPORT_PRESETS, type ReportPresetDefinition } from "./lib/reportPresets";
import { toExecuteReportArgs, type GeneratedReport } from "./reportConfigGeneration";
import type { ReportFilters } from "./lib/reportFilters";

/**
 * Every preset in the curated library must actually run through
 * executeReport without throwing. Reuses the real toExecuteReportArgs
 * routing (grouped-count legacy-vs-generic dispatch, detail mode, measures)
 * rather than duplicating it — presets are converted into the same
 * GeneratedReport shape the assistant's generation pipeline produces, with
 * a thin filter-shape adapter since GeneratedReport's filter rules carry a
 * nullable `value`, while ReportFilters rules carry an optional one.
 */
function toGenFilters(filters: ReportFilters | null): GeneratedReport["filters"] {
	if (!filters) return null;
	return {
		logic: filters.logic,
		groups: filters.groups.map((group) => ({
			logic: group.logic,
			rules: group.rules.map((rule) => ({
				field: rule.field,
				operator: rule.operator,
				value: rule.value ?? null,
			})),
		})),
	};
}

function presetToGeneratedReport(preset: ReportPresetDefinition): GeneratedReport {
	return {
		entityType: preset.entityType,
		groupBy: preset.groupBy,
		measure: preset.measure,
		filters: toGenFilters(preset.filters),
		columns: preset.columns,
		startDate: null,
		endDate: null,
		visualization: preset.visualization,
		name: preset.name,
		description: preset.description,
	};
}

const TABLE_WORKLIST_PRESET_IDS = new Set(["overdue-invoices", "quotes-awaiting-response"]);

describe("REPORT_PRESETS", () => {
	it("has 14 presets with unique ids", () => {
		expect(REPORT_PRESETS).toHaveLength(14);
		expect(new Set(REPORT_PRESETS.map((p) => p.id)).size).toBe(14);
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
				const args = toExecuteReportArgs(presetToGeneratedReport(preset));
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
