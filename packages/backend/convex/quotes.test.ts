import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";

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
