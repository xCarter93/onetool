/**
 * Regression tests for stored-total sync: every quote/invoice line-item write
 * must keep the STORED parent subtotal/total fresh (portal invoice display,
 * Stripe charge amounts, and dashboard aggregates all read the stored values).
 * Reads raw docs via ctx.db.get — never the recomputing get queries — so these
 * fail if the sync is dropped.
 */
import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../_generated/api";
import { setupConvexTest } from "../test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestQuote,
	createTestInvoice,
	createTestIdentity,
} from "../test.helpers";

describe("stored totals sync", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function setup() {
		const ids = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			const quoteId = await createTestQuote(ctx, orgId, clientId, {
				subtotal: 0,
				total: 0,
			});
			const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
				subtotal: 0,
				taxAmount: 0,
				total: 0,
			});
			return { orgId, clerkUserId, clerkOrgId, clientId, quoteId, invoiceId };
		});
		const asUser = t.withIdentity(
			createTestIdentity(ids.clerkUserId, ids.clerkOrgId)
		);
		return { ...ids, asUser };
	}

	describe("quote line items", () => {
		it("create/update/remove keep stored quote totals fresh", async () => {
			const { asUser, quoteId } = await setup();

			const itemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Labor",
				quantity: 10,
				unit: "hours",
				rate: 150,
				sortOrder: 0,
			});

			let stored = await t.run((ctx) => ctx.db.get(quoteId));
			expect(stored?.subtotal).toBe(1500);
			expect(stored?.total).toBe(1500);

			await asUser.mutation(api.quoteLineItems.update, {
				id: itemId,
				quantity: 4,
			});
			stored = await t.run((ctx) => ctx.db.get(quoteId));
			expect(stored?.subtotal).toBe(600);
			expect(stored?.total).toBe(600);

			await asUser.mutation(api.quoteLineItems.remove, { id: itemId });
			stored = await t.run((ctx) => ctx.db.get(quoteId));
			expect(stored?.subtotal).toBe(0);
			expect(stored?.total).toBe(0);
		});

		it("bulkCreate applies quote discount and tax to stored totals", async () => {
			const { asUser, quoteId } = await setup();
			await t.run((ctx) =>
				ctx.db.patch(quoteId, {
					discountEnabled: true,
					discountAmount: 10,
					discountType: "percentage" as const,
					taxEnabled: true,
					taxRate: 8,
				})
			);

			await asUser.mutation(api.quoteLineItems.bulkCreate, {
				quoteId,
				lineItems: [
					{
						description: "A",
						quantity: 1,
						unit: "item",
						rate: 1000,
						sortOrder: 0,
					},
					{
						description: "B",
						quantity: 1,
						unit: "item",
						rate: 500,
						sortOrder: 1,
					},
				],
			});

			const stored = await t.run((ctx) => ctx.db.get(quoteId));
			// 1500 → 1350 after 10% discount → +108 tax (8%)
			expect(stored?.subtotal).toBe(1500);
			expect(stored?.taxAmount).toBe(108);
			expect(stored?.total).toBe(1458);
		});
	});

	describe("invoice line items", () => {
		it("create/update/remove keep stored invoice totals fresh", async () => {
			const { asUser, invoiceId } = await setup();

			const itemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Service",
				quantity: 3,
				unitPrice: 99.99,
				sortOrder: 0,
			});

			let stored = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(stored?.subtotal).toBe(299.97);
			expect(stored?.total).toBe(299.97);

			await asUser.mutation(api.invoiceLineItems.update, {
				id: itemId,
				unitPrice: 100,
			});
			stored = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(stored?.total).toBe(300);

			await asUser.mutation(api.invoiceLineItems.remove, { id: itemId });
			stored = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(stored?.total).toBe(0);
		});

		it("stored total includes stored dollar discount and tax", async () => {
			const { asUser, invoiceId } = await setup();
			await t.run((ctx) =>
				ctx.db.patch(invoiceId, { discountAmount: 50, taxAmount: 20 })
			);

			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Service",
				quantity: 1,
				unitPrice: 500,
				sortOrder: 0,
			});

			const stored = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(stored?.subtotal).toBe(500);
			expect(stored?.total).toBe(470); // 500 - 50 + 20
		});

		it("portal invoice get returns the fresh stored total after an edit", async () => {
			const { asUser, invoiceId } = await setup();

			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Service",
				quantity: 2,
				unitPrice: 125.5,
				sortOrder: 0,
			});

			// The portal reads STORED fields — before the sync existed this was
			// stale whenever a line item changed after invoice creation.
			const stored = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(stored?.total).toBe(251);
		});
	});

	it("rejects non-finite money inputs before they poison totals", async () => {
		const { asUser, quoteId } = await setup();

		await expect(
			asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Bad",
				quantity: NaN,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			})
		).rejects.toThrow(/Quantity/);

		await expect(
			asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Bad",
				quantity: 1,
				unit: "hours",
				rate: Infinity,
				sortOrder: 0,
			})
		).rejects.toThrow(/Rate/);
	});
});
