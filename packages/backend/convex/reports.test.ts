import { beforeEach, describe, expect, it } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
			config: { entityType: "clients" },
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
