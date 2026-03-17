import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import {
	createTestOrg,
	createTestClient,
	createTestQuote,
	createTestIdentity,
} from "./test.helpers";

describe("Quotes", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it.skip("should create a quote with valid data", async () => {
			const { userId, orgId, clientId } = await t.run(async (ctx) => {
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

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, orgId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const quoteId = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Test Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			expect(quoteId).toBeDefined();

			const quote = await asUser.query(api.quotes.get, { id: quoteId });
			expect(quote).toMatchObject({
				clientId,
				title: "Test Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
				orgId,
			});
		});

		it("should generate sequential quote numbers", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
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

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create first quote
			const quote1Id = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Quote 1",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			const quote1 = await asUser.query(api.quotes.get, { id: quote1Id });
			expect(quote1?.quoteNumber).toBe("Q-000001");

			// Create second quote
			const quote2Id = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Quote 2",
				status: "draft",
				subtotal: 2000,
				total: 2000,
			});

			const quote2 = await asUser.query(api.quotes.get, { id: quote2Id });
			expect(quote2?.quoteNumber).toBe("Q-000002");

			// Create third quote
			const quote3Id = await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Quote 3",
				status: "draft",
				subtotal: 3000,
				total: 3000,
			});

			const quote3 = await asUser.query(api.quotes.get, { id: quote3Id });
			expect(quote3?.quoteNumber).toBe("Q-000003");
		});
	});

	describe("list", () => {
		it("should return empty array when no quotes exist", async () => {
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

			const quotes = await asUser.query(api.quotes.list, {});
			expect(quotes).toEqual([]);
		});

		it("should filter quotes by status", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
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

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create quotes with different statuses
			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Draft Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Sent Quote",
				status: "sent",
				subtotal: 2000,
				total: 2000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Approved Quote",
				status: "approved",
				subtotal: 3000,
				total: 3000,
			});

			const draftQuotes = await asUser.query(api.quotes.list, {
				status: "draft",
			});
			expect(draftQuotes).toHaveLength(1);
			expect(draftQuotes[0].title).toBe("Draft Quote");

			const sentQuotes = await asUser.query(api.quotes.list, {
				status: "sent",
			});
			expect(sentQuotes).toHaveLength(1);
			expect(sentQuotes[0].title).toBe("Sent Quote");

			const allQuotes = await asUser.query(api.quotes.list, {});
			expect(allQuotes).toHaveLength(3);
		});

		it("should filter quotes by clientId", async () => {
			const { userId, clientId1, clientId2 } = await t.run(async (ctx) => {
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

				const clientId1 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 1",
					status: "active",
				});

				const clientId2 = await ctx.db.insert("clients", {
					orgId,
					companyName: "Client 2",
					status: "active",
				});

				return { userId, clientId1, clientId2 };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.quotes.create, {
				clientId: clientId1,
				title: "Quote for Client 1",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId: clientId2,
				title: "Quote for Client 2",
				status: "draft",
				subtotal: 2000,
				total: 2000,
			});

			const client1Quotes = await asUser.query(api.quotes.list, {
				clientId: clientId1,
			});
			expect(client1Quotes).toHaveLength(1);
			expect(client1Quotes[0].title).toBe("Quote for Client 1");
		});
	});

	describe("update", () => {
		it.skip("should update quote status", async () => {
			const { userId, clientId, quoteId } = await t.run(async (ctx) => {
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

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				const quoteId = await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Test Quote",
					status: "draft",
					subtotal: 1000,
					total: 1000,
					publicToken: "test_token_123",
				});

				return { userId, clientId, quoteId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "sent",
			});

			const quote = await asUser.query(api.quotes.get, { id: quoteId });
			expect(quote?.status).toBe("sent");
		});
	});

	describe("getAwaitingSigning", () => {
		const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

		it("should return quotes with status sent where sentAt is more than 3 days ago", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Quote sent 4 days ago
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Old Sent Quote",
					status: "sent",
					sentAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(1);
			expect(quotes[0].title).toBe("Old Sent Quote");
		});

		it("should exclude quotes with status sent where sentAt is less than 3 days ago", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Quote sent 1 day ago
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Recent Sent Quote",
					status: "sent",
					sentAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("should exclude quotes with status sent but no sentAt field", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Quote with sent status but no sentAt
				await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "No SentAt Quote",
					status: "sent",
					subtotal: 1000,
					total: 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("should exclude quotes with non-sent statuses", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Create quotes with various non-sent statuses, all old enough
				for (const status of ["draft", "approved", "declined", "expired"] as const) {
					await ctx.db.insert("quotes", {
						orgId,
						clientId,
						title: `${status} Quote`,
						status,
						sentAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
						subtotal: 1000,
						total: 1000,
					});
				}
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const quotes = await asUser.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});

		it("should return empty array when no org context", async () => {
			const quotes = await t.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toEqual([]);
		});

		it("should not return quotes from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1 } = await t.run(async (ctx) => {
				// Org 1 - no quotes
				const { orgId: orgId1, clerkUserId: clerkUserId1, clerkOrgId: clerkOrgId1 } =
					await createTestOrg(ctx, { clerkUserId: "user_1", clerkOrgId: "org_1" });
				const clientId1 = await createTestClient(ctx, orgId1);

				// Org 2 - has an awaiting signing quote
				const { orgId: orgId2 } = await createTestOrg(ctx, {
					clerkUserId: "user_2",
					clerkOrgId: "org_2",
				});
				const clientId2 = await createTestClient(ctx, orgId2);
				await ctx.db.insert("quotes", {
					orgId: orgId2,
					clientId: clientId2,
					title: "Other Org Quote",
					status: "sent",
					sentAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
					subtotal: 1000,
					total: 1000,
				});

				return { clerkUserId1, clerkOrgId1 };
			});

			const asUser1 = t.withIdentity(createTestIdentity(clerkUserId1, clerkOrgId1));
			const quotes = await asUser1.query(api.quotes.getAwaitingSigning, {});
			expect(quotes).toHaveLength(0);
		});
	});

	describe("getStats", () => {
		it.skip("should return correct quote statistics", async () => {
			const { userId, clientId } = await t.run(async (ctx) => {
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

				const clientId = await ctx.db.insert("clients", {
					orgId,
					companyName: "Test Client",
					status: "active",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			// Create quotes with different statuses
			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Draft Quote",
				status: "draft",
				subtotal: 1000,
				total: 1000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Sent Quote",
				status: "sent",
				subtotal: 2000,
				total: 2000,
			});

			await asUser.mutation(api.quotes.create, {
				clientId,
				title: "Approved Quote",
				status: "approved",
				subtotal: 3000,
				total: 3000,
			});

			const stats = await asUser.query(api.quotes.getStats, {});

			expect(stats.total).toBe(3);
			expect(stats.byStatus.draft).toBe(1);
			expect(stats.byStatus.sent).toBe(1);
			expect(stats.byStatus.approved).toBe(1);
			expect(stats.totalValue).toBe(6000); // Sum of all totals
		});
	});
});
