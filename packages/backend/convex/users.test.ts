import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	addMemberToOrg,
} from "./test.helpers";

describe("Users", () => {
	let t: ReturnType<typeof convexTest>;

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

		it("should throw error for unauthenticated user", async () => {
			await expect(t.query(api.users.listByOrg, {})).rejects.toThrowError(
				"User not authenticated"
			);
		});
	});

	describe("ensureUserExists", () => {
		it("should return user ID if user exists", async () => {
			const { userId, clerkUserId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Existing User",
					email: "existing@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_existing",
				});
				return { userId, clerkUserId: "user_existing" };
			});

			// ensureUserExists is a query that can be called without auth
			const result = await t.query(api.users.ensureUserExists, {
				clerkUserId,
				name: "Existing User",
				email: "existing@example.com",
				imageUrl: "https://example.com/image.jpg",
			});

			expect(result).toBe(userId);
		});

		it("should return null if user does not exist", async () => {
			const result = await t.query(api.users.ensureUserExists, {
				clerkUserId: "nonexistent_user",
				name: "New User",
				email: "new@example.com",
				imageUrl: "https://example.com/image.jpg",
			});

			expect(result).toBeNull();
		});
	});

	describe("syncUserFromClerk", () => {
		it("should create a new user if they do not exist", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				return setup;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const newUserId = await asUser.mutation(api.users.syncUserFromClerk, {
				clerkUserId: "new_clerk_user",
				name: "New Synced User",
				email: "newsynced@example.com",
				imageUrl: "https://example.com/new.jpg",
			});

			expect(newUserId).toBeDefined();

			// Verify user was created
			const newUser = await t.run(async (ctx) => {
				return await ctx.db.get(newUserId);
			});

			expect(newUser).toMatchObject({
				name: "New Synced User",
				email: "newsynced@example.com",
				image: "https://example.com/new.jpg",
				externalId: "new_clerk_user",
			});

			// Verify membership was created
			const membership = await t.run(async (ctx) => {
				return await ctx.db
					.query("organizationMemberships")
					.filter((q) =>
						q.and(
							q.eq(q.field("orgId"), orgId),
							q.eq(q.field("userId"), newUserId)
						)
					)
					.first();
			});

			expect(membership).not.toBeNull();
		});

		it("should return existing user ID and ensure membership if user exists", async () => {
			const { clerkUserId, clerkOrgId, orgId } = await t.run(async (ctx) => {
				const setup = await createTestOrg(ctx);
				return setup;
			});

			// Create another user without membership to current org
			const { existingUserId, existingClerkUserId } = await t.run(
				async (ctx) => {
					const existingUserId = await ctx.db.insert("users", {
						name: "Existing External User",
						email: "external@example.com",
						image: "https://example.com/external.jpg",
						externalId: "existing_external_user",
					});
					return {
						existingUserId,
						existingClerkUserId: "existing_external_user",
					};
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const returnedUserId = await asUser.mutation(api.users.syncUserFromClerk, {
				clerkUserId: existingClerkUserId,
				name: "Existing External User",
				email: "external@example.com",
				imageUrl: "https://example.com/external.jpg",
			});

			expect(returnedUserId).toBe(existingUserId);

			// Verify membership was created for the existing user
			const membership = await t.run(async (ctx) => {
				return await ctx.db
					.query("organizationMemberships")
					.filter((q) =>
						q.and(
							q.eq(q.field("orgId"), orgId),
							q.eq(q.field("userId"), existingUserId)
						)
					)
					.first();
			});

			expect(membership).not.toBeNull();
		});
	});

	describe("Internal Mutations", () => {
		describe("upsertFromClerk", () => {
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
