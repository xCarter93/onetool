import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";

describe("Favorites", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("list", () => {
		// Regression test for: brand-new user lands on /organization/complete
		// (which mounts the workspace sidebar's NavFavorites). Before the fix,
		// favorites.list called getCurrentUserOrgId(ctx) which threw
		// "No active organization found in user session" because the user
		// has no Clerk activeOrgId yet. This logged a failed Convex query
		// for every new signup. After the fix, the query returns [].
		//
		// Note: unauthenticated callers are blocked by Clerk middleware upstream
		// and are not a supported state for this query. We deliberately do not
		// test that case — masking it would hide a routing regression.
		it("should return empty array when authenticated user has no active organization", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					name: "Brand New User",
					email: "newbie@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_no_org",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_no_org",
				// No activeOrgId — simulates a fresh Clerk signup before the
				// user has created or joined an organization.
			});

			const favorites = await asUser.query(api.favorites.list, {});
			expect(favorites).toEqual([]);
		});

		it("should return empty array when user has org but no favorites", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const favorites = await asUser.query(api.favorites.list, {});
			expect(favorites).toEqual([]);
		});

		it("should return favorited clients for the authenticated user in the active org", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				const clientA = await createTestClient(ctx, setup.orgId, {
					companyName: "Client A",
					status: "active",
				});
				const clientB = await createTestClient(ctx, setup.orgId, {
					companyName: "Client B",
					status: "active",
				});

				// Insert favorites with deterministic createdAt ordering.
				// B is more recent, so it should sort first.
				await ctx.db.insert("userFavorites", {
					userId: setup.userId,
					orgId: setup.orgId,
					clientId: clientA,
					createdAt: 1_000,
				});
				await ctx.db.insert("userFavorites", {
					userId: setup.userId,
					orgId: setup.orgId,
					clientId: clientB,
					createdAt: 2_000,
				});

				return setup;
			});

			const asUser = t.withIdentity(
				createTestIdentity(clerkUserId, clerkOrgId)
			);

			const favorites = await asUser.query(api.favorites.list, {});
			expect(favorites).toHaveLength(2);
			// Most recent first
			expect(favorites[0].companyName).toBe("Client B");
			expect(favorites[1].companyName).toBe("Client A");
			// Sanity check on returned shape
			expect(favorites[0]).toMatchObject({
				clientId: expect.anything(),
				companyName: "Client B",
				status: "active",
				createdAt: 2_000,
			});
		});

		it("should not return favorites belonging to a different user in the same org", async () => {
			const { clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);

				// Other user with a favorite in the org.
				const otherUserId = await ctx.db.insert("users", {
					name: "Other User",
					email: "other@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_other",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: setup.orgId,
					userId: otherUserId,
					role: "member",
				});
				const client = await createTestClient(ctx, setup.orgId, {
					companyName: "Shared Client",
					status: "active",
				});
				await ctx.db.insert("userFavorites", {
					userId: otherUserId,
					orgId: setup.orgId,
					clientId: client,
					createdAt: Date.now(),
				});

				// "Current" user with a membership in the same org but no favorites.
				const currentUserId = await ctx.db.insert("users", {
					name: "Current User",
					email: "current@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_current_no_favs",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: setup.orgId,
					userId: currentUserId,
					role: "member",
				});

				return setup;
			});

			const asCurrentUser = t.withIdentity(
				createTestIdentity("user_current_no_favs", clerkOrgId)
			);

			const favorites = await asCurrentUser.query(api.favorites.list, {});
			expect(favorites).toEqual([]);
		});
	});
});
