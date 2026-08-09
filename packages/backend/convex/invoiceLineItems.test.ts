import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestInvoice,
	createTestIdentity,
} from "./test.helpers";

describe("InvoiceLineItems", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create an invoice line item with valid data", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Test Service",
				quantity: 2,
				unitPrice: 5000,
				sortOrder: 0,
			});

			expect(lineItemId).toBeDefined();

			const lineItem = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem).toMatchObject({
				invoiceId,
				description: "Test Service",
				quantity: 2,
				unitPrice: 5000,
				total: 10000, // 2 * 5000
				sortOrder: 0,
			});
		});

		it("should calculate total correctly (quantity * unitPrice)", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Expensive Service",
				quantity: 5,
				unitPrice: 12000,
				sortOrder: 0,
			});

			const lineItem = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.total).toBe(60000); // 5 * 12000
		});

		it("should record the skuId the line was filled from", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const skuId = await asUser.mutation(api.skus.create, {
				name: "Gutter Cleaning",
				unit: "job",
				rate: 200,
			});

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Gutter Cleaning",
				quantity: 1,
				unit: "job",
				unitPrice: 200,
				sortOrder: 0,
				skuId,
			});

			const lineItem = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(lineItem?.skuId).toBe(skuId);

			// Manual edits after the pick keep the provenance.
			await asUser.mutation(api.invoiceLineItems.update, {
				id: lineItemId,
				quantity: 3,
			});
			const edited = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(edited?.skuId).toBe(skuId);
		});

		it("should reject a skuId from another organization", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
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
				unit: "job",
				rate: 100,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.invoiceLineItems.create, {
					invoiceId,
					description: "Cross-org",
					quantity: 1,
					unitPrice: 100,
					sortOrder: 0,
					skuId: foreignSkuId,
				})
			).rejects.toThrow(/organization/i);
		});

		it("should validate required fields", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Should throw error for empty description
			await expect(
				asUser.mutation(api.invoiceLineItems.create, {
					invoiceId,
					description: "",
					quantity: 1,
					unitPrice: 1000,
					sortOrder: 0,
				})
			).rejects.toThrowError();
		});
	});

	describe("listByInvoice", () => {
		it("should return line items for a specific invoice", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create multiple line items
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item 1",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 0,
			});
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item 2",
				quantity: 2,
				unitPrice: 2000,
				sortOrder: 1,
			});

			const lineItems = await asUser.query(api.invoiceLineItems.listByInvoice, {
				invoiceId,
			});
			expect(lineItems).toHaveLength(2);
		});

		it("should return line items sorted by sortOrder", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create items out of order
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Second",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 1,
			});
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "First",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 0,
			});

			const lineItems = await asUser.query(api.invoiceLineItems.listByInvoice, {
				invoiceId,
			});
			expect(lineItems[0].description).toBe("First");
			expect(lineItems[1].description).toBe("Second");
		});
	});

	describe("update", () => {
		it("should update line item fields and recalculate total", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Original Service",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 0,
			});

			// Update quantity - should recalculate total
			await asUser.mutation(api.invoiceLineItems.update, {
				id: lineItemId,
				quantity: 3,
			});

			const updatedItem = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(updatedItem?.quantity).toBe(3);
			expect(updatedItem?.total).toBe(3000); // 3 * 1000
		});
	});

	describe("remove", () => {
		it("should delete a line item", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "To Delete",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 0,
			});

			await asUser.mutation(api.invoiceLineItems.remove, { id: lineItemId });

			const deletedItem = await asUser.query(api.invoiceLineItems.get, {
				id: lineItemId,
			});
			expect(deletedItem).toBeNull();
		});
	});

	describe("bulkCreate", () => {
		it("should create multiple line items at once", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const createdIds = await asUser.mutation(api.invoiceLineItems.bulkCreate, {
				invoiceId,
				lineItems: [
					{ description: "Bulk Item 1", quantity: 1, unitPrice: 1000, sortOrder: 0 },
					{ description: "Bulk Item 2", quantity: 2, unitPrice: 2000, sortOrder: 1 },
					{ description: "Bulk Item 3", quantity: 3, unitPrice: 3000, sortOrder: 2 },
				],
			});

			expect(createdIds).toHaveLength(3);

			const allItems = await asUser.query(api.invoiceLineItems.listByInvoice, {
				invoiceId,
			});
			expect(allItems).toHaveLength(3);
			expect(allItems[2].total).toBe(9000); // 3 * 3000
		});
	});

	describe("duplicate", () => {
		it("should duplicate a line item with (Copy) suffix", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const originalId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Original Item",
				quantity: 2,
				unitPrice: 5000,
				sortOrder: 0,
			});

			const duplicateId = await asUser.mutation(api.invoiceLineItems.duplicate, {
				id: originalId,
			});

			const duplicate = await asUser.query(api.invoiceLineItems.get, {
				id: duplicateId,
			});

			expect(duplicate?.description).toBe("Original Item (Copy)");
			expect(duplicate?.quantity).toBe(2);
			expect(duplicate?.unitPrice).toBe(5000);
			expect(duplicate?.total).toBe(10000);
			expect(duplicate?.sortOrder).toBe(1); // Should be after original
		});
	});

	describe("reorder", () => {
		it("should reorder line items", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const id1 = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "First",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 0,
			});
			const id2 = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Second",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 1,
			});

			// Reverse the order
			await asUser.mutation(api.invoiceLineItems.reorder, {
				invoiceId,
				lineItemIds: [id2, id1],
			});

			const items = await asUser.query(api.invoiceLineItems.listByInvoice, {
				invoiceId,
			});
			expect(items[0].description).toBe("Second");
			expect(items[1].description).toBe("First");
		});
	});

	describe("getStats", () => {
		it("should return correct statistics", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.invoiceLineItems.bulkCreate, {
				invoiceId,
				lineItems: [
					{ description: "Item 1", quantity: 2, unitPrice: 1000, sortOrder: 0 }, // total: 2000
					{ description: "Item 2", quantity: 3, unitPrice: 2000, sortOrder: 1 }, // total: 6000
					{ description: "Item 3", quantity: 1, unitPrice: 3000, sortOrder: 2 }, // total: 3000
				],
			});

			const stats = await asUser.query(api.invoiceLineItems.getStats, {
				invoiceId,
			});

			expect(stats.totalItems).toBe(3);
			expect(stats.totalAmount).toBe(11000); // 2000 + 6000 + 3000
			expect(stats.totalQuantity).toBe(6); // 2 + 3 + 1
			expect(stats.highestAmount).toBe(6000);
			expect(stats.lowestAmount).toBe(2000);
			expect(stats.averageUnitPrice).toBe(2000); // (1000 + 2000 + 3000) / 3
		});

		it("should return zero stats for empty invoice", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.invoiceLineItems.getStats, {
				invoiceId,
			});

			expect(stats.totalItems).toBe(0);
			expect(stats.totalAmount).toBe(0);
			expect(stats.totalQuantity).toBe(0);
			expect(stats.lowestAmount).toBe(0);
		});
	});

	describe("organization isolation", () => {
		it("should not return line items from other organizations", async () => {
			const { invoiceId1, invoiceId2, clerkUserId1, clerkOrgId1, clerkOrgId2 } =
				await t.run(async (ctx) => {
					// Create first org with invoice and line item
					const {
						orgId: orgId1,
						clerkUserId: clerkUserId1,
						clerkOrgId: clerkOrgId1,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});
					const clientId1 = await createTestClient(ctx, orgId1);
					const invoiceId1 = await createTestInvoice(ctx, orgId1, clientId1);

					// Create second org with invoice and line item
					const {
						orgId: orgId2,
						clerkUserId: clerkUserId2,
						clerkOrgId: clerkOrgId2,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					const invoiceId2 = await createTestInvoice(ctx, orgId2, clientId2);

					return {
						invoiceId1,
						invoiceId2,
						clerkUserId1,
						clerkOrgId1,
						clerkOrgId2,
					};
				});

			// Create line items as each user
			const asUser1 = t.withIdentity(createTestIdentity(clerkUserId1, clerkOrgId1));
			await asUser1.mutation(api.invoiceLineItems.create, {
				invoiceId: invoiceId1,
				description: "Org 1 Item",
				quantity: 1,
				unitPrice: 1000,
				sortOrder: 0,
			});

			// User 1 should only see their own items
			const user1Items = await asUser1.query(api.invoiceLineItems.list, {});
			expect(user1Items).toHaveLength(1);
			expect(user1Items[0].description).toBe("Org 1 Item");
		});

		it("should throw error when accessing line items from other organizations", async () => {
			const { lineItemId1, clerkUserId2, clerkOrgId2 } = await t.run(
				async (ctx) => {
					// Create first org with invoice and line item (directly in db)
					const {
						orgId: orgId1,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});
					const clientId1 = await createTestClient(ctx, orgId1);
					const invoiceId1 = await createTestInvoice(ctx, orgId1, clientId1);

					// Insert line item directly to avoid auth
					const lineItemId1 = await ctx.db.insert("invoiceLineItems", {
						orgId: orgId1,
						invoiceId: invoiceId1,
						description: "Org 1 Secret Item",
						quantity: 1,
						unitPrice: 10000,
						total: 10000,
						sortOrder: 0,
					});

					// Create second org
					const {
						clerkUserId: clerkUserId2,
						clerkOrgId: clerkOrgId2,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});

					return { lineItemId1, clerkUserId2, clerkOrgId2 };
				}
			);

			// User 2 should get an error when trying to access Org 1's line item
			const asUser2 = t.withIdentity(createTestIdentity(clerkUserId2, clerkOrgId2));
			await expect(
				asUser2.query(api.invoiceLineItems.get, { id: lineItemId1 })
			).rejects.toThrowError("Invoice line item does not belong to your organization");
		});
	});
});
