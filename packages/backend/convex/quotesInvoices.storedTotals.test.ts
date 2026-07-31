import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { Id } from "./_generated/dataModel";
import { createTestOrg, createTestClient, createTestIdentity } from "./test.helpers";

/**
 * quotes.list / invoices.list return STORED subtotal/taxAmount/total instead
 * of recomputing from the org's entire line-item table on every call (see
 * quotes.ts / invoices.ts). quotes.get / invoices.get still recompute from
 * current line items, so `get` is the oracle: `list` must always agree with
 * it. Every test below builds records through the real public API (never
 * `ctx.db.insert`) so the sync helpers (syncQuoteTotals/syncInvoiceTotals)
 * and the `update` resync are actually exercised, then compares list vs get
 * vs a hand-computed expected number.
 */
describe("quotes.list / invoices.list agree with get on stored totals", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedOrg(overrides?: {
		clerkUserId?: string;
		clerkOrgId?: string;
	}) {
		return await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(
				ctx,
				overrides
			);
			const clientId = await createTestClient(ctx, orgId);
			return { orgId, clientId, clerkUserId, clerkOrgId };
		});
	}

	// ==========================================================================
	// QUOTES
	// ==========================================================================

	describe("quotes", () => {
		it("1. plain quote, several line items, no discount/tax: list == get == hand-computed sum", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const quoteId = await asUser.mutation(api.quotes.create, {
				clientId,
				status: "draft",
				subtotal: 0,
				total: 0,
			});

			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item A",
				quantity: 1,
				unit: "each",
				rate: 100.1,
				sortOrder: 0,
			});
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item B",
				quantity: 1,
				unit: "each",
				rate: 100.5,
				sortOrder: 1,
			});
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item C",
				quantity: 1,
				unit: "each",
				rate: 25.33,
				sortOrder: 2,
			});

			// Hand-computed: 100.10 + 100.50 + 25.33 = 225.93, no discount/tax.
			const got = await asUser.query(api.quotes.get, { id: quoteId });
			expect(got?.subtotal).toBe(225.93);
			expect(got?.taxAmount).toBe(0);
			expect(got?.total).toBe(225.93);

			const list = await asUser.query(api.quotes.list, {});
			const listed = list.find((q) => q._id === quoteId);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.taxAmount).toBe(got?.taxAmount);
			expect(listed?.total).toBe(got?.total);
		});

		/**
		 * Builds a quote with two line items summing to $1.15 (0.65 + 0.50), then
		 * turns on a 10% percentage discount + 5% tax via `quotes.update`.
		 *
		 * $1.15 * 0.90 = $1.035 exactly — a half-cent tie. Naive float rounding
		 * (`Math.round(1.035 * 100)`) resolves to 103 because `1.035 * 100` is
		 * actually `103.49999999999999` in IEEE-754, NOT 103.5 — it rounds DOWN
		 * to $1.03. The cent-rounded lib/money.ts math (`toFixed(4)` before
		 * rounding) correctly resolves the tie up to $1.04. This case would catch
		 * a regression that swapped the money.ts helpers for raw float math.
		 */
		async function createDiscountedTaxedQuote(
			asUser: ReturnType<typeof t.withIdentity>,
			clientId: Id<"clients">
		): Promise<Id<"quotes">> {
			const quoteId = await asUser.mutation(api.quotes.create, {
				clientId,
				status: "draft",
				subtotal: 0,
				total: 0,
			});

			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item A",
				quantity: 1,
				unit: "each",
				rate: 0.65,
				sortOrder: 0,
			});
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item B",
				quantity: 1,
				unit: "each",
				rate: 0.5,
				sortOrder: 1,
			});

			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				discountEnabled: true,
				discountAmount: 10,
				discountType: "percentage",
				taxEnabled: true,
				taxRate: 5,
			});

			return quoteId;
		}

		it("2. percentage discount + tax (half-cent tie) applied via update: list == get == hand-computed", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const quoteId = await createDiscountedTaxedQuote(asUser, clientId);

			// subtotal 1.15 -> discounted (10%) 1.04 (half-cent tie rounds up)
			// -> tax (5% of 1.04) 0.05 -> total 1.09
			const got = await asUser.query(api.quotes.get, { id: quoteId });
			expect(got?.subtotal).toBe(1.15);
			expect(got?.taxAmount).toBe(0.05);
			expect(got?.total).toBe(1.09);

			const list = await asUser.query(api.quotes.list, {});
			const listed = list.find((q) => q._id === quoteId);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.taxAmount).toBe(got?.taxAmount);
			expect(listed?.total).toBe(got?.total);
		});

		it("3. fixed (dollar) discount: list == get == hand-computed", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const quoteId = await asUser.mutation(api.quotes.create, {
				clientId,
				status: "draft",
				subtotal: 0,
				total: 0,
			});

			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item A",
				quantity: 1,
				unit: "each",
				rate: 0.65,
				sortOrder: 0,
			});
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item B",
				quantity: 1,
				unit: "each",
				rate: 0.5,
				sortOrder: 1,
			});

			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				discountEnabled: true,
				discountAmount: 0.2,
				discountType: "fixed",
			});

			// subtotal 1.15 - $0.20 fixed discount = 0.95, no tax.
			const got = await asUser.query(api.quotes.get, { id: quoteId });
			expect(got?.subtotal).toBe(1.15);
			expect(got?.taxAmount).toBe(0);
			expect(got?.total).toBe(0.95);

			const list = await asUser.query(api.quotes.list, {});
			const listed = list.find((q) => q._id === quoteId);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.taxAmount).toBe(got?.taxAmount);
			expect(listed?.total).toBe(got?.total);
		});

		it("4. adding a line item after discount/tax were set updates list and get consistently", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const quoteId = await createDiscountedTaxedQuote(asUser, clientId);

			// Add a third item ($10.00) after the discount (10%) + tax (5%) were set.
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item C",
				quantity: 1,
				unit: "each",
				rate: 10,
				sortOrder: 2,
			});

			// subtotal 11.15 -> discounted (10%) 10.035 -> rounds to 10.04
			// -> tax (5% of 10.04) 0.502 -> rounds to 0.50 -> total 10.54
			const got = await asUser.query(api.quotes.get, { id: quoteId });
			expect(got?.subtotal).toBe(11.15);
			expect(got?.taxAmount).toBe(0.5);
			expect(got?.total).toBe(10.54);

			const list = await asUser.query(api.quotes.list, {});
			const listed = list.find((q) => q._id === quoteId);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.taxAmount).toBe(got?.taxAmount);
			expect(listed?.total).toBe(got?.total);
		});

		it("5. turning a discount OFF drops it from both list and get", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const quoteId = await createDiscountedTaxedQuote(asUser, clientId);
			await asUser.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Item C",
				quantity: 1,
				unit: "each",
				rate: 10,
				sortOrder: 2,
			});

			await asUser.mutation(api.quotes.update, {
				id: quoteId,
				discountEnabled: false,
			});

			// subtotal 11.15 unchanged, discount dropped -> tax (5% of 11.15) 0.5575
			// -> rounds to 0.56 -> total 11.71
			const got = await asUser.query(api.quotes.get, { id: quoteId });
			expect(got?.discountEnabled).toBe(false);
			expect(got?.subtotal).toBe(11.15);
			expect(got?.taxAmount).toBe(0.56);
			expect(got?.total).toBe(11.71);

			const list = await asUser.query(api.quotes.list, {});
			const listed = list.find((q) => q._id === quoteId);
			expect(listed?.discountEnabled).toBe(false);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.taxAmount).toBe(got?.taxAmount);
			expect(listed?.total).toBe(got?.total);
		});
	});

	// ==========================================================================
	// INVOICES
	// ==========================================================================

	describe("invoices", () => {
		it("6. invoice with line items, no discount/tax: list == get == hand-computed sum", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			const invoiceId = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-STORED-001",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});

			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item A",
				quantity: 1,
				unitPrice: 80.08,
				sortOrder: 0,
			});
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item B",
				quantity: 1,
				unitPrice: 19.95,
				sortOrder: 1,
			});

			// Hand-computed: 80.08 + 19.95 = 100.03, no discount/tax.
			const got = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(got?.subtotal).toBe(100.03);
			expect(got?.total).toBe(100.03);

			const list = await asUser.query(api.invoices.list, {});
			const listed = list.find((inv) => inv._id === invoiceId);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.total).toBe(got?.total);
		});

		it("7. discountAmount + taxAmount set through invoices.update: list == get == hand-computed", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			const invoiceId = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-STORED-002",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});

			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item A",
				quantity: 1,
				unitPrice: 80.08,
				sortOrder: 0,
			});
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item B",
				quantity: 1,
				unitPrice: 19.95,
				sortOrder: 1,
			});

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				discountAmount: 12.34,
				taxAmount: 5.67,
			});

			// subtotal 100.03 - 12.34 discount + 5.67 tax = 93.36
			const got = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(got?.subtotal).toBe(100.03);
			expect(got?.total).toBe(93.36);

			const list = await asUser.query(api.invoices.list, {});
			const listed = list.find((inv) => inv._id === invoiceId);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.total).toBe(got?.total);
		});

		it("8. REGRESSION: clearing a discount with discountAmount: 0 removes it from both list and get", async () => {
			// The previous frontend sent `discountAmount: undefined` to clear a
			// discount; `filterUndefined` strips `undefined` from the patch, so the
			// old amount stayed on the doc and kept being applied. The fixed
			// frontend sends `discountAmount: 0`, which `filterUndefined` KEEPS
			// (only `undefined` is stripped), so it actually clears the discount.
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			const invoiceId = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-STORED-003",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});

			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item A",
				quantity: 1,
				unitPrice: 80.08,
				sortOrder: 0,
			});
			await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Item B",
				quantity: 1,
				unitPrice: 19.95,
				sortOrder: 1,
			});

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				discountAmount: 12.34,
				taxAmount: 5.67,
			});
			// Sanity: discount is applied before we clear it.
			const withDiscount = await asUser.query(api.invoices.get, {
				id: invoiceId,
			});
			expect(withDiscount?.total).toBe(93.36);

			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				discountAmount: 0,
			});

			// subtotal 100.03 - 0 discount + 5.67 tax (untouched) = 105.70
			const got = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(got?.subtotal).toBe(100.03);
			expect(got?.total).toBe(105.7);

			const list = await asUser.query(api.invoices.list, {});
			const listed = list.find((inv) => inv._id === invoiceId);
			expect(listed?.discountAmount).toBe(0);
			expect(listed?.subtotal).toBe(got?.subtotal);
			expect(listed?.total).toBe(got?.total);
		});

		it("9. deleting the last line item zeroes stored totals in both list and get", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			const invoiceId = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-STORED-004",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});

			const lineItemId = await asUser.mutation(api.invoiceLineItems.create, {
				invoiceId,
				description: "Only Item",
				quantity: 1,
				unitPrice: 42.5,
				sortOrder: 0,
			});

			// Sanity: totals are non-zero before the delete.
			const before = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(before?.total).toBe(42.5);

			await asUser.mutation(api.invoiceLineItems.remove, { id: lineItemId });

			const got = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(got?.subtotal).toBe(0);
			expect(got?.total).toBe(0);

			const list = await asUser.query(api.invoices.list, {});
			const listed = list.find((inv) => inv._id === invoiceId);
			expect(listed?.subtotal).toBe(0);
			expect(listed?.total).toBe(0);
		});

		it("11. an invoice that never had line items keeps its stored total in both list and get", async () => {
			// The update-path resync uses emptyFallback "stored" so it can't zero a
			// total the caller just set, and get/getWithPayments/getPreview use the
			// same fallback so they agree with list. Zeroing here would also destroy
			// the amount payments.ts enforces against.
			const { clientId, clerkUserId, clerkOrgId } = await seedOrg();
			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			const invoiceId = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-STORED-005",
				status: "draft",
				subtotal: 500,
				total: 500,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});

			// A total-affecting update on a line-item-less invoice triggers the
			// resync; it must leave the stored figures alone.
			await asUser.mutation(api.invoices.update, {
				id: invoiceId,
				total: 480,
			});

			const got = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(got?.total).toBe(480);

			const list = await asUser.query(api.invoices.list, {});
			const listed = list.find((inv) => inv._id === invoiceId);
			expect(listed?.total).toBe(got?.total);
			expect(listed?.subtotal).toBe(got?.subtotal);
		});
	});

	// ==========================================================================
	// ISOLATION
	// ==========================================================================

	describe("org isolation", () => {
		it("10. org A's list returns only org A's quotes/invoices with org A's totals", async () => {
			// Old implementation read line items org-wide when recomputing list
			// totals; this pins that the stored-totals replacement is still
			// correctly scoped by orgId.
			const orgA = await seedOrg({
				clerkUserId: "user_stored_totals_A",
				clerkOrgId: "org_stored_totals_A",
			});
			const orgB = await seedOrg({
				clerkUserId: "user_stored_totals_B",
				clerkOrgId: "org_stored_totals_B",
			});

			const asUserA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const asUserB = t.withIdentity(
				createTestIdentity(orgB.clerkUserId, orgB.clerkOrgId)
			);
			const now = Date.now();

			// Org A: quote (10 + 20 = 30) and invoice (15 + 25 = 40).
			const quoteA = await asUserA.mutation(api.quotes.create, {
				clientId: orgA.clientId,
				status: "draft",
				subtotal: 0,
				total: 0,
			});
			await asUserA.mutation(api.quoteLineItems.create, {
				quoteId: quoteA,
				description: "A1",
				quantity: 1,
				unit: "each",
				rate: 10,
				sortOrder: 0,
			});
			await asUserA.mutation(api.quoteLineItems.create, {
				quoteId: quoteA,
				description: "A2",
				quantity: 1,
				unit: "each",
				rate: 20,
				sortOrder: 1,
			});

			const invoiceA = await asUserA.mutation(api.invoices.create, {
				clientId: orgA.clientId,
				invoiceNumber: "INV-A-001",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});
			await asUserA.mutation(api.invoiceLineItems.create, {
				invoiceId: invoiceA,
				description: "A1",
				quantity: 1,
				unitPrice: 15,
				sortOrder: 0,
			});
			await asUserA.mutation(api.invoiceLineItems.create, {
				invoiceId: invoiceA,
				description: "A2",
				quantity: 1,
				unitPrice: 25,
				sortOrder: 1,
			});

			// Org B: quote (5) and invoice (7) — deliberately different totals.
			const quoteB = await asUserB.mutation(api.quotes.create, {
				clientId: orgB.clientId,
				status: "draft",
				subtotal: 0,
				total: 0,
			});
			await asUserB.mutation(api.quoteLineItems.create, {
				quoteId: quoteB,
				description: "B1",
				quantity: 1,
				unit: "each",
				rate: 5,
				sortOrder: 0,
			});

			const invoiceB = await asUserB.mutation(api.invoices.create, {
				clientId: orgB.clientId,
				invoiceNumber: "INV-B-001",
				status: "draft",
				subtotal: 0,
				total: 0,
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});
			await asUserB.mutation(api.invoiceLineItems.create, {
				invoiceId: invoiceB,
				description: "B1",
				quantity: 1,
				unitPrice: 7,
				sortOrder: 0,
			});

			// Org A's lists: only org A's records, with org A's totals.
			const quoteListA = await asUserA.query(api.quotes.list, {});
			expect(quoteListA).toHaveLength(1);
			expect(quoteListA[0]._id).toBe(quoteA);
			expect(quoteListA[0].subtotal).toBe(30);
			expect(quoteListA[0].total).toBe(30);

			const invoiceListA = await asUserA.query(api.invoices.list, {});
			expect(invoiceListA).toHaveLength(1);
			expect(invoiceListA[0]._id).toBe(invoiceA);
			expect(invoiceListA[0].subtotal).toBe(40);
			expect(invoiceListA[0].total).toBe(40);

			// Org B's lists: only org B's records, with org B's own totals — not
			// zeros, not org A's numbers.
			const quoteListB = await asUserB.query(api.quotes.list, {});
			expect(quoteListB).toHaveLength(1);
			expect(quoteListB[0]._id).toBe(quoteB);
			expect(quoteListB[0].total).toBe(5);

			const invoiceListB = await asUserB.query(api.invoices.list, {});
			expect(invoiceListB).toHaveLength(1);
			expect(invoiceListB[0]._id).toBe(invoiceB);
			expect(invoiceListB[0].total).toBe(7);
		});
	});
});
