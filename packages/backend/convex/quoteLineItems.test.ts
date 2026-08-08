import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestQuote,
	createTestIdentity,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

describe("QuoteLineItems", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a quote line item with valid data", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId, quoteId } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					const quoteId = await createTestQuote(ctx, orgId, clientId);
					return { orgId, clerkUserId, clerkOrgId, clientId, quoteId };
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Web Development",
				quantity: 10,
				unit: "hours",
				rate: 150,
				sortOrder: 0,
			});

			expect(lineItemId).toBeDefined();

			const lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem).toMatchObject({
				quoteId,
				description: "Web Development",
				quantity: 10,
				unit: "hours",
				rate: 150,
				amount: 1500, // 10 * 150
				sortOrder: 0,
			});
		});

		it("should calculate amount correctly (quantity * rate)", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Materials",
				quantity: 25,
				unit: "items",
				rate: 40,
				sortOrder: 0,
			});

			const lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.amount).toBe(1000); // 25 * 40 = 1000
		});

		it("should record the skuId the line was filled from", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const skuId = await asUser.mutation(api.skus.create, {
				name: "Lawn Mowing",
				unit: "hour",
				rate: 75,
			});

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Lawn Mowing",
				quantity: 2,
				unit: "hour",
				rate: 75,
				sortOrder: 0,
				skuId,
			});

			const lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.skuId).toBe(skuId);

			// Manual edits after the pick keep the provenance.
			await asUser.mutation(api.quoteLineItems.update, {
				id: lineItemId,
				rate: 90,
			});
			const edited = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(edited?.skuId).toBe(skuId);
		});

		it("should reject a skuId from another organization", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const other = await t.run(async (ctx) => {
				const { clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
					clerkOrgId: "org_other_sku",
					clerkUserId: "user_other_sku",
				});
				return { clerkUserId, clerkOrgId };
			});
			const asOtherUser = t.withIdentity(
				createTestIdentity(other.clerkUserId, other.clerkOrgId)
			);
			const foreignSkuId = await asOtherUser.mutation(api.skus.create, {
				name: "Foreign SKU",
				unit: "hour",
				rate: 50,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.quoteLineItems.create, {
					quoteId,
					description: "Cross-org",
					quantity: 1,
					unit: "hour",
					rate: 50,
					sortOrder: 0,
					skuId: foreignSkuId,
				})
			).rejects.toThrow();
		});
	});

	describe("listByQuote", () => {
		it("should return empty array when no line items exist", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItems = await asUser.query(api.quoteLineItems.listByQuote, {
				quoteId,
			});
			expect(lineItems).toEqual([]);
		});

		it("should return line items sorted by sortOrder", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create items out of order
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Third Item",
				quantity: 1,
				unit: "item",
				rate: 300,
				sortOrder: 2,
			});

			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "First Item",
				quantity: 1,
				unit: "item",
				rate: 100,
				sortOrder: 0,
			});

			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Second Item",
				quantity: 1,
				unit: "item",
				rate: 200,
				sortOrder: 1,
			});

			const lineItems = await asUser.query(api.quoteLineItems.listByQuote, {
				quoteId,
			});

			expect(lineItems).toHaveLength(3);
			expect(lineItems[0].description).toBe("First Item");
			expect(lineItems[1].description).toBe("Second Item");
			expect(lineItems[2].description).toBe("Third Item");
		});
	});

	describe("update", () => {
		it("should update line item description", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Original Description",
				quantity: 1,
				unit: "item",
				rate: 100,
				sortOrder: 0,
			});

			await asUser.mutation(api.quoteLineItems.update, {
				id: lineItemId,
				description: "Updated Description",
			});

			const lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.description).toBe("Updated Description");
		});

		it("should recalculate amount when quantity changes", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Service",
				quantity: 5,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			});

			// Initial amount should be 500 (5 * 100)
			let lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.amount).toBe(500);

			// Update quantity to 10
			await asUser.mutation(api.quoteLineItems.update, {
				id: lineItemId,
				quantity: 10,
			});

			lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.amount).toBe(1000); // 10 * 100
		});

		it("should recalculate amount when rate changes", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Consulting",
				quantity: 8,
				unit: "hours",
				rate: 200,
				sortOrder: 0,
			});

			// Initial amount should be 1600 (8 * 200)
			let lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.amount).toBe(1600);

			// Update rate to 250
			await asUser.mutation(api.quoteLineItems.update, {
				id: lineItemId,
				rate: 250,
			});

			lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.amount).toBe(2000); // 8 * 250
		});
	});

	describe("remove", () => {
		it("should delete a line item", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "To be deleted",
				quantity: 1,
				unit: "item",
				rate: 100,
				sortOrder: 0,
			});

			// Verify it exists
			let lineItem = await asUser.query(api.quoteLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem).not.toBeNull();

			// Delete it
			await asUser.mutation(api.quoteLineItems.remove, { id: lineItemId });

			// Verify it is gone
			lineItem = await asUser.query(api.quoteLineItems.get, { id: lineItemId });
			expect(lineItem).toBeNull();
		});
	});

	describe("bulkCreate", () => {
		it("should create multiple line items at once", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemIds = await asUser.mutation(api.quoteLineItems.bulkCreate, {
				quoteId,
				lineItems: [
					{
						description: "Design",
						quantity: 20,
						unit: "hours",
						rate: 100,
						sortOrder: 0,
					},
					{
						description: "Development",
						quantity: 40,
						unit: "hours",
						rate: 150,
						sortOrder: 1,
					},
					{
						description: "Testing",
						quantity: 10,
						unit: "hours",
						rate: 120,
						sortOrder: 2,
					},
				],
			});

			expect(lineItemIds).toHaveLength(3);

			const allItems = await asUser.query(api.quoteLineItems.listByQuote, {
				quoteId,
			});
			expect(allItems).toHaveLength(3);
			expect(allItems[0].description).toBe("Design");
			expect(allItems[0].amount).toBe(2000); // 20 * 100
			expect(allItems[1].description).toBe("Development");
			expect(allItems[1].amount).toBe(6000); // 40 * 150
			expect(allItems[2].description).toBe("Testing");
			expect(allItems[2].amount).toBe(1200); // 10 * 120
		});
	});

	describe("duplicate", () => {
		it("should duplicate a line item with (Copy) suffix", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const originalId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Original Service",
				quantity: 5,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			});

			const duplicateId = await asUser.mutation(api.quoteLineItems.duplicate, {
				id: originalId,
			});

			expect(duplicateId).not.toBe(originalId);

			const duplicate = await asUser.query(api.quoteLineItems.get, {
				id: duplicateId,
			});
			expect(duplicate?.description).toBe("Original Service (Copy)");
			expect(duplicate?.quantity).toBe(5);
			expect(duplicate?.rate).toBe(100);
			expect(duplicate?.amount).toBe(500);
			expect(duplicate?.sortOrder).toBe(1); // Next sort order
		});
	});

	describe("reorder", () => {
		it("should reorder line items by updating sortOrder", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const item1Id = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item A",
				quantity: 1,
				unit: "item",
				rate: 100,
				sortOrder: 0,
			});

			const item2Id = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item B",
				quantity: 1,
				unit: "item",
				rate: 200,
				sortOrder: 1,
			});

			const item3Id = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item C",
				quantity: 1,
				unit: "item",
				rate: 300,
				sortOrder: 2,
			});

			// Reorder: C, A, B
			await asUser.mutation(api.quoteLineItems.reorder, {
				quoteId,
				lineItemIds: [item3Id, item1Id, item2Id],
			});

			const reorderedItems = await asUser.query(api.quoteLineItems.listByQuote, {
				quoteId,
			});

			expect(reorderedItems[0].description).toBe("Item C");
			expect(reorderedItems[1].description).toBe("Item A");
			expect(reorderedItems[2].description).toBe("Item B");
		});
	});

	describe("getStats", () => {
		it("should return correct statistics for line items", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const quoteId = await createTestQuote(ctx, orgId, clientId);
				return { clerkUserId, clerkOrgId, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.quoteLineItems.bulkCreate, {
				quoteId,
				lineItems: [
					{ description: "Item 1", quantity: 10, unit: "hours", rate: 100, sortOrder: 0 },
					{ description: "Item 2", quantity: 5, unit: "hours", rate: 200, sortOrder: 1 },
					{ description: "Item 3", quantity: 8, unit: "hours", rate: 150, sortOrder: 2 },
				],
			});

			const stats = await asUser.query(api.quoteLineItems.getStats, { quoteId });

			expect(stats.totalItems).toBe(3);
			expect(stats.totalAmount).toBe(3200); // (10*100) + (5*200) + (8*150) = 1000 + 1000 + 1200
			expect(stats.totalQuantity).toBe(23); // 10 + 5 + 8
			expect(stats.averageRate).toBe(150); // (100 + 200 + 150) / 3
		});
	});

	describe("organization isolation", () => {
		it("should not allow access to line items from another organization", async () => {
			// Create first org with a quote and line item
			const { clerkUserId: user1Id, clerkOrgId: org1Id, quoteId: quote1Id } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
						orgName: "Organization 1",
					});
					const clientId = await createTestClient(ctx, orgId);
					const quoteId = await createTestQuote(ctx, orgId, clientId);
					return { clerkUserId, clerkOrgId, quoteId };
				});

			// Create second org
			const { clerkUserId: user2Id, clerkOrgId: org2Id } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
						orgName: "Organization 2",
					});
					return { clerkUserId, clerkOrgId };
				});

			const asUser1 = t.withIdentity(createTestIdentity(user1Id, org1Id));
			const asUser2 = t.withIdentity(createTestIdentity(user2Id, org2Id));

			// User 1 creates a line item
			const lineItemId = await asUser1.mutation(api.quoteLineItems.create, {
				quoteId: quote1Id,
				description: "Org 1 Service",
				quantity: 1,
				unit: "item",
				rate: 100,
				sortOrder: 0,
			});

			// User 2 should not be able to access this line item - expect it to throw
			await expect(
				asUser2.query(api.quoteLineItems.get, { id: lineItemId })
			).rejects.toThrowError("Quote line item does not belong to your organization");

			// User 2's list should not include User 1's line items
			const user2Items = await asUser2.query(api.quoteLineItems.list, {});
			expect(user2Items).toHaveLength(0);
		});
	});
});
