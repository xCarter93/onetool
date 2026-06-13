import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";

describe("Organizations", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("get", () => {
		it("should return the current user's organization", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
					email: "org@example.com",
					website: "https://example.com",
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { userId, orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization).toMatchObject({
				_id: orgId,
				clerkOrganizationId: "org_123",
				name: "Test Org",
				email: "org@example.com",
				website: "https://example.com",
			});
		});

		it("should return null for unauthenticated user", async () => {
			const organization = await t.query(api.organizations.get, {});
			expect(organization).toBeNull();
		});

		it("should return null when user has no active organization", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				// No activeOrgId
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization).toBeNull();
		});
	});

	describe("needsMetadataCompletion", () => {
		it("should return true when metadata is incomplete and user is owner", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
					isMetadataComplete: false,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const needsCompletion = await asUser.query(
				api.organizations.needsMetadataCompletion,
				{}
			);
			expect(needsCompletion).toBe(true);
		});

		it("should return false when metadata is complete", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
					isMetadataComplete: true,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const needsCompletion = await asUser.query(
				api.organizations.needsMetadataCompletion,
				{}
			);
			expect(needsCompletion).toBe(false);
		});

		it("should return false when user is not the owner", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member@example.com",
					image: "https://example.com/member.jpg",
					externalId: "user_member",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
					isMetadataComplete: false,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			});

			const asMember = t.withIdentity({
				subject: "user_member",
				activeOrgId: "org_123",
			});

			const needsCompletion = await asMember.query(
				api.organizations.needsMetadataCompletion,
				{}
			);
			expect(needsCompletion).toBe(false);
		});
	});

	describe("update", () => {
		it("should update organization fields when user is owner", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Original Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.organizations.update, {
				name: "Updated Org",
				email: "updated@example.com",
				website: "https://updated.com",
				phone: "555-1234",
				address: "123 Main St",
				companySize: "1-10",
				monthlyRevenueTarget: 10000,
				timezone: "America/New_York",
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization).toMatchObject({
				_id: orgId,
				name: "Updated Org",
				email: "updated@example.com",
				website: "https://updated.com",
				phone: "555-1234",
				address: "123 Main St",
				companySize: "1-10",
				monthlyRevenueTarget: 10000,
				timezone: "America/New_York",
			});
		});

		it("should throw error when non-owner tries to update", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member@example.com",
					image: "https://example.com/member.jpg",
					externalId: "user_member",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			});

			const asMember = t.withIdentity({
				subject: "user_member",
				activeOrgId: "org_123",
			});

			await expect(
				asMember.mutation(api.organizations.update, {
					name: "Hacked Name",
				})
			).rejects.toThrowError(
				"Only organization owner can update organization details"
			);
		});

		it("should throw error when no updates provided", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.organizations.update, {})
			).rejects.toThrowError("No valid updates provided");
		});
	});

	describe("completeMetadata", () => {
		it("should complete organization metadata when user is owner", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
					isMetadataComplete: false,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.organizations.completeMetadata, {
				email: "org@example.com",
				website: "https://example.com",
				companySize: "10-100",
				monthlyRevenueTarget: 50000,
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization).toMatchObject({
				_id: orgId,
				email: "org@example.com",
				website: "https://example.com",
				companySize: "10-100",
				monthlyRevenueTarget: 50000,
				isMetadataComplete: true,
			});
		});

		it("should throw error when non-owner tries to complete metadata", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member@example.com",
					image: "https://example.com/member.jpg",
					externalId: "user_member",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
					isMetadataComplete: false,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			});

			const asMember = t.withIdentity({
				subject: "user_member",
				activeOrgId: "org_123",
			});

			await expect(
				asMember.mutation(api.organizations.completeMetadata, {
					email: "hacked@example.com",
				})
			).rejects.toThrowError("Only organization owner can complete metadata");
		});
	});

	describe("getMembers", () => {
		it("should return all organization members", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const member1Id = await ctx.db.insert("users", {
					name: "Member 1",
					email: "member1@example.com",
					image: "https://example.com/member1.jpg",
					externalId: "user_member1",
				});

				const member2Id = await ctx.db.insert("users", {
					name: "Member 2",
					email: "member2@example.com",
					image: "https://example.com/member2.jpg",
					externalId: "user_member2",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: ownerId,
					role: "admin",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: member1Id,
					role: "member",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: member2Id,
					role: "member",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_owner",
				activeOrgId: "org_123",
			});

			const members = await asUser.query(api.organizations.getMembers, {});
			expect(members).toHaveLength(3);
			expect(members.map((m) => m.name).sort()).toEqual([
				"Member 1",
				"Member 2",
				"Owner",
			]);
		});

		it("should return empty array for unauthenticated user", async () => {
			const members = await t.query(api.organizations.getMembers, {});
			expect(members).toEqual([]);
		});
	});

	describe("removeMember", () => {
		it("should remove a member from organization when owner", async () => {
			const { memberId, orgId } = await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member@example.com",
					image: "https://example.com/member.jpg",
					externalId: "user_member",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: ownerId,
					role: "admin",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});

				return { memberId, orgId };
			});

			const asOwner = t.withIdentity({
				subject: "user_owner",
				activeOrgId: "org_123",
			});

			await asOwner.mutation(api.organizations.removeMember, {
				userId: memberId,
			});

			const members = await asOwner.query(api.organizations.getMembers, {});
			expect(members).toHaveLength(1);
			expect(members[0].name).toBe("Owner");
		});

		it("should throw error when non-owner tries to remove member", async () => {
			const { memberId } = await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const member1Id = await ctx.db.insert("users", {
					name: "Member 1",
					email: "member1@example.com",
					image: "https://example.com/member1.jpg",
					externalId: "user_member1",
				});

				const member2Id = await ctx.db.insert("users", {
					name: "Member 2",
					email: "member2@example.com",
					image: "https://example.com/member2.jpg",
					externalId: "user_member2",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: member1Id,
					role: "member",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: member2Id,
					role: "member",
				});

				return { memberId: member2Id };
			});

			const asMember = t.withIdentity({
				subject: "user_member1",
				activeOrgId: "org_123",
			});

			await expect(
				asMember.mutation(api.organizations.removeMember, {
					userId: memberId,
				})
			).rejects.toThrowError("Only organization owner can remove members");
		});

		it("should throw error when trying to remove owner", async () => {
			const { ownerId } = await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: ownerId,
					role: "admin",
				});

				return { ownerId };
			});

			const asOwner = t.withIdentity({
				subject: "user_owner",
				activeOrgId: "org_123",
			});

			await expect(
				asOwner.mutation(api.organizations.removeMember, {
					userId: ownerId,
				})
			).rejects.toThrowError("Organization owner cannot be removed");
		});
	});

	// Plan 14.2-02 — Connect cross-tenant lockdown.
	// The OLD public `setStripeConnectAccountId` mutation was DELETED.
	// It is replaced by two new public functions whose handlers derive
	// orgId and clerkUserId from the Clerk session (not client args):
	//   - getOrgForCallerInternal (query) — returns ConnectContext
	//   - setStripeConnectAccountIdInternal (mutation) — patches w/ M-2 dup guard
	describe("getOrgForCallerInternal (Plan 14.2-02)", () => {
		it("returns the locked-down ConnectContext for the owner caller", async () => {
			const { orgId, userId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Owner User",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_caller_ctx",
					name: "Caller Ctx Org",
					ownerUserId: userId,
					email: "billing@example.com",
					addressCountry: "US",
					stripeConnectAccountId: "acct_existing",
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId, userId };
			});

			const asUser = t.withIdentity({
				subject: "user_owner",
				activeOrgId: "org_caller_ctx",
			});

			const ctx = await asUser.query(
				api.organizations.getOrgForCallerInternal,
				{}
			);

			expect(ctx).toMatchObject({
				userId,
				orgId,
				stripeConnectAccountId: "acct_existing",
				organization: {
					_id: orgId,
					name: "Caller Ctx Org",
					email: "billing@example.com",
					addressCountry: "US",
					stripeConnectAccountId: "acct_existing",
					ownerUserId: userId,
				},
			});
		});

		it("returns stripeConnectAccountId: null when org has no Stripe account yet", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner2@example.com",
					image: "https://example.com/owner2.jpg",
					externalId: "user_no_stripe",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_no_stripe",
					name: "No Stripe Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_no_stripe",
				activeOrgId: "org_no_stripe",
			});

			const ctx = await asUser.query(
				api.organizations.getOrgForCallerInternal,
				{}
			);
			expect(ctx.stripeConnectAccountId).toBeNull();
		});

		it("throws ORG_NOT_FOUND when caller is authenticated but has no org row", async () => {
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					name: "Orphan User",
					email: "orphan@example.com",
					image: "https://example.com/orphan.jpg",
					externalId: "user_orphan",
				});
				// No org, no membership.
			});

			const asUser = t.withIdentity({
				subject: "user_orphan",
				// No activeOrgId — getCurrentUserOrgId surfaces "No active organization"
			});

			await expect(
				asUser.query(api.organizations.getOrgForCallerInternal, {})
			).rejects.toThrowError(/ORG_NOT_FOUND|No active organization/);
		});

		it("throws NOT_ORG_OWNER when caller is a member but not the owner (M-5 — member-aware path)", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner_m5",
				});

				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member@example.com",
					image: "https://example.com/member.jpg",
					externalId: "user_member_m5",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_m5",
					name: "M-5 Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: ownerId,
					role: "admin",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			});

			const asMember = t.withIdentity({
				subject: "user_member_m5",
				activeOrgId: "org_m5",
			});

			await expect(
				asMember.query(api.organizations.getOrgForCallerInternal, {})
			).rejects.toThrowError("NOT_ORG_OWNER");
		});
	});

	describe("setStripeConnectAccountIdInternal (Plan 14.2-02)", () => {
		it("patches stripeConnectAccountId for the owner caller", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_set_owner",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_set",
					name: "Set Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_set_owner",
				activeOrgId: "org_set",
			});

			await asUser.mutation(
				api.organizations.setStripeConnectAccountIdInternal,
				{ accountId: "acct_new" }
			);

			const org = await t.run((ctx) => ctx.db.get(orgId));
			expect(org?.stripeConnectAccountId).toBe("acct_new");
		});

		it("throws DUPLICATE_CONNECT_ACCOUNT when accountId already maps to a different org (FINDINGS M-2)", async () => {
			await t.run(async (ctx) => {
				// Org A — caller
				const userAId = await ctx.db.insert("users", {
					name: "Owner A",
					email: "owner-a@example.com",
					image: "https://example.com/a.jpg",
					externalId: "user_a",
				});
				const orgAId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_a",
					name: "Org A",
					ownerUserId: userAId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId: orgAId,
					userId: userAId,
					role: "admin",
				});

				// Org B — pre-occupant of acct_X
				const userBId = await ctx.db.insert("users", {
					name: "Owner B",
					email: "owner-b@example.com",
					image: "https://example.com/b.jpg",
					externalId: "user_b",
				});
				await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_b",
					name: "Org B",
					ownerUserId: userBId,
					stripeConnectAccountId: "acct_X",
				});
			});

			const asUserA = t.withIdentity({
				subject: "user_a",
				activeOrgId: "org_a",
			});

			await expect(
				asUserA.mutation(
					api.organizations.setStripeConnectAccountIdInternal,
					{ accountId: "acct_X" }
				)
			).rejects.toThrowError(/DUPLICATE_CONNECT_ACCOUNT/);
		});

		it("allows re-setting the same accountId on the SAME org (idempotent)", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/o.jpg",
					externalId: "user_idemp",
				});
				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_idemp",
					name: "Idempotent Org",
					ownerUserId: userId,
					stripeConnectAccountId: "acct_self",
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_idemp",
				activeOrgId: "org_idemp",
			});

			await asUser.mutation(
				api.organizations.setStripeConnectAccountIdInternal,
				{ accountId: "acct_self" }
			);

			const org = await t.run((ctx) => ctx.db.get(orgId));
			expect(org?.stripeConnectAccountId).toBe("acct_self");
		});

		it("throws when non-owner member tries to set the Stripe account", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner-non@example.com",
					image: "https://example.com/o.jpg",
					externalId: "user_owner_set",
				});
				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member-non@example.com",
					image: "https://example.com/m.jpg",
					externalId: "user_member_set",
				});
				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_non_owner",
					name: "Non-Owner Org",
					ownerUserId: ownerId,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			});

			const asMember = t.withIdentity({
				subject: "user_member_set",
				activeOrgId: "org_non_owner",
			});

			await expect(
				asMember.mutation(
					api.organizations.setStripeConnectAccountIdInternal,
					{ accountId: "acct_hacked" }
				)
			).rejects.toThrowError("NOT_ORG_OWNER");
			});
		});

		describe("clearStripeConnectStateInternal", () => {
			it("rejects unauthenticated callers and leaves Connect state intact", async () => {
				const { orgId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner",
						email: "owner-clear@example.com",
						image: "https://example.com/clear.jpg",
						externalId: "user_clear_owner",
					});
					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_clear",
						name: "Clear Org",
						ownerUserId: userId,
						stripeConnectAccountId: "acct_clear",
						stripeChargesEnabled: true,
					});
					await ctx.db.insert("organizationMemberships", {
						orgId,
						userId,
						role: "admin",
					});
					return { orgId };
				});

				await expect(
					t.mutation(api.organizations.clearStripeConnectStateInternal, {
						orgId,
					})
				).rejects.toThrowError("UNAUTHORIZED");

				const org = await t.run((ctx) => ctx.db.get(orgId));
				expect(org?.stripeConnectAccountId).toBe("acct_clear");
				expect(org?.stripeChargesEnabled).toBe(true);
			});

			it("clears Connect state for the authenticated owner org", async () => {
				const { orgId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner",
						email: "owner-clear-ok@example.com",
						image: "https://example.com/clear-ok.jpg",
						externalId: "user_clear_ok",
					});
					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_clear_ok",
						name: "Clear Ok Org",
						ownerUserId: userId,
						stripeConnectAccountId: "acct_clear_ok",
						stripeChargesEnabled: true,
						stripePayoutsEnabled: true,
					});
					await ctx.db.insert("organizationMemberships", {
						orgId,
						userId,
						role: "admin",
					});
					return { orgId };
				});

				const asOwner = t.withIdentity({
					subject: "user_clear_ok",
					activeOrgId: "org_clear_ok",
				});

				await asOwner.mutation(
					api.organizations.clearStripeConnectStateInternal,
					{ orgId }
				);

				const org = await t.run((ctx) => ctx.db.get(orgId));
				expect(org?.stripeConnectAccountId).toBeUndefined();
				expect(org?.stripeChargesEnabled).toBeUndefined();
				expect(org?.stripePayoutsEnabled).toBeUndefined();
			});
		});

		describe("setStripeConnectAccountId (public, REMOVED in Plan 14.2-02)", () => {
			it("public mutation is no longer callable — convex-test rejects the path", async () => {
				// Source-of-truth proof lives in the file itself; the grep gate in
				// Plan 14.2-02 acceptance ensures `^export const setStripeConnectAccountId =`
				// returns zero matches. At runtime we verify convex-test refuses to
				// route to the missing export (api.organizations is a Proxy whose
				// property-access cannot reliably be asserted with toBeUndefined()
				// because pretty-format reentry hits the Proxy traps).
				const asUser = t.withIdentity({
					subject: "user_check",
					activeOrgId: "org_check",
				});
				await expect(
					// @ts-expect-error — deliberately invoking a removed export
					asUser.mutation(api.organizations.setStripeConnectAccountId, {
						accountId: "acct_anything",
					})
				).rejects.toThrowError(
					/setStripeConnectAccountId|no such export|not.*function/i
				);
			});
		});

	describe("deleteOrganization", () => {
		it("should delete organization when owner provides correct confirmation", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Fake timers BEFORE the mutation so the scheduled runAfter(0) cascade
			// worker is captured and drained (not fired against a closed txn).
			vi.useFakeTimers();
			const result = await asUser.mutation(
				api.organizations.deleteOrganization,
				{
					confirmationText: "Test Org",
				}
			);

			expect(result).toEqual({ success: true });

			await t.finishAllScheduledFunctions(vi.runAllTimers);
			vi.useRealTimers();

			// Verify organization is deleted
			const org = await t.run(async (ctx) => {
				return await ctx.db.get(orgId);
			});
			expect(org).toBeNull();
		});

		it("should throw error when confirmation text does not match", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await expect(
				asUser.mutation(api.organizations.deleteOrganization, {
					confirmationText: "Wrong Name",
				})
			).rejects.toThrowError(
				"Confirmation text must match organization name exactly"
			);
		});

		it("should throw error when non-owner tries to delete", async () => {
			await t.run(async (ctx) => {
				const ownerId = await ctx.db.insert("users", {
					name: "Owner",
					email: "owner@example.com",
					image: "https://example.com/owner.jpg",
					externalId: "user_owner",
				});

				const memberId = await ctx.db.insert("users", {
					name: "Member",
					email: "member@example.com",
					image: "https://example.com/member.jpg",
					externalId: "user_member",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: ownerId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			});

			const asMember = t.withIdentity({
				subject: "user_member",
				activeOrgId: "org_123",
			});

			await expect(
				asMember.mutation(api.organizations.deleteOrganization, {
					confirmationText: "Test Org",
				})
			).rejects.toThrowError(
				"Only organization owner can delete organization"
			);
		});
	});

	describe("Organization Isolation", () => {
		it("should not return data from other organizations", async () => {
			const { org1Id, org2Id } = await t.run(async (ctx) => {
				const user1Id = await ctx.db.insert("users", {
					name: "User 1",
					email: "user1@example.com",
					image: "https://example.com/user1.jpg",
					externalId: "user_1",
				});

				const user2Id = await ctx.db.insert("users", {
					name: "User 2",
					email: "user2@example.com",
					image: "https://example.com/user2.jpg",
					externalId: "user_2",
				});

				const org1Id = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_1",
					name: "Org 1",
					ownerUserId: user1Id,
					email: "org1@example.com",
				});

				const org2Id = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_2",
					name: "Org 2",
					ownerUserId: user2Id,
					email: "org2@example.com",
				});

				await ctx.db.insert("organizationMemberships", {
					orgId: org1Id,
					userId: user1Id,
					role: "admin",
				});

				await ctx.db.insert("organizationMemberships", {
					orgId: org2Id,
					userId: user2Id,
					role: "admin",
				});

				return { org1Id, org2Id };
			});

			const asUser1 = t.withIdentity({
				subject: "user_1",
				activeOrgId: "org_1",
			});

			const asUser2 = t.withIdentity({
				subject: "user_2",
				activeOrgId: "org_2",
			});

			// User 1 should see Org 1 data
			const org1 = await asUser1.query(api.organizations.get, {});
			expect(org1).toMatchObject({
				_id: org1Id,
				name: "Org 1",
				email: "org1@example.com",
			});

			// User 2 should see Org 2 data
			const org2 = await asUser2.query(api.organizations.get, {});
			expect(org2).toMatchObject({
				_id: org2Id,
				name: "Org 2",
				email: "org2@example.com",
			});

			// User 1's getMembers should not include User 2
			const members1 = await asUser1.query(api.organizations.getMembers, {});
			expect(members1.map((m) => m.name)).not.toContain("User 2");

			// User 2's getMembers should not include User 1
			const members2 = await asUser2.query(api.organizations.getMembers, {});
			expect(members2.map((m) => m.name)).not.toContain("User 1");
		});
	});

	describe("Internal Mutations", () => {
		describe("createFromClerk", () => {
			it("should create organization from Clerk webhook data", async () => {
				const { userId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner User",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "user_clerk_123",
					});

					return { userId };
				});

				const orgId = await t.mutation(internal.organizations.createFromClerk, {
					clerkOrganizationId: "org_clerk_123",
					name: "New Org from Clerk",
					ownerClerkUserId: "user_clerk_123",
					logoUrl: "https://example.com/logo.png",
				});

				expect(orgId).toBeDefined();

				// Verify organization was created correctly
				const org = await t.run(async (ctx) => {
					return await ctx.db.get(orgId);
				});

				expect(org).toMatchObject({
					clerkOrganizationId: "org_clerk_123",
					name: "New Org from Clerk",
					logoUrl: "https://example.com/logo.png",
					isMetadataComplete: false,
				});
				expect(org?.receivingAddress).toMatch(
					/^org-[a-f0-9]+@inbound\.onetool\.biz$/
				);
				expect(org?.usageTracking).toMatchObject({
					clientsCount: 0,
					esignaturesSentThisMonth: 0,
				});
			});

			it("should return existing org ID if organization already exists", async () => {
				const { existingOrgId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner User",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "user_clerk_123",
					});

					const existingOrgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_clerk_existing",
						name: "Existing Org",
						ownerUserId: userId,
					});

					return { existingOrgId };
				});

				const orgId = await t.mutation(internal.organizations.createFromClerk, {
					clerkOrganizationId: "org_clerk_existing",
					name: "New Name",
					ownerClerkUserId: "user_clerk_123",
				});

				expect(orgId).toBe(existingOrgId);
			});

			it("should throw error when owner user not found", async () => {
				await expect(
					t.mutation(internal.organizations.createFromClerk, {
						clerkOrganizationId: "org_new",
						name: "New Org",
						ownerClerkUserId: "nonexistent_user",
					})
				).rejects.toThrowError("Owner user not found: nonexistent_user");
			});
		});

		describe("updateFromClerk", () => {
			it("should update organization from Clerk webhook data", async () => {
				const { orgId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner User",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "user_123",
					});

					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_clerk_update",
						name: "Original Name",
						ownerUserId: userId,
					});

					return { orgId };
				});

				await t.mutation(internal.organizations.updateFromClerk, {
					clerkOrganizationId: "org_clerk_update",
					name: "Updated Name from Clerk",
					logoUrl: "https://example.com/new-logo.png",
				});

				const org = await t.run(async (ctx) => {
					return await ctx.db.get(orgId);
				});

				expect(org).toMatchObject({
					name: "Updated Name from Clerk",
					logoUrl: "https://example.com/new-logo.png",
				});
			});

			it("should not throw when organization not found", async () => {
				// This should just log and return without throwing
				await t.mutation(internal.organizations.updateFromClerk, {
					clerkOrganizationId: "nonexistent_org",
					name: "New Name",
				});

				// Test passes if no error is thrown
			});
		});

		describe("deleteFromClerk", () => {
			it("should delete organization and memberships from Clerk webhook", async () => {
				const { orgId, membershipId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner User",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "user_123",
					});

					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_clerk_delete",
						name: "Org to Delete",
						ownerUserId: userId,
					});

					const membershipId = await ctx.db.insert("organizationMemberships", {
						orgId,
						userId,
						role: "admin",
					});

					return { orgId, membershipId };
				});

				// Fake timers BEFORE the mutation so the scheduled runAfter(0)
				// cascade worker is captured and drained (not fired post-txn).
				vi.useFakeTimers();
				const result = await t.mutation(internal.organizations.deleteFromClerk, {
					clerkOrganizationId: "org_clerk_delete",
				});

				expect(result).toEqual({ success: true });

				await t.finishAllScheduledFunctions(vi.runAllTimers);
				vi.useRealTimers();

				// Verify organization is deleted
				const org = await t.run(async (ctx) => {
					return await ctx.db.get(orgId);
				});
				expect(org).toBeNull();

				// Verify membership is deleted
				const membership = await t.run(async (ctx) => {
					return await ctx.db.get(membershipId);
				});
				expect(membership).toBeNull();
			});

			it("should handle deletion of non-existent organization gracefully", async () => {
				// This should not throw, just return null when org not found
				const result = await t.mutation(internal.organizations.deleteFromClerk, {
					clerkOrganizationId: "nonexistent_org",
				});

				expect(result).toBeNull();
			});
		});
	});

	describe("Structured Address Fields", () => {
		it("should update organization with structured address fields", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.organizations.update, {
				addressStreet: "1600 Pennsylvania Avenue NW",
				addressCity: "Washington",
				addressState: "DC",
				addressZip: "20500",
				addressCountry: "United States",
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization).toMatchObject({
				addressStreet: "1600 Pennsylvania Avenue NW",
				addressCity: "Washington",
				addressState: "DC",
				addressZip: "20500",
				addressCountry: "United States",
			});
		});

		it("should compute legacy address from structured fields for backward compatibility", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.organizations.update, {
				addressStreet: "123 Main Street",
				addressCity: "San Francisco",
				addressState: "CA",
				addressZip: "94102",
			});

			const organization = await asUser.query(api.organizations.get, {});
			// Legacy address should be computed from structured fields
			expect(organization?.address).toBe(
				"123 Main Street, San Francisco, CA, 94102"
			);
		});

		it("should store geocoding coordinates via update", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.organizations.update, {
				addressStreet: "1600 Pennsylvania Avenue NW",
				addressCity: "Washington",
				addressState: "DC",
				addressZip: "20500",
				latitude: 38.8977,
				longitude: -77.0365,
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization?.latitude).toBe(38.8977);
			expect(organization?.longitude).toBe(-77.0365);
		});
	});

	describe("completeMetadata with Structured Address", () => {
		it("should accept structured address fields during onboarding", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
					isMetadataComplete: false,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.organizations.completeMetadata, {
				email: "org@example.com",
				addressStreet: "500 Terry Francine Street",
				addressCity: "San Francisco",
				addressState: "CA",
				addressZip: "94158",
				addressCountry: "United States",
				latitude: 37.7749,
				longitude: -122.4194,
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization).toMatchObject({
				email: "org@example.com",
				addressStreet: "500 Terry Francine Street",
				addressCity: "San Francisco",
				addressState: "CA",
				addressZip: "94158",
				addressCountry: "United States",
				latitude: 37.7749,
				longitude: -122.4194,
				isMetadataComplete: true,
			});
		});

		it("should preserve backward compatibility with legacy address field", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "Test Org",
					ownerUserId: userId,
					isMetadataComplete: false,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId,
					role: "admin",
				});

				return { orgId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Use legacy address field instead of structured fields
			await asUser.mutation(api.organizations.completeMetadata, {
				email: "org@example.com",
				address: "123 Legacy Street, Old Town, CA 90210",
			});

			const organization = await asUser.query(api.organizations.get, {});
			expect(organization?.address).toBe(
				"123 Legacy Street, Old Town, CA 90210"
			);
			expect(organization?.isMetadataComplete).toBe(true);
		});
	});
});
