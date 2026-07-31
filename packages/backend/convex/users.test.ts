import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * Stands in for the Clerk Backend API. Keyed `${clerkOrgId}:${clerkUserId}`;
 * anything absent is "not a member of that organization", which is the case
 * SEC-10 turns on.
 */
const { clerkMembers } = vi.hoisted(() => ({
	clerkMembers: new Map<
		string,
		{ name: string; email: string; imageUrl: string }
	>(),
}));
vi.mock("@clerk/backend", () => ({
	createClerkClient: () => ({
		organizations: {
			getOrganizationMembershipList: async ({
				organizationId,
				userId,
			}: {
				organizationId: string;
				userId: string[];
			}) => {
				const profile = clerkMembers.get(`${organizationId}:${userId[0]}`);
				if (!profile) return { data: [], totalCount: 0 };
				return {
					data: [
						{
							publicUserData: {
								userId: userId[0],
								firstName: profile.name.split(" ")[0],
								lastName: profile.name.split(" ").slice(1).join(" "),
								identifier: profile.email,
								imageUrl: profile.imageUrl,
							},
						},
					],
					totalCount: 1,
				};
			},
		},
	}),
}));
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	addMemberToOrg,
} from "./test.helpers";

describe("Users", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("current", () => {
		it("should return the current authenticated user", async () => {
			const { userId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx, {
					userName: "Current User",
					userEmail: "current@example.com",
				});
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const currentUser = await asUser.query(api.users.current, {});
			expect(currentUser).toMatchObject({
				_id: userId,
				name: "Current User",
				email: "current@example.com",
				externalId: clerkUserId,
			});
		});

		it("should return null for unauthenticated user", async () => {
			const currentUser = await t.query(api.users.current, {});
			expect(currentUser).toBeNull();
		});

		it("should return null when user does not exist in database", async () => {
			const asNonexistentUser = t.withIdentity({
				subject: "nonexistent_user",
				activeOrgId: "org_123",
			});

			const currentUser = await asNonexistentUser.query(api.users.current, {});
			expect(currentUser).toBeNull();
		});
	});

	describe("listByOrg", () => {
		it("should return all users in the organization", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx, {
					userName: "Admin User",
					userEmail: "admin@example.com",
				});

				await addMemberToOrg(ctx, setup.orgId, {
					userName: "Member 1",
					userEmail: "member1@example.com",
				});

				await addMemberToOrg(ctx, setup.orgId, {
					userName: "Member 2",
					userEmail: "member2@example.com",
				});

				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const users = await asUser.query(api.users.listByOrg, {});
			expect(users).toHaveLength(3);
			expect(users.map((u) => u.name).sort()).toEqual([
				"Admin User",
				"Member 1",
				"Member 2",
			]);
		});

		it("should return empty array when user has no organization", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					name: "Lone User",
					email: "lone@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_lone",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_lone",
				// No activeOrgId
			});

			const users = await asUser.query(api.users.listByOrg, {});
			expect(users).toEqual([]);
		});

		it("should return empty list for unauthenticated user", async () => {
			const users = await t.query(api.users.listByOrg, {});
			expect(users).toEqual([]);
		});
	});

	// SEC-11: `users.get` must not be a deployment-wide directory lookup.
	describe("get", () => {
		it("returns a user who shares the caller's organization", async () => {
			const { clerkUserId, clerkOrgId, memberUserId } = await t.run(
				async (ctx) => {
					const setup = await createTestOrg(ctx, {
						userName: "Admin User",
						userEmail: "admin@example.com",
					});
					const member = await addMemberToOrg(ctx, setup.orgId, {
						userName: "Teammate",
						userEmail: "teammate@example.com",
					});
					return { ...setup, memberUserId: member.userId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const user = await asUser.query(api.users.get, { id: memberUserId });
			expect(user).toMatchObject({
				_id: memberUserId,
				name: "Teammate",
				email: "teammate@example.com",
			});
		});

		it("returns null for a user in another organization", async () => {
			const { clerkUserId, clerkOrgId, outsiderId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx, {
					userName: "Org A Admin",
					userEmail: "a@example.com",
					clerkUserId: "user_org_a",
					clerkOrgId: "org_a",
				});
				const other = await createTestOrg(ctx, {
					userName: "Org B Admin",
					userEmail: "b@example.com",
					clerkUserId: "user_org_b",
					clerkOrgId: "org_b",
				});
				return { ...setup, outsiderId: other.userId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			expect(await asUser.query(api.users.get, { id: outsiderId })).toBeNull();
		});

		it("returns null for an unauthenticated caller", async () => {
			const userId = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx, {
					userName: "Admin User",
					userEmail: "admin@example.com",
				});
				return setup.userId;
			});

			expect(await t.query(api.users.get, { id: userId })).toBeNull();
		});
	});

	// SEC-10: this was a plain userMutation taking clerkUserId/name/email as raw
	// strings that were never checked against Clerk. It bound any Clerk id the
	// caller named into their own org, and its insert branch pre-planted a users
	// row with an attacker-chosen externalId — the sole identity join key — that
	// the victim's real user.created webhook would later patch rather than
	// replace. It is now an action that verifies membership against Clerk and
	// takes the stored profile from Clerk's response, not the caller's args.
	describe("syncUserFromClerk", () => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		beforeEach(() => {
			clerkMembers.clear();
			vi.stubEnv("CLERK_SECRET_KEY", "sk_test_stub");
		});

		it("creates the user and membership for a verified Clerk org member", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);
			clerkMembers.set(`${clerkOrgId}:invited_member`, {
				name: "Invited Member",
				email: "invited@example.com",
				imageUrl: "https://example.com/invited.jpg",
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const newUserId = await asUser.action(api.users.syncUserFromClerk, {
				clerkUserId: "invited_member",
			});
			expect(newUserId).not.toBeNull();

			const { newUser, membership } = await t.run(async (ctx) => {
				const newUser = await ctx.db.get(newUserId!);
				const membership = await ctx.db
					.query("organizationMemberships")
					.withIndex("by_org_user", (q) =>
						q.eq("orgId", orgId).eq("userId", newUserId!)
					)
					.unique();
				return { newUser, membership };
			});

			// Profile comes from Clerk, not from the caller.
			expect(newUser).toMatchObject({
				name: "Invited Member",
				email: "invited@example.com",
				externalId: "invited_member",
			});
			expect(membership).not.toBeNull();
		});

		it("refuses a Clerk user who is not a member of the caller's org", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);

			// A real user in some other org. Nothing is registered for clerkOrgId.
			const victimUserId = await t.run(async (ctx) => {
				return await ctx.db.insert("users", {
					name: "Victim",
					email: "victim@example.com",
					image: "https://example.com/v.jpg",
					externalId: "victim_clerk_id",
				});
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = await asUser.action(api.users.syncUserFromClerk, {
				clerkUserId: "victim_clerk_id",
			});

			expect(result).toBeNull();

			// The victim must not have been bound into the caller's org.
			const membership = await t.run(async (ctx) => {
				return await ctx.db
					.query("organizationMemberships")
					.withIndex("by_org_user", (q) =>
						q.eq("orgId", orgId).eq("userId", victimUserId)
					)
					.unique();
			});
			expect(membership).toBeNull();
		});

		it("does not pre-plant a users row for an unverified Clerk id", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			expect(
				await asUser.action(api.users.syncUserFromClerk, {
					clerkUserId: "not_yet_signed_up",
				})
			).toBeNull();

			const planted = await t.run(async (ctx) => {
				return await ctx.db
					.query("users")
					.withIndex("by_external_id", (q) =>
						q.eq("externalId", "not_yet_signed_up")
					)
					.unique();
			});
			expect(planted).toBeNull();
		});

		it("binds an existing verified member without duplicating their user row", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await t.run(
				async (ctx) => await createTestOrg(ctx)
			);
			const existingUserId = await t.run(async (ctx) => {
				return await ctx.db.insert("users", {
					name: "Already Signed Up",
					email: "already@example.com",
					image: "https://example.com/a.jpg",
					externalId: "already_signed_up",
				});
			});
			clerkMembers.set(`${clerkOrgId}:already_signed_up`, {
				name: "Already Signed Up",
				email: "already@example.com",
				imageUrl: "https://example.com/a.jpg",
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const returned = await asUser.action(api.users.syncUserFromClerk, {
				clerkUserId: "already_signed_up",
			});
			expect(returned).toBe(existingUserId);

			const membership = await t.run(async (ctx) => {
				return await ctx.db
					.query("organizationMemberships")
					.withIndex("by_org_user", (q) =>
						q.eq("orgId", orgId).eq("userId", existingUserId)
					)
					.unique();
			});
			expect(membership).not.toBeNull();
		});

		it("returns null for a caller with no active organization", async () => {
			await t.run(async (ctx) => {
				return await ctx.db.insert("users", {
					name: "Orgless",
					email: "orgless@example.com",
					image: "https://example.com/o.jpg",
					externalId: "user_orgless",
				});
			});

			const asUser = t.withIdentity({ subject: "user_orgless" });

			expect(
				await asUser.action(api.users.syncUserFromClerk, {
					clerkUserId: "anyone",
				})
			).toBeNull();
		});
	});

	describe("Internal Mutations", () => {
		describe("upsertFromClerk", () => {
			it("mirrors the premium override, and clears it on the null-shaped revoke (B0)", async () => {
				// The admin console revokes by writing the key back as null rather than
				// deleting it. If that didn't clear the doc mirror, a revoked user would
				// keep premium in every identity-less context (the automation cron).
				await t.mutation(internal.users.upsertFromClerk, {
					data: {
						id: "clerk_user_override",
						first_name: "Over",
						last_name: "Ride",
						email_addresses: [{ email_address: "over@example.com" }],
						image_url: "https://example.com/o.jpg",
						public_metadata: { has_premium_feature_access: true },
					} as any,
				});

				const readUser = async () =>
					await t.run(async (ctx) =>
						ctx.db
							.query("users")
							.filter((q) => q.eq(q.field("externalId"), "clerk_user_override"))
							.first()
					);

				expect((await readUser())?.hasPremiumFeatureAccess).toBe(true);

				await t.mutation(internal.users.upsertFromClerk, {
					data: {
						id: "clerk_user_override",
						first_name: "Over",
						last_name: "Ride",
						email_addresses: [{ email_address: "over@example.com" }],
						image_url: "https://example.com/o.jpg",
						public_metadata: { has_premium_feature_access: null },
					} as any,
				});

				expect((await readUser())?.hasPremiumFeatureAccess).toBe(false);
			});

			it("should create a new user from Clerk webhook data", async () => {
				await t.mutation(internal.users.upsertFromClerk, {
					data: {
						id: "clerk_user_new",
						first_name: "John",
						last_name: "Doe",
						email_addresses: [{ email_address: "john.doe@example.com" }],
						image_url: "https://example.com/johndoe.jpg",
					} as any,
				});

				const user = await t.run(async (ctx) => {
					return await ctx.db
						.query("users")
						.filter((q) => q.eq(q.field("externalId"), "clerk_user_new"))
						.first();
				});

				expect(user).toMatchObject({
					name: "John Doe",
					email: "john.doe@example.com",
					image: "https://example.com/johndoe.jpg",
					externalId: "clerk_user_new",
				});
				expect(user?.lastSignedInDate).toBeDefined();
			});

			it("should update an existing user from Clerk webhook data", async () => {
				const { userId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Old Name",
						email: "old@example.com",
						image: "https://example.com/old.jpg",
						externalId: "clerk_user_update",
					});
					return { userId };
				});

				await t.mutation(internal.users.upsertFromClerk, {
					data: {
						id: "clerk_user_update",
						first_name: "New",
						last_name: "Name",
						email_addresses: [{ email_address: "new@example.com" }],
						image_url: "https://example.com/new.jpg",
					} as any,
				});

				const user = await t.run(async (ctx) => {
					return await ctx.db.get(userId);
				});

				expect(user).toMatchObject({
					name: "New Name",
					email: "new@example.com",
					image: "https://example.com/new.jpg",
					externalId: "clerk_user_update",
				});
			});

			it("should handle missing name fields gracefully", async () => {
				await t.mutation(internal.users.upsertFromClerk, {
					data: {
						id: "clerk_user_noname",
						first_name: null,
						last_name: null,
						email_addresses: [{ email_address: "noname@example.com" }],
						image_url: "",
					} as any,
				});

				const user = await t.run(async (ctx) => {
					return await ctx.db
						.query("users")
						.filter((q) =>
							q.eq(q.field("externalId"), "clerk_user_noname")
						)
						.first();
				});

				expect(user).toMatchObject({
					name: "",
					email: "noname@example.com",
					image: "",
				});
			});
		});

		describe("deleteFromClerk", () => {
			it("should delete a user by Clerk ID", async () => {
				const { userId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "User to Delete",
						email: "delete@example.com",
						image: "https://example.com/delete.jpg",
						externalId: "clerk_user_delete",
					});
					return { userId };
				});

				await t.mutation(internal.users.deleteFromClerk, {
					clerkUserId: "clerk_user_delete",
				});

				const user = await t.run(async (ctx) => {
					return await ctx.db.get(userId);
				});

				expect(user).toBeNull();
			});

			it("should handle deletion of non-existent user gracefully", async () => {
				// This should not throw, just log a warning
				await t.mutation(internal.users.deleteFromClerk, {
					clerkUserId: "nonexistent_clerk_user",
				});

				// Test passes if no error is thrown
			});
		});

		describe("updateLastSignedInDate", () => {
			it("should update the last signed in date for a user", async () => {
				const { userId, originalDate } = await t.run(async (ctx) => {
					const originalDate = Date.now() - 100000;
					const userId = await ctx.db.insert("users", {
						name: "Sign In User",
						email: "signin@example.com",
						image: "https://example.com/signin.jpg",
						externalId: "clerk_user_signin",
						lastSignedInDate: originalDate,
					});
					return { userId, originalDate };
				});

				await t.mutation(internal.users.updateLastSignedInDate, {
					clerkUserId: "clerk_user_signin",
				});

				const user = await t.run(async (ctx) => {
					return await ctx.db.get(userId);
				});

				expect(user?.lastSignedInDate).toBeGreaterThan(originalDate);
			});

			it("should handle update for non-existent user gracefully", async () => {
				// This should not throw, just log a warning
				await t.mutation(internal.users.updateLastSignedInDate, {
					clerkUserId: "nonexistent_signin_user",
				});

				// Test passes if no error is thrown
			});
		});

		describe("updateUserOrganization", () => {
			it("should add user to organization membership", async () => {
				const { userId, orgId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "New Member",
						email: "newmember@example.com",
						image: "https://example.com/member.jpg",
						externalId: "clerk_new_member",
					});

					const ownerUserId = await ctx.db.insert("users", {
						name: "Owner",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "clerk_owner",
					});

					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_for_member",
						name: "Test Org",
						ownerUserId: ownerUserId,
					});

					return { userId, orgId };
				});

				await t.mutation(internal.users.updateUserOrganization, {
					clerkUserId: "clerk_new_member",
					clerkOrganizationId: "org_for_member",
					role: "member",
				});

				const membership = await t.run(async (ctx) => {
					return await ctx.db
						.query("organizationMemberships")
						.filter((q) =>
							q.and(
								q.eq(q.field("orgId"), orgId),
								q.eq(q.field("userId"), userId)
							)
						)
						.first();
				});

				expect(membership).not.toBeNull();
				expect(membership?.role).toBe("member");
			});

			it("should handle non-existent user gracefully", async () => {
				await t.run(async (ctx) => {
					const ownerUserId = await ctx.db.insert("users", {
						name: "Owner",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "clerk_owner",
					});

					await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_exists",
						name: "Test Org",
						ownerUserId: ownerUserId,
					});
				});

				// This should not throw
				await t.mutation(internal.users.updateUserOrganization, {
					clerkUserId: "nonexistent_user",
					clerkOrganizationId: "org_exists",
				});
			});

			it("should handle non-existent organization gracefully", async () => {
				await t.run(async (ctx) => {
					await ctx.db.insert("users", {
						name: "User",
						email: "user@example.com",
						image: "https://example.com/user.jpg",
						externalId: "clerk_user_no_org",
					});
				});

				// This should not throw
				await t.mutation(internal.users.updateUserOrganization, {
					clerkUserId: "clerk_user_no_org",
					clerkOrganizationId: "nonexistent_org",
				});
			});
		});

		describe("removeUserFromOrganization", () => {
			it("should remove user from organization membership", async () => {
				const { userId, orgId, membershipId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Member to Remove",
						email: "remove@example.com",
						image: "https://example.com/remove.jpg",
						externalId: "clerk_remove_member",
					});

					const ownerUserId = await ctx.db.insert("users", {
						name: "Owner",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "clerk_owner",
					});

					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_remove_from",
						name: "Test Org",
						ownerUserId: ownerUserId,
					});

					const membershipId = await ctx.db.insert("organizationMemberships", {
						orgId,
						userId,
						role: "member",
					});

					return { userId, orgId, membershipId };
				});

				await t.mutation(internal.users.removeUserFromOrganization, {
					clerkUserId: "clerk_remove_member",
					clerkOrganizationId: "org_remove_from",
				});

				const membership = await t.run(async (ctx) => {
					return await ctx.db.get(membershipId);
				});

				expect(membership).toBeNull();
			});

			it("should handle removal of non-existent user gracefully", async () => {
				await t.run(async (ctx) => {
					const ownerUserId = await ctx.db.insert("users", {
						name: "Owner",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "clerk_owner",
					});

					await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_exists_remove",
						name: "Test Org",
						ownerUserId: ownerUserId,
					});
				});

				// This should not throw
				await t.mutation(internal.users.removeUserFromOrganization, {
					clerkUserId: "nonexistent_remove_user",
					clerkOrganizationId: "org_exists_remove",
				});
			});
		});
	});

	describe("Organization Isolation", () => {
		it("should not return users from other organizations", async () => {
			const { org1ClerkUserId, org1ClerkOrgId, org2ClerkUserId, org2ClerkOrgId } =
				await t.run(async (ctx) => {
					const org1Setup = await createTestOrg(ctx, {
						userName: "Org 1 User",
						userEmail: "org1@example.com",
						orgName: "Org 1",
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
					});

					await addMemberToOrg(ctx, org1Setup.orgId, {
						userName: "Org 1 Member",
						userEmail: "org1member@example.com",
					});

					const org2Setup = await createTestOrg(ctx, {
						userName: "Org 2 User",
						userEmail: "org2@example.com",
						orgName: "Org 2",
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
					});

					await addMemberToOrg(ctx, org2Setup.orgId, {
						userName: "Org 2 Member",
						userEmail: "org2member@example.com",
					});

					return {
						org1ClerkUserId: org1Setup.clerkUserId,
						org1ClerkOrgId: org1Setup.clerkOrgId,
						org2ClerkUserId: org2Setup.clerkUserId,
						org2ClerkOrgId: org2Setup.clerkOrgId,
					};
				});

			const asOrg1User = t.withIdentity(
				createTestIdentity(org1ClerkUserId, org1ClerkOrgId)
			);
			const asOrg2User = t.withIdentity(
				createTestIdentity(org2ClerkUserId, org2ClerkOrgId)
			);

			const org1Users = await asOrg1User.query(api.users.listByOrg, {});
			const org2Users = await asOrg2User.query(api.users.listByOrg, {});

			// Org 1 should only see their users
			expect(org1Users).toHaveLength(2);
			expect(org1Users.map((u) => u.name).sort()).toEqual([
				"Org 1 Member",
				"Org 1 User",
			]);

			// Org 2 should only see their users
			expect(org2Users).toHaveLength(2);
			expect(org2Users.map((u) => u.name).sort()).toEqual([
				"Org 2 Member",
				"Org 2 User",
			]);

			// Neither org should see the other's users
			expect(org1Users.map((u) => u.name)).not.toContain("Org 2 User");
			expect(org1Users.map((u) => u.name)).not.toContain("Org 2 Member");
			expect(org2Users.map((u) => u.name)).not.toContain("Org 1 User");
			expect(org2Users.map((u) => u.name)).not.toContain("Org 1 Member");
		});
	});
});
