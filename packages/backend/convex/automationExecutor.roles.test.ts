import { describe, it, expect } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import { __testUtils } from "./automationExecutor";

describe("resolveMemberUserIds admin-role normalization", () => {
	it("resolves admins stored as 'org:admin' or bare 'admin', excludes members", async () => {
		const t = setupConvexTest();
		const { orgId, userId: ownerId } = await t.run((ctx) => createTestOrg(ctx));

		const { legacyAdminId, memberId } = await t.run(async (ctx) => {
			// Promote the seeded owner membership to Clerk's verbatim "org:admin".
			const memberships = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.collect();
			await ctx.db.patch(memberships[0]._id, { role: "org:admin" });

			// A legacy row stored as bare "admin" must still resolve as admin.
			const legacyAdmin = await ctx.db.insert("users", {
				name: "Legacy Admin",
				email: "legacy-admin@example.com",
				image: "https://example.com/a.jpg",
				externalId: "user_legacy_admin",
			});
			await ctx.db.insert("organizationMemberships", {
				orgId,
				userId: legacyAdmin,
				role: "admin",
			});

			// A regular member stored as Clerk's "org:member".
			const member = await ctx.db.insert("users", {
				name: "Member",
				email: "member@example.com",
				image: "https://example.com/m.jpg",
				externalId: "user_member",
			});
			await ctx.db.insert("organizationMemberships", {
				orgId,
				userId: member,
				role: "org:member",
			});

			return { legacyAdminId: legacyAdmin, memberId: member };
		});

		const adminIds = await t.run((ctx) =>
			__testUtils.resolveMemberUserIds(ctx, orgId, true)
		);
		expect([...adminIds].sort()).toEqual([ownerId, legacyAdminId].sort());
		expect(adminIds).not.toContain(memberId);

		const allIds = await t.run((ctx) =>
			__testUtils.resolveMemberUserIds(ctx, orgId, false)
		);
		expect([...allIds].sort()).toEqual([ownerId, legacyAdminId, memberId].sort());
	});
});
