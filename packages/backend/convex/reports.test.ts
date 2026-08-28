import { beforeEach, describe, expect, it } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type {
	ReportConfigV2,
	ReportVisualization,
} from "./lib/reportConfig";

/**
 * `reports.by_creator` is keyed on the author alone. A user can belong to
 * several organizations, so an unfiltered read of that index surfaces reports
 * authored in one workspace while the caller is acting in another (SEC-2 class).
 */
describe("reports.getMyReports", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedReport(
		ctx: { db: MutationCtx["db"] },
		orgId: Id<"organizations">,
		createdBy: Id<"users">,
		name: string
	) {
		const now = Date.now();
		return await ctx.db.insert("reports", {
			orgId,
			createdBy,
			name,
			config: { version: 2, entityType: "clients", metric: { op: "count" } },
			visualization: { type: "table" },
			createdAt: now,
			updatedAt: now,
		});
	}

	it("returns only the reports authored in the caller's active org", async () => {
		const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const orgA = await createTestOrg(ctx, {
				orgName: "Org A",
				clerkUserId: "user_dual",
				clerkOrgId: "org_a",
			});

			// Same human, second org — the precondition for the cross-org read.
			const orgB = await createTestOrg(ctx, {
				orgName: "Org B",
				clerkUserId: "user_org_b_owner",
				clerkOrgId: "org_b",
			});
			await ctx.db.insert("organizationMemberships", {
				orgId: orgB.orgId,
				userId: orgA.userId,
				role: "admin",
			});

			await seedReport(ctx, orgA.orgId, orgA.userId, "Org A report");
			await seedReport(ctx, orgB.orgId, orgA.userId, "Org B report");

			return orgA;
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const reports = await asUser.query(api.reports.getMyReports, {});
		expect(reports.map((report) => report.name)).toEqual(["Org A report"]);
	});
});

/** The reports table stores v2 configs verbatim through the public API. */
describe("reports config v2 round-trip", () => {
	const v2Config: ReportConfigV2 = {
		version: 2,
		entityType: "invoices",
		date: {
			field: "paidAt",
			range: { kind: "preset", preset: "this_month" },
			comparison: { kind: "previous_period" },
		},
		filters: {
			logic: "and",
			groups: [
				{
					logic: "and",
					rules: [{ field: "status", operator: "equals", value: "paid" }],
				},
			],
		},
		metric: { op: "sum", field: "total" },
		groupBy: "paidAt_month",
		includeEmptyValues: true,
	};

	const visualization: ReportVisualization = {
		type: "column",
		options: { axisLabels: true, seriesLimit: 12 },
	};

	it("creates, reads back, and duplicates a v2 report unchanged", async () => {
		const t = setupConvexTest();
		const { clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => await createTestOrg(ctx, {})
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const id = await asUser.mutation(api.reports.create, {
			name: "Monthly revenue (v2)",
			config: v2Config,
			visualization,
		});

		const saved = await asUser.query(api.reports.get, { id });
		expect(saved?.config).toStrictEqual(v2Config);
		expect(saved?.visualization).toStrictEqual(visualization);

		const copyId = await asUser.mutation(api.reports.duplicate, { id });
		const copy = await asUser.query(api.reports.get, { id: copyId });
		expect(copy?.config).toStrictEqual(v2Config);
	});
});
