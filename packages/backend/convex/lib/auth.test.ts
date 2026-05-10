import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../_generated/api";
import { setupConvexTest } from "../test.setup";

describe("Auth Helpers", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("getCurrentUserOrgId", () => {
		it("should return organization ID for authenticated user with active org", async () => {
			const { userId, orgId } = await t.run(async (ctx) => {
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

				return { userId, orgId };
			});

			// Use internal function directly to test the helper
			const result = await t.run(async (ctx) => {
				// Simulate authenticated context with org
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
					activeOrgId: "org_123",
				};

				// Mock ctx.auth.getUserIdentity
				(ctx.auth as any).getUserIdentity = async () => identity;

				const { getCurrentUserOrgId } = await import("../lib/auth");
				return await getCurrentUserOrgId(ctx);
			});

			expect(result).toBe(orgId);
		});

		it("should throw error when user not authenticated", async () => {
			await expect(
				t.run(async (ctx) => {
					// Mock unauthenticated context
					(ctx.auth as any).getUserIdentity = async () => null;

					const { getCurrentUserOrgId } = await import("../lib/auth");
					return await getCurrentUserOrgId(ctx);
				})
			).rejects.toThrowError("User not authenticated");
		});

		it("should throw error when no active organization in session", async () => {
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

			await expect(
				t.run(async (ctx) => {
					// Mock authenticated context without active org
					const identity = {
						subject: "user_123",
						tokenIdentifier: "test_token",
						issuer: "https://test.clerk.com",
						// No activeOrgId, orgId, or org_id
					};

					(ctx.auth as any).getUserIdentity = async () => identity;

					const { getCurrentUserOrgId } = await import("../lib/auth");
					return await getCurrentUserOrgId(ctx);
				})
			).rejects.toThrowError("No active organization found in user session");
		});

		it("should return null when require: false and no identity", async () => {
			const result = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () => null;

				const { getCurrentUserOrgId } = await import("../lib/auth");
				return await getCurrentUserOrgId(ctx, { require: false });
			});

			expect(result).toBeNull();
		});

		it("should return null when require: false and no org", async () => {
			await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});
			});

			const result = await t.run(async (ctx) => {
				// Mock authenticated context without org
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
				};

				(ctx.auth as any).getUserIdentity = async () => identity;

				const { getCurrentUserOrgId } = await import("../lib/auth");
				return await getCurrentUserOrgId(ctx, { require: false });
			});

			expect(result).toBeNull();
		});

		it("should handle alternative org ID fields (orgId, org_id)", async () => {
			const { userId, orgId } = await t.run(async (ctx) => {
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

				return { userId, orgId };
			});

			// Test with orgId field
			const result1 = await t.run(async (ctx) => {
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
					orgId: "org_123",
				};

				(ctx.auth as any).getUserIdentity = async () => identity;

				const { getCurrentUserOrgId } = await import("../lib/auth");
				return await getCurrentUserOrgId(ctx);
			});

			expect(result1).toBe(orgId);

			// Test with org_id field
			const result2 = await t.run(async (ctx) => {
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
					org_id: "org_123",
				};

				(ctx.auth as any).getUserIdentity = async () => identity;

				const { getCurrentUserOrgId } = await import("../lib/auth");
				return await getCurrentUserOrgId(ctx);
			});

			expect(result2).toBe(orgId);
		});
	});

	describe("getCurrentUser", () => {
		it("should return user for authenticated session", async () => {
			const { userId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				return { userId };
			});

			const result = await t.run(async (ctx) => {
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
				};

				(ctx.auth as any).getUserIdentity = async () => identity;

				const { getCurrentUser } = await import("../lib/auth");
				return await getCurrentUser(ctx);
			});

			expect(result).toMatchObject({
				_id: userId,
				name: "Test User",
				email: "test@example.com",
				externalId: "user_123",
			});
		});

		it("should return null for unauthenticated session", async () => {
			const result = await t.run(async (ctx) => {
				(ctx.auth as any).getUserIdentity = async () => null;

				const { getCurrentUser } = await import("../lib/auth");
				return await getCurrentUser(ctx);
			});

			expect(result).toBeNull();
		});
	});

	describe("getCurrentUserOrThrow", () => {
		it("should return user for authenticated session", async () => {
			const { userId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				return { userId };
			});

			const result = await t.run(async (ctx) => {
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
				};

				(ctx.auth as any).getUserIdentity = async () => identity;

				const { getCurrentUserOrThrow } = await import("../lib/auth");
				return await getCurrentUserOrThrow(ctx);
			});

			expect(result).toMatchObject({
				_id: userId,
				name: "Test User",
				email: "test@example.com",
			});
		});

		it("should throw error for unauthenticated session", async () => {
			await expect(
				t.run(async (ctx) => {
					(ctx.auth as any).getUserIdentity = async () => null;

					const { getCurrentUserOrThrow } = await import("../lib/auth");
					return await getCurrentUserOrThrow(ctx);
				})
			).rejects.toThrowError("User not authenticated");
		});
	});

	describe("validateOrgAccess", () => {
		it("should succeed when user has access to organization", async () => {
			const { userId, orgId } = await t.run(async (ctx) => {
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

				return { userId, orgId };
			});

			const result = await t.run(async (ctx) => {
				const identity = {
					subject: "user_123",
					tokenIdentifier: "test_token",
					issuer: "https://test.clerk.com",
					activeOrgId: "org_123",
				};

				(ctx.auth as any).getUserIdentity = async () => identity;

				const { validateOrgAccess } = await import("../lib/auth");
				return await validateOrgAccess(ctx, orgId);
			});

			expect(result).toBe(orgId);
		});

		it("should throw error when user does not have access to organization", async () => {
			const { userId, orgId1, orgId2 } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				const orgId1 = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_123",
					name: "User's Org",
					ownerUserId: userId,
				});

				await ctx.db.insert("organizationMemberships", {
					orgId: orgId1,
					userId,
					role: "admin",
				});

				const orgId2 = await ctx.db.insert("organizations", {
					clerkOrganizationId: "org_456",
					name: "Other Org",
					ownerUserId: userId,
				});

				return { userId, orgId1, orgId2 };
			});

			await expect(
				t.run(async (ctx) => {
					const identity = {
						subject: "user_123",
						tokenIdentifier: "test_token",
						issuer: "https://test.clerk.com",
						activeOrgId: "org_123",
					};

					(ctx.auth as any).getUserIdentity = async () => identity;

					const { validateOrgAccess } = await import("../lib/auth");
					return await validateOrgAccess(ctx, orgId2);
				})
			).rejects.toThrowError("User does not have access to this organization");
		});
	});

	describe("getOrganizationByClerkId", () => {
		it("should find organization by Clerk ID", async () => {
			const { userId, orgId } = await t.run(async (ctx) => {
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

				return { userId, orgId };
			});

			const result = await t.run(async (ctx) => {
				const { getOrganizationByClerkId } = await import("../lib/auth");
				return await getOrganizationByClerkId(ctx, "org_123");
			});

			expect(result).toMatchObject({
				_id: orgId,
				clerkOrganizationId: "org_123",
				name: "Test Org",
			});
		});

		it("should return null for non-existent Clerk org ID", async () => {
			const result = await t.run(async (ctx) => {
				const { getOrganizationByClerkId } = await import("../lib/auth");
				return await getOrganizationByClerkId(ctx, "nonexistent_org");
			});

			expect(result).toBeNull();
		});
	});

	describe("userByExternalId", () => {
		it("should find user by external ID", async () => {
			const { userId } = await t.run(async (ctx) => {
				const userId = await ctx.db.insert("users", {
					name: "Test User",
					email: "test@example.com",
					image: "https://example.com/image.jpg",
					externalId: "user_123",
				});

				return { userId };
			});

			const result = await t.run(async (ctx) => {
				const { userByExternalId } = await import("../lib/auth");
				return await userByExternalId(ctx, "user_123");
			});

			expect(result).toMatchObject({
				_id: userId,
				externalId: "user_123",
				name: "Test User",
			});
		});

		it("should return null for non-existent external ID", async () => {
			const result = await t.run(async (ctx) => {
				const { userByExternalId } = await import("../lib/auth");
				return await userByExternalId(ctx, "nonexistent_user");
			});

			expect(result).toBeNull();
		});
	});
});
