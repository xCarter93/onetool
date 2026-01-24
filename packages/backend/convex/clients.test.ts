import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";

describe("Clients", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a client with valid data", async () => {
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

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const clientId = await asUser.mutation(api.clients.create, {
				companyName: "Test Company",
				status: "active",
				leadSource: "website",
				notes: "Test notes",
			});

			expect(clientId).toBeDefined();

			const client = await asUser.query(api.clients.get, { id: clientId });
			expect(client).toMatchObject({
				companyName: "Test Company",
				status: "active",
				leadSource: "website",
				orgId,
			});
		});

		it("should create client with minimal required fields", async () => {
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

			const clientId = await asUser.mutation(api.clients.create, {
				companyName: "Minimal Client",
				status: "lead",
			});

			expect(clientId).toBeDefined();

			const client = await asUser.query(api.clients.get, { id: clientId });
			expect(client).toMatchObject({
				companyName: "Minimal Client",
				status: "lead",
			});
		});
	});

	describe("bulkCreate", () => {
		it("should create multiple clients successfully", async () => {
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

			const results = await asUser.mutation(api.clients.bulkCreate, {
				clients: [
					{
						companyName: "Client 1",
						status: "active",
					},
					{
						companyName: "Client 2",
						status: "lead",
					},
					{
						companyName: "Client 3",
						status: "lead",
					},
				],
			});

			expect(results).toHaveLength(3);
			expect(results.every((r) => r.success)).toBe(true);

			const clients = await asUser.query(api.clients.list, {});
			expect(clients).toHaveLength(3);
		});

		it("should handle validation errors in bulk create", async () => {
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

			const results = await asUser.mutation(api.clients.bulkCreate, {
				clients: [
					{
						companyName: "Valid Client",
						status: "active",
					},
					{
						companyName: "", // Invalid: empty name
						status: "lead",
					},
				],
			});

			expect(results).toHaveLength(2);
			expect(results[0].success).toBe(true);
			expect(results[1].success).toBe(false);
			expect(results[1].error).toContain("Company name is required");

			// Only the valid client should be created
			const clients = await asUser.query(api.clients.list, {});
			expect(clients).toHaveLength(1);
		});
	});

	describe("list", () => {
		it("should return empty array when no clients exist", async () => {
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

			const clients = await asUser.query(api.clients.list, {});
			expect(clients).toEqual([]);
		});

		it.skip("should filter clients by status", async () => {
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

			// Create clients with different statuses
			await asUser.mutation(api.clients.create, {
				companyName: "Active Client",
				status: "active",
			});

			await asUser.mutation(api.clients.create, {
				companyName: "Lead Client",
				status: "lead",
			});

			await asUser.mutation(api.clients.create, {
				companyName: "Inactive Client",
				status: "inactive",
			});

			const activeClients = await asUser.query(api.clients.list, {
				status: "active",
			});
			expect(activeClients).toHaveLength(1);
			expect(activeClients[0].companyName).toBe("Active Client");

			const leadClients = await asUser.query(api.clients.list, {
				status: "lead",
			});
			expect(leadClients).toHaveLength(1);
			expect(leadClients[0].companyName).toBe("Lead Client");

			const allClients = await asUser.query(api.clients.list, {});
			expect(allClients).toHaveLength(3);
		});

		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should exclude archived clients by default", async () => {
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

			const activeClientId = await asUser.mutation(api.clients.create, {
				companyName: "Active Client",
				status: "active",
			});

			const archivedClientId = await asUser.mutation(api.clients.create, {
				companyName: "To Archive",
				status: "active",
			});

			// Archive one client
			await asUser.mutation(api.clients.archive, { id: archivedClientId });

			// Default list should only show active
			const clients = await asUser.query(api.clients.list, {});
			expect(clients).toHaveLength(1);
			expect(clients[0].status).toBe("active");

			// Include archived should show both
			const allClients = await asUser.query(api.clients.list, {
				includeArchived: true,
			});
			expect(allClients).toHaveLength(2);
		});
	});

	describe("update", () => {
		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should update client fields", async () => {
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
					companyName: "Original Name",
					status: "lead",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.clients.update, {
				id: clientId,
				companyName: "Updated Name",
				status: "active",
				leadSource: "website",
				notes: "Updated notes",
			});

			const client = await asUser.query(api.clients.get, { id: clientId });
			expect(client).toMatchObject({
				companyName: "Updated Name",
				status: "active",
				leadSource: "website",
				notes: "Updated notes",
			});
		});

		it("should throw error when no updates provided", async () => {
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

			await expect(
				asUser.mutation(api.clients.update, {
					id: clientId,
				})
			).rejects.toThrowError("No valid updates provided");
		});
	});

	describe("archive and restore", () => {
		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should archive a client", async () => {
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

			await asUser.mutation(api.clients.archive, { id: clientId });

			const client = await asUser.query(api.clients.get, { id: clientId });
			expect(client?.status).toBe("archived");
			expect(client?.archivedAt).toBeDefined();
		});

		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should restore an archived client", async () => {
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
					status: "archived",
					archivedAt: Date.now(),
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			await asUser.mutation(api.clients.restore, { id: clientId });

			const client = await asUser.query(api.clients.get, { id: clientId });
			expect(client?.status).toBe("active");
			expect(client?.archivedAt).toBeUndefined();
		});

		it("should throw error when restoring non-archived client", async () => {
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

			await expect(
				asUser.mutation(api.clients.restore, { id: clientId })
			).rejects.toThrowError("Only archived clients can be restored");
		});
	});

	describe("getStats", () => {
		// TODO: Re-enable after fixing async event emission transaction issue
		it.skip("should return correct client statistics", async () => {
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

			// Create clients with different statuses and categories
			await asUser.mutation(api.clients.create, {
				companyName: "Active Client 1",
				status: "active",
				leadSource: "website",
			});

			await asUser.mutation(api.clients.create, {
				companyName: "Active Client 2",
				status: "active",
				leadSource: "referral",
			});

			await asUser.mutation(api.clients.create, {
				companyName: "Lead Client",
				status: "lead",
				leadSource: "website",
			});

			await asUser.mutation(api.clients.create, {
				companyName: "Inactive Client",
				status: "inactive",
				leadSource: "word-of-mouth",
			});

			const stats = await asUser.query(api.clients.getStats, {});

			expect(stats.total).toBe(4);
			expect(stats.byStatus.active).toBe(2);
			expect(stats.byStatus.lead).toBe(1);
			expect(stats.byStatus.inactive).toBe(1);
			expect(stats.byStatus.archived).toBe(0);

			expect(stats.groupedByStatus.active).toBe(2);
			expect(stats.groupedByStatus.prospective).toBe(1); // only lead
			expect(stats.groupedByStatus.inactive).toBe(1);
		});
	});

	describe("listWithProjectCounts", () => {
		it("should return clients with project counts", async () => {
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

				// Create some projects for this client
				await ctx.db.insert("projects", {
					orgId,
					clientId,
					title: "Project 1",
					status: "in-progress",
					projectType: "one-off",
				});

				await ctx.db.insert("projects", {
					orgId,
					clientId,
					title: "Project 2",
					status: "planned",
					projectType: "one-off",
				});

				await ctx.db.insert("projects", {
					orgId,
					clientId,
					title: "Project 3",
					status: "completed",
					projectType: "one-off",
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const clients = await asUser.query(api.clients.listWithProjectCounts, {});

			expect(clients).toHaveLength(1);
			expect(clients[0]).toMatchObject({
				name: "Test Client",
				activeProjects: 2, // Only in-progress and planned
				status: "Active",
			});
		});

		it("should include primary contact information", async () => {
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

				// Create primary contact
				await ctx.db.insert("clientContacts", {
					clientId,
					orgId,
					firstName: "John",
					lastName: "Doe",
					email: "john@testclient.com",
					jobTitle: "CEO",
					isPrimary: true,
				});

				return { userId, clientId };
			});

			const asUser = t.withIdentity({
				subject: "user_123",
				activeOrgId: "org_123",
			});

			const clients = await asUser.query(api.clients.listWithProjectCounts, {});

			expect(clients).toHaveLength(1);
			expect(clients[0].primaryContact).toMatchObject({
				name: "John Doe",
				email: "john@testclient.com",
				jobTitle: "CEO",
			});
		});
	});
});
