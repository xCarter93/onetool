/**
 * Edit-lock + content-timestamp + invoice-pricing-mode regressions.
 *
 * Inline line-item editing on record pages must never rewrite a document the
 * client has already acted on, and adding quote-style pricing to invoices must
 * not move a single stored total on a legacy invoice.
 */
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

describe("edit locks", () => {
	// NOTE: type from setupConvexTest, not `convexTest` — the bare
	// `ReturnType<typeof convexTest>` erases the schema generic, which makes
	// indexed `ctx.db.query(...)` calls inside `t.run` fail to typecheck.
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function setup() {
		const ids = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			const quoteId = await createTestQuote(ctx, orgId, clientId, {
				subtotal: 0,
				taxAmount: 0,
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

	// ========================================================================
	// Quote locks
	// ========================================================================

	describe("quote content lock", () => {
		it("blocks line-item create/update/remove once the quote is approved", async () => {
			const { asUser, quoteId } = await setup();

			// Seed a line item while the quote is still editable.
			const itemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Labor",
				quantity: 2,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			});

			await t.run((ctx) => ctx.db.patch(quoteId, { status: "approved" }));

			await expect(
				asUser.mutation(api.quoteLineItems.update, {
					id: itemId,
					quantity: 5,
				})
			).rejects.toThrow(/QUOTE_LOCKED/);

			await expect(
				asUser.mutation(api.quoteLineItems.create, {
					quoteId,
					description: "Extra",
					quantity: 1,
					unit: "item",
					rate: 50,
					sortOrder: 1,
				})
			).rejects.toThrow(/QUOTE_LOCKED/);

			await expect(
				asUser.mutation(api.quoteLineItems.remove, { id: itemId })
			).rejects.toThrow(/QUOTE_LOCKED/);

			// The blocked writes must not have landed.
			const stored = await t.run((ctx) => ctx.db.get(itemId));
			expect(stored?.quantity).toBe(2);
		});

		it("blocks quotes.update of pricing fields but allows a status change", async () => {
			const { asUser, quoteId } = await setup();
			await t.run((ctx) => ctx.db.patch(quoteId, { status: "approved" }));

			await expect(
				asUser.mutation(api.quotes.update, {
					id: quoteId,
					discountEnabled: true,
					discountAmount: 10,
					discountType: "percentage",
				})
			).rejects.toThrow(/QUOTE_LOCKED/);

			// Status transitions stay open on a locked quote.
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "declined",
			});
			const stored = await t.run((ctx) => ctx.db.get(quoteId));
			expect(stored?.status).toBe("declined");
			expect(stored?.discountEnabled).toBeUndefined();
		});

		it("allows line-item edits on draft quotes only — sent locks until revert (Slice 4 rule)", async () => {
			const { asUser, quoteId } = await setup();

			const itemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Labor",
				quantity: 2,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			});

			// Through the public API so the status aggregate tracks the flip —
			// the revert below also runs through it.
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "sent",
			});

			await expect(
				asUser.mutation(api.quoteLineItems.update, {
					id: itemId,
					quantity: 3,
				})
			).rejects.toThrow(/QUOTE_LOCKED.*revert it to draft/);

			// Reverting to draft is the unlock.
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "draft",
			});
			await asUser.mutation(api.quoteLineItems.update, {
				id: itemId,
				quantity: 3,
			});

			const stored = await t.run((ctx) => ctx.db.get(quoteId));
			expect(stored?.total).toBe(300);
		});
	});

	// ========================================================================
	// Invoice locks
	// ========================================================================

	describe("invoice content lock", () => {
		/**
		 * A quote-derived invoice carries a PENDING "Full Payment" row from birth
		 * (invoices.createFromQuote). Pending rows are a payment SCHEDULE, not
		 * collected money, so they must not lock the invoice.
		 */
		async function createQuoteDerivedInvoice() {
			const ctxIds = await setup();
			const { asUser, quoteId } = ctxIds;

			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Labor",
				quantity: 2,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			});
			await t.run((ctx) => ctx.db.patch(quoteId, { status: "approved" }));

			const derivedInvoiceId = await asUser.mutation(
				api.invoices.createFromQuote,
				{ quoteId }
			);
			return { ...ctxIds, derivedInvoiceId };
		}

		it("allows line-item edits on a quote-derived draft with a pending payment row", async () => {
			const { asUser, derivedInvoiceId } = await createQuoteDerivedInvoice();

			// Precondition: conversion produced a pending payment row + draft status.
			const pending = await t.run(async (ctx) =>
				ctx.db
					.query("payments")
					.withIndex("by_invoice", (q) => q.eq("invoiceId", derivedInvoiceId))
					.collect()
			);
			expect(pending).toHaveLength(1);
			expect(pending[0].status).toBe("pending");
			const before = await t.run((ctx) => ctx.db.get(derivedInvoiceId));
			expect(before?.status).toBe("draft");

			const lineItems = await t.run(async (ctx) =>
				ctx.db
					.query("invoiceLineItems")
					.withIndex("by_invoice", (q) => q.eq("invoiceId", derivedInvoiceId))
					.collect()
			);
			expect(lineItems).toHaveLength(1);

			await asUser.mutation(api.invoiceLineItems.update, {
				id: lineItems[0]._id,
				quantity: 4,
			});

			const stored = await t.run((ctx) => ctx.db.get(derivedInvoiceId));
			expect(stored?.total).toBe(400);
		});

		it("blocks line-item edits once that payment is marked paid", async () => {
			const { asUser, derivedInvoiceId } = await createQuoteDerivedInvoice();

			const paymentRows = await t.run(async (ctx) =>
				ctx.db
					.query("payments")
					.withIndex("by_invoice", (q) => q.eq("invoiceId", derivedInvoiceId))
					.collect()
			);
			await t.run((ctx) =>
				ctx.db.patch(paymentRows[0]._id, {
					status: "paid",
					paidAt: Date.now(),
				})
			);

			const lineItems = await t.run(async (ctx) =>
				ctx.db
					.query("invoiceLineItems")
					.withIndex("by_invoice", (q) => q.eq("invoiceId", derivedInvoiceId))
					.collect()
			);

			await expect(
				asUser.mutation(api.invoiceLineItems.update, {
					id: lineItems[0]._id,
					quantity: 9,
				})
			).rejects.toThrow(/INVOICE_LOCKED/);

			await expect(
				asUser.mutation(api.invoiceLineItems.create, {
					invoiceId: derivedInvoiceId,
					description: "Extra",
					quantity: 1,
					unitPrice: 25,
					sortOrder: 5,
				})
			).rejects.toThrow(/INVOICE_LOCKED/);
		});

		it("blocks pricing edits on a paid invoice but still allows a status change", async () => {
			const { asUser, invoiceId } = await setup();
			await t.run((ctx) => ctx.db.patch(invoiceId, { status: "paid" }));

			await expect(
				asUser.mutation(api.invoices.update, {
					id: invoiceId,
					discountEnabled: true,
					discountAmount: 10,
					discountType: "percentage",
				})
			).rejects.toThrow(/INVOICE_LOCKED/);

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "cancelled",
			});
			const stored = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(stored?.status).toBe("cancelled");
			expect(stored?.discountEnabled).toBeUndefined();
		});

		it("allows line-item edits on a plain draft invoice", async () => {
			const { asUser, invoiceId } = await setup();

			const itemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Service",
				quantity: 2,
				unit: "hours",
				unitPrice: 75,
				cost: 40,
				sortOrder: 0,
			});

			const stored = await t.run((ctx) => ctx.db.get(itemId));
			expect(stored?.unit).toBe("hours");
			expect(stored?.cost).toBe(40);
			expect(stored?.total).toBe(150);
		});
	});

	// ========================================================================
	// Invoice pricing modes
	// ========================================================================

	describe("invoice totals pricing modes", () => {
		it("legacy invoice (flat discountAmount/taxAmount) totals are unchanged", async () => {
			const { asUser, invoiceId } = await setup();
			// Legacy shape: ONLY the pre-computed dollar fields, none of the new ones.
			await t.run((ctx) =>
				ctx.db.patch(invoiceId, { discountAmount: 100, taxAmount: 50 })
			);

			await asUser.mutation(api.invoiceLineItems.bulkCreate, {
				invoiceId,
				lineItems: [
					{ description: "A", quantity: 1, unitPrice: 1000, sortOrder: 0 },
					{ description: "B", quantity: 1, unitPrice: 500, sortOrder: 1 },
				],
			});

			const stored = await t.run((ctx) => ctx.db.get(invoiceId));
			// Pre-change behavior: subtotal − flat discount + flat tax.
			expect(stored?.subtotal).toBe(1500);
			expect(stored?.total).toBe(1450);
			// taxAmount is caller-owned in legacy mode — sync must not derive it.
			expect(stored?.taxAmount).toBe(50);
		});

		it("quote-style invoice pricing matches quote math exactly", async () => {
			const { asUser, quoteId, invoiceId } = await setup();

			const pricing = {
				discountEnabled: true,
				discountAmount: 10,
				discountType: "percentage" as const,
				taxEnabled: true,
				taxRate: 8,
			};
			await t.run((ctx) => ctx.db.patch(quoteId, pricing));
			await t.run((ctx) => ctx.db.patch(invoiceId, pricing));

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
			await asUser.mutation(api.invoiceLineItems.bulkCreate, {
				invoiceId,
				lineItems: [
					{ description: "A", quantity: 1, unitPrice: 1000, sortOrder: 0 },
					{ description: "B", quantity: 1, unitPrice: 500, sortOrder: 1 },
				],
			});

			const storedQuote = await t.run((ctx) => ctx.db.get(quoteId));
			const storedInvoice = await t.run((ctx) => ctx.db.get(invoiceId));

			// 1500 → 1350 after 10% discount → +108 tax (8%) → 1458
			expect(storedInvoice?.subtotal).toBe(1500);
			expect(storedInvoice?.taxAmount).toBe(108);
			expect(storedInvoice?.total).toBe(1458);
			expect(storedInvoice?.subtotal).toBe(storedQuote?.subtotal);
			expect(storedInvoice?.taxAmount).toBe(storedQuote?.taxAmount);
			expect(storedInvoice?.total).toBe(storedQuote?.total);
		});
	});

	// ========================================================================
	// contentUpdatedAt
	// ========================================================================

	describe("contentUpdatedAt", () => {
		it("bumps on quote line-item edits and discount changes, not on status change", async () => {
			const { asUser, quoteId } = await setup();

			const itemId = await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Labor",
				quantity: 1,
				unit: "hours",
				rate: 100,
				sortOrder: 0,
			});
			const afterCreate = await t.run((ctx) => ctx.db.get(quoteId));
			expect(afterCreate?.contentUpdatedAt).toBeTypeOf("number");

			// Plain status change must not touch it.
			await t.run((ctx) => ctx.db.patch(quoteId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "sent",
			});
			const afterStatus = await t.run((ctx) => ctx.db.get(quoteId));
			expect(afterStatus?.contentUpdatedAt).toBe(1);

			// Sent quotes lock content (Slice 4) — revert to draft to continue,
			// which is itself a status change and must not bump either.
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				status: "draft",
			});
			const afterRevert = await t.run((ctx) => ctx.db.get(quoteId));
			expect(afterRevert?.contentUpdatedAt).toBe(1);

			// Line-item update bumps.
			await asUser.mutation(api.quoteLineItems.update, {
				id: itemId,
				quantity: 2,
			});
			const afterItemUpdate = await t.run((ctx) => ctx.db.get(quoteId));
			expect(afterItemUpdate?.contentUpdatedAt).toBeGreaterThan(1);

			// Discount change bumps.
			await t.run((ctx) => ctx.db.patch(quoteId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				discountEnabled: true,
				discountAmount: 5,
				discountType: "percentage",
			});
			const afterDiscount = await t.run((ctx) => ctx.db.get(quoteId));
			expect(afterDiscount?.contentUpdatedAt).toBeGreaterThan(1);
		});

		it("bumps on invoice line-item edits and discount changes, not on status change", async () => {
			const { asUser, invoiceId } = await setup();

			const itemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Service",
				quantity: 1,
				unitPrice: 100,
				sortOrder: 0,
			});
			const afterCreate = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterCreate?.contentUpdatedAt).toBeTypeOf("number");

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				status: "sent",
			});
			const afterStatus = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterStatus?.contentUpdatedAt).toBe(1);

			await asUser.mutation(api.invoiceLineItems.update, {
				id: itemId,
				quantity: 2,
			});
			const afterItemUpdate = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterItemUpdate?.contentUpdatedAt).toBeGreaterThan(1);

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				discountEnabled: true,
				discountAmount: 5,
				discountType: "percentage",
			});
			const afterDiscount = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterDiscount?.contentUpdatedAt).toBeGreaterThan(1);
		});

		it("bumps on payment-schedule edits, not on payment status flips", async () => {
			const { asUser, invoiceId } = await setup();

			// configurePayments below requires the schedule to sum to the total.
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Service",
				quantity: 1,
				unitPrice: 100,
				sortOrder: 0,
			});

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			const firstId = await asUser.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 60,
				dueDate: Date.now() + 86400000,
				sortOrder: 0,
			});
			const afterCreate = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterCreate?.contentUpdatedAt).toBeGreaterThan(1);

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.payments.update, {
				id: firstId,
				paymentAmount: 40,
			});
			const afterAmount = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterAmount?.contentUpdatedAt).toBeGreaterThan(1);

			// Status-only flip is bookkeeping, not a document change.
			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.payments.update, {
				id: firstId,
				status: "sent",
			});
			const afterStatus = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterStatus?.contentUpdatedAt).toBe(1);

			const secondId = await asUser.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 60,
				dueDate: Date.now() + 172800000,
				sortOrder: 1,
			});

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.payments.reorder, {
				invoiceId,
				paymentIds: [secondId, firstId],
			});
			const afterReorder = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterReorder?.contentUpdatedAt).toBeGreaterThan(1);

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.payments.remove, { id: secondId });
			const afterRemove = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterRemove?.contentUpdatedAt).toBeGreaterThan(1);

			await t.run((ctx) => ctx.db.patch(invoiceId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{
						paymentAmount: 100,
						dueDate: Date.now() + 86400000,
						sortOrder: 0,
					},
				],
			});
			const afterConfigure = await t.run((ctx) => ctx.db.get(invoiceId));
			expect(afterConfigure?.contentUpdatedAt).toBeGreaterThan(1);
		});

		it("bumps on reorder even though totals are unchanged", async () => {
			const { asUser, quoteId } = await setup();

			const ids = await asUser.mutation(api.quoteLineItems.bulkCreate, {
				quoteId,
				lineItems: [
					{
						description: "A",
						quantity: 1,
						unit: "item",
						rate: 100,
						sortOrder: 0,
					},
					{
						description: "B",
						quantity: 1,
						unit: "item",
						rate: 200,
						sortOrder: 1,
					},
				],
			});

			await t.run((ctx) => ctx.db.patch(quoteId, { contentUpdatedAt: 1 }));
			await asUser.mutation(api.quoteLineItems.reorder, {
				quoteId,
				lineItemIds: [ids[1], ids[0]],
			});

			const stored = await t.run((ctx) => ctx.db.get(quoteId));
			expect(stored?.contentUpdatedAt).toBeGreaterThan(1);
			expect(stored?.total).toBe(300);
		});
	});
});
