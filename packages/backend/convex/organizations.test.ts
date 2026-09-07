import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestIdentity, createTestOrg } from "./test.helpers";

/** Clerk backend stub: records the seat-cap writes syncSeatCap performs, so
 * the scheduled action is observable without the network. */
const seatWrites: Array<{
	organizationId: string;
	maxAllowedMemberships: number;
}> = [];
vi.mock("@clerk/backend", () => ({
	createClerkClient: () => ({
		organizations: {
			updateOrganization: async (
				organizationId: string,
				params: { maxAllowedMemberships: number }
			) => {
				seatWrites.push({ organizationId, ...params });
				return {};
			},
		},
	}),
}));

describe("Organizations", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		// createFromClerk and every billing write schedule seatSync +
		// reclassifyAutomationsForOrg. Under real timers those fire after the
		// test transaction closes and surface as "Write outside of transaction"
		// unhandled rejections that fail the run with every test green.
		vi.useFakeTimers();
		seatWrites.length = 0;
		t = setupConvexTest();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
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

	// Stripe Connect bindings and readiness are provider results committed by
	// stripeConnectActions; nothing here may be callable from a browser client.
	describe("Stripe Connect writers are server-only", () => {
		it("no public mutation lets an owner bind an account or assert readiness (audit repro)", async () => {
			const org = await t.run((ctx) => createTestOrg(ctx));
			const owner = t.withIdentity(
				createTestIdentity(org.clerkUserId, org.clerkOrgId)
			);
			await expect(
				owner.mutation(
					// @ts-expect-error — removed public export
					api.organizations.setStripeConnectAccountIdInternal,
					{ accountId: "acct_not_verified_with_stripe" }
				)
			).rejects.toThrow();
			await expect(
				owner.mutation(
					// @ts-expect-error — removed public export
					api.organizations.syncStripeConnectStatusFromLive,
					{ chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true }
				)
			).rejects.toThrow();
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBeUndefined();
			expect(saved?.stripeChargesEnabled).toBeUndefined();
		});

		it("every Stripe Connect writer is registered as an internal function", async () => {
			const mod = await import("./organizations");
			for (const name of [
				"bindStripeConnectAccountInternal",
				"syncStripeConnectStatusInternal",
				"clearStripeConnectStateInternal",
				"updateStripeConnectStatusInternal",
				"updateStripeCapabilityInternal",
			] as const) {
				expect((mod[name] as { isInternal?: boolean }).isInternal, name).toBe(
					true
				);
			}
		});
	});

	describe("bindStripeConnectAccountInternal", () => {
		it("binds the account to the given org", async () => {
			const org = await t.run((ctx) => createTestOrg(ctx));
			await t.mutation(internal.organizations.bindStripeConnectAccountInternal, {
				orgId: org.orgId,
				accountId: "acct_new",
			});
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBe("acct_new");
		});

		it("throws DUPLICATE_CONNECT_ACCOUNT when the account already maps to another org", async () => {
			const orgA = await t.run((ctx) =>
				createTestOrg(ctx, { clerkUserId: "user_a", clerkOrgId: "org_a" })
			);
			const orgB = await t.run((ctx) =>
				createTestOrg(ctx, { clerkUserId: "user_b", clerkOrgId: "org_b" })
			);
			await t.run((ctx) =>
				ctx.db.patch(orgB.orgId, { stripeConnectAccountId: "acct_X" })
			);
			await expect(
				t.mutation(internal.organizations.bindStripeConnectAccountInternal, {
					orgId: orgA.orgId,
					accountId: "acct_X",
				})
			).rejects.toThrowError(/DUPLICATE_CONNECT_ACCOUNT/);
			const saved = await t.run((ctx) => ctx.db.get(orgA.orgId));
			expect(saved?.stripeConnectAccountId).toBeUndefined();
		});

		it("re-binding the same account to the same org is idempotent", async () => {
			const org = await t.run((ctx) => createTestOrg(ctx));
			await t.run((ctx) =>
				ctx.db.patch(org.orgId, { stripeConnectAccountId: "acct_self" })
			);
			await t.mutation(internal.organizations.bindStripeConnectAccountInternal, {
				orgId: org.orgId,
				accountId: "acct_self",
			});
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBe("acct_self");
		});
	});

	describe("clearStripeConnectStateInternal", () => {
		it("clears cached readiness but keeps the account id", async () => {
			const org = await t.run((ctx) => createTestOrg(ctx));
			await t.run((ctx) =>
				ctx.db.patch(org.orgId, {
					stripeConnectAccountId: "acct_clear",
					stripeChargesEnabled: true,
					stripePayoutsEnabled: true,
					stripeExternalAccountLast4: "4242",
				})
			);
			await t.mutation(internal.organizations.clearStripeConnectStateInternal, {
				orgId: org.orgId,
			});
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripeConnectAccountId).toBe("acct_clear");
			expect(saved?.stripeChargesEnabled).toBeUndefined();
			expect(saved?.stripePayoutsEnabled).toBeUndefined();
			expect(saved?.stripeExternalAccountLast4).toBeUndefined();
		});
	});

	describe("payout readiness comes from payouts, not transfers", () => {
		it("a v1 `transfers` capability event does not touch stripePayoutsEnabled", async () => {
			const org = await t.run((ctx) => createTestOrg(ctx));
			await t.run((ctx) =>
				ctx.db.patch(org.orgId, {
					stripeConnectAccountId: "acct_cap",
					stripePayoutsEnabled: true,
				})
			);
			await t.mutation(internal.organizations.updateStripeCapabilityInternal, {
				orgId: org.orgId,
				capabilityId: "transfers",
				status: "inactive",
				requirementsCurrentlyDue: ["external_account"],
				requirementsDisabledReason: "requirements.past_due",
			});
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripePayoutsEnabled).toBe(true);
			const notifications = await t.run((ctx) =>
				ctx.db.query("notifications").collect()
			);
			expect(notifications).toHaveLength(0);
		});

		it("account.updated payouts_enabled true -> false notifies capability_degraded", async () => {
			const org = await t.run((ctx) => createTestOrg(ctx));
			await t.run((ctx) =>
				ctx.db.patch(org.orgId, {
					stripeConnectAccountId: "acct_pay",
					stripeChargesEnabled: true,
					stripePayoutsEnabled: true,
				})
			);
			await t.mutation(internal.organizations.updateStripeConnectStatusInternal, {
				orgId: org.orgId,
				chargesEnabled: true,
				payoutsEnabled: false,
				detailsSubmitted: true,
				requirementsCurrentlyDue: ["external_account"],
				requirementsDisabledReason: "requirements.past_due",
			});
			const saved = await t.run((ctx) => ctx.db.get(org.orgId));
			expect(saved?.stripePayoutsEnabled).toBe(false);
			const notifications = await t.run((ctx) =>
				ctx.db.query("notifications").collect()
			);
			expect(notifications).toHaveLength(1);
			expect(notifications[0]?.notificationType).toBe("capability_degraded");
			expect(notifications[0]?.message).toMatch(/payouts/i);
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

			it("syncs the premium override on, then back off when revoked (B0)", async () => {
				// The doc mirror is what identity-less contexts (the scheduled-automation
				// cron) read, so a revoke that failed to propagate would leave an org
				// premium forever.
				const { orgId } = await t.run(async (ctx) => {
					const userId = await ctx.db.insert("users", {
						name: "Owner User",
						email: "owner@example.com",
						image: "https://example.com/owner.jpg",
						externalId: "user_override",
					});
					const orgId = await ctx.db.insert("organizations", {
						clerkOrganizationId: "org_override",
						name: "Override Org",
						ownerUserId: userId,
					});
					return { orgId };
				});

				await t.mutation(internal.organizations.updateFromClerk, {
					clerkOrganizationId: "org_override",
					name: "Override Org",
					hasPremiumFeatureAccess: true,
				});
				expect(
					(await t.run(async (ctx) => ctx.db.get(orgId)))?.hasPremiumFeatureAccess
				).toBe(true);

				await t.mutation(internal.organizations.updateFromClerk, {
					clerkOrganizationId: "org_override",
					name: "Override Org",
					hasPremiumFeatureAccess: false,
				});
				expect(
					(await t.run(async (ctx) => ctx.db.get(orgId)))?.hasPremiumFeatureAccess
				).toBe(false);
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

	describe("Clerk seat-cap sync (Slice A reverse trial)", () => {
		beforeEach(() => {
			vi.stubEnv("CLERK_SECRET_KEY", "sk_test_stub");
		});

		async function seedOwner(externalId: string) {
			return await t.run(async (ctx) => {
				return await ctx.db.insert("users", {
					name: "Owner",
					email: `${externalId}@example.com`,
					image: "https://example.com/i.jpg",
					externalId,
				});
			});
		}

		/** Fires only the jobs already due — `vi.runAllTimers` would jump the
		 * faked clock past the trial before the immediate sync ever ran. */
		async function drainDueSeatSyncs() {
			vi.advanceTimersByTime(1_000);
			await t.finishInProgressScheduledFunctions();
		}

		it("grants Business seats at signup and syncs back down when the trial lapses", async () => {
			await seedOwner("user_seat_trial");
			const orgId = await t.mutation(internal.organizations.createFromClerk, {
				clerkOrganizationId: "org_seat_trial",
				name: "Trial Org",
				ownerClerkUserId: "user_seat_trial",
			});

			await drainDueSeatSyncs();
			expect(seatWrites).toEqual([
				{ organizationId: "org_seat_trial", maxAllowedMemberships: 20 },
			]);

			// The +14d wake re-resolves the now-lapsed org and writes the free cap.
			await t.finishAllScheduledFunctions(vi.runAllTimers);
			expect(seatWrites[seatWrites.length - 1]).toEqual({
				organizationId: "org_seat_trial",
				maxAllowedMemberships: 5,
			});
			const org = await t.run(async (ctx) => ctx.db.get(orgId!));
			expect(org?.trialEndsAt).toBeLessThan(Date.now());
		});

		it("an override grant from the org webhook syncs the cap up to 20", async () => {
			const ownerUserId = await seedOwner("user_seat_override");
			await t.run(async (ctx) => {
				await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_seat_override",
					name: "Override Org",
					ownerUserId,
				});
			});

			await t.mutation(internal.organizations.updateFromClerk, {
				clerkOrganizationId: "org_seat_override",
				name: "Override Org",
				hasPremiumFeatureAccess: true,
			});
			await drainDueSeatSyncs();

			expect(seatWrites).toEqual([
				{ organizationId: "org_seat_override", maxAllowedMemberships: 20 },
			]);
		});

		it("an unchanged override flag schedules no sync at all", async () => {
			const ownerUserId = await seedOwner("user_seat_noop");
			await t.run(async (ctx) => {
				await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_seat_noop",
					name: "Noop Org",
					ownerUserId,
					hasPremiumFeatureAccess: false,
				});
			});

			await t.mutation(internal.organizations.updateFromClerk, {
				clerkOrganizationId: "org_seat_noop",
				name: "Noop Org",
				hasPremiumFeatureAccess: false,
			});
			await drainDueSeatSyncs();

			expect(seatWrites).toEqual([]);
		});
	});
});
