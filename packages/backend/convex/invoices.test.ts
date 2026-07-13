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

describe("Invoices", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create an invoice with valid data", async () => {
			const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					return { orgId, clientId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			const invoiceId = await asUser.mutation(api.invoices.create, {
				clientId,
				invoiceNumber: "INV-001",
				subtotal: 1000,
				taxAmount: 100,
				total: 1100,
				status: "draft",
				issuedDate: now,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
			});

			expect(invoiceId).toBeDefined();

			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(invoice).toMatchObject({
				clientId,
				orgId,
				status: "draft",
				invoiceNumber: "INV-001",
			});
		});

		it("should validate required fields", async () => {
			const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				return { clientId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const now = Date.now();

			// Should throw error for empty invoice number
			await expect(
				asUser.mutation(api.invoices.create, {
					clientId,
					invoiceNumber: "",
					subtotal: 500,
					total: 500,
					status: "draft",
					issuedDate: now,
					dueDate: now + 30 * 24 * 60 * 60 * 1000,
				})
			).rejects.toThrowError();
		});
	});

	describe("list", () => {
		it("should return empty array when no invoices exist", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const invoices = await asUser.query(api.invoices.list, {});
			expect(invoices).toEqual([]);
		});

		it("should return all invoices for organization", async () => {
			const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-001",
					});
					await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-002",
					});
					await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-003",
					});
					return { orgId, clientId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const invoices = await asUser.query(api.invoices.list, {});
			expect(invoices).toHaveLength(3);
		});

		it("should filter invoices by status", async () => {
			const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-001",
						status: "draft",
					});
					await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-002",
						status: "sent",
					});
					await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-003",
						status: "paid",
					});
					return { orgId, clientId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const paidInvoices = await asUser.query(api.invoices.list, {
				status: "paid",
			});
			expect(paidInvoices).toHaveLength(1);
			expect(paidInvoices[0].invoiceNumber).toBe("INV-003");
		});

		it("should filter invoices by client", async () => {
			const { orgId, clientId1, clientId2, clerkUserId, clerkOrgId } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId1 = await createTestClient(ctx, orgId, {
						companyName: "Client 1",
					});
					const clientId2 = await createTestClient(ctx, orgId, {
						companyName: "Client 2",
					});
					await createTestInvoice(ctx, orgId, clientId1, {
						invoiceNumber: "INV-001",
					});
					await createTestInvoice(ctx, orgId, clientId2, {
						invoiceNumber: "INV-002",
					});
					await createTestInvoice(ctx, orgId, clientId2, {
						invoiceNumber: "INV-003",
					});
					return { orgId, clientId1, clientId2, clerkUserId, clerkOrgId };
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const client2Invoices = await asUser.query(api.invoices.list, {
				clientId: clientId2,
			});
			expect(client2Invoices).toHaveLength(2);
		});
	});

	describe("createFromQuote", () => {
		// Quotes persist discountAmount as the raw input (a percent when discountType
		// is "percentage"); invoices persist it as dollars. Converting at the seam is
		// what keeps a percentage-discounted quote from overbilling the client.
		async function setupApprovedQuote({
			subtotal = 5000,
			...discount
		}: {
			discountEnabled: boolean;
			discountAmount?: number;
			discountType?: "percentage" | "fixed";
			total: number;
			subtotal?: number;
		}) {
			return await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				const quoteId = await ctx.db.insert("quotes", {
					orgId,
					clientId,
					title: "Discounted Quote",
					quoteNumber: `Q-${Date.now()}`,
					status: "approved",
					subtotal,
					taxAmount: 0,
					...discount,
				});

				await ctx.db.insert("quoteLineItems", {
					quoteId,
					orgId,
					description: "Landscaping",
					quantity: 1,
					unit: "item",
					rate: subtotal,
					amount: subtotal,
					sortOrder: 0,
				});

				return { quoteId, clerkUserId, clerkOrgId };
			});
		}

		it("converts a percentage discount into dollars", async () => {
			// 10% off a $5,000 subtotal => $500 off => $4,500 total.
			const { quoteId, clerkUserId, clerkOrgId } = await setupApprovedQuote({
				discountEnabled: true,
				discountAmount: 10,
				discountType: "percentage",
				total: 4500,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId,
			});
			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });

			expect(invoice?.subtotal).toBe(5000);
			// Regression: the raw `10` used to be copied straight through and then
			// subtracted as $10, billing the client $4,990.
			expect(invoice?.discountAmount).toBe(500);
			expect(invoice?.total).toBe(4500);
		});

		it("passes a fixed discount through unchanged", async () => {
			const { quoteId, clerkUserId, clerkOrgId } = await setupApprovedQuote({
				discountEnabled: true,
				discountAmount: 250,
				discountType: "fixed",
				total: 4750,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId,
			});
			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });

			expect(invoice?.discountAmount).toBe(250);
			expect(invoice?.total).toBe(4750);
		});

		it("carries no discount when the quote has none", async () => {
			const { quoteId, clerkUserId, clerkOrgId } = await setupApprovedQuote({
				discountEnabled: false,
				total: 5000,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId,
			});
			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });

			expect(invoice?.discountAmount).toBeUndefined();
			expect(invoice?.total).toBe(5000);
		});

		it("ignores a stale discount left behind by a disabled toggle", async () => {
			// Turning a discount off patches discountEnabled: false but leaves the
			// amount on the doc (`filterUndefined` drops the undefined). Quote totals
			// gate on discountEnabled, so the invoice must too — otherwise the client
			// is billed $4,500 for a quote they approved at $5,000.
			const { quoteId, clerkUserId, clerkOrgId } = await setupApprovedQuote({
				discountEnabled: false,
				discountAmount: 10,
				discountType: "percentage",
				total: 5000,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId,
			});
			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });

			expect(invoice?.discountAmount).toBeUndefined();
			expect(invoice?.total).toBe(5000);
		});

		it("rounds a percentage discount to whole cents", async () => {
			// 12.5% off $333.33 is $41.66625 — an unroundable total can never be paid
			// exactly, and payment validation has no tolerance.
			const { quoteId, clerkUserId, clerkOrgId } = await setupApprovedQuote({
				discountEnabled: true,
				discountAmount: 12.5,
				discountType: "percentage",
				total: 291.66,
				subtotal: 333.33,
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
				quoteId,
			});
			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });

			// `calculateInvoiceTotals` still subtracts without rounding, so `total`
			// keeps binary-float dust. The stored discount is what this seam owns.
			expect(invoice?.discountAmount).toBe(41.67);
			expect(invoice?.total).toBeCloseTo(291.66, 2);
		});
	});

	describe("update", () => {
		// Skip - requires aggregates to be properly initialized via API create
		it.skip("should update invoice fields", async () => {
			// Needs invoice created via API to initialize aggregates
		});
	});

	describe("markPaid", () => {
		// Skip - has schema mismatch with paymentMethod field
		it.skip("should mark invoice as paid", async () => {
			// Needs schema fix for paymentMethod field
		});
	});

	describe("remove", () => {
		// Skip - requires aggregates to be properly initialized via API create
		it.skip("should delete an invoice", async () => {
			// Needs invoice created via API to initialize aggregates
		});
	});

	describe("getStats", () => {
		it("should return correct invoice statistics", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);

				// Create invoices with different statuses
				await createTestInvoice(ctx, orgId, clientId, {
					status: "draft",
					total: 1000,
				});
				await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					total: 2000,
				});
				await createTestInvoice(ctx, orgId, clientId, {
					status: "paid",
					total: 3000,
				});
				await createTestInvoice(ctx, orgId, clientId, {
					status: "overdue",
					total: 4000,
				});

				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.invoices.getStats, {});

			expect(stats.total).toBe(4);
			expect(stats.byStatus.draft).toBe(1);
			expect(stats.byStatus.sent).toBe(1);
			expect(stats.byStatus.paid).toBe(1);
			expect(stats.byStatus.overdue).toBe(1);
		});

		it("should return zero stats for empty organization", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.invoices.getStats, {});

			expect(stats.total).toBe(0);
		});
	});

	describe("getOverdue", () => {
		const DAY_MS = 24 * 60 * 60 * 1000;

		it("should return sent invoices with unpaid payments due in the past", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					dueDate: Date.now() - 7 * DAY_MS,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 1100,
					dueDate: Date.now() - 7 * DAY_MS,
					description: "Full Payment",
					sortOrder: 0,
					status: "pending",
					publicToken: `tok-${Date.now()}`,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(1);
			expect(invoices[0].status).toBe("sent");
		});

		it("should return sent invoices with unpaid payments due within 7 days", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					dueDate: Date.now() + 3 * DAY_MS,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 1100,
					dueDate: Date.now() + 3 * DAY_MS,
					description: "Full Payment",
					sortOrder: 0,
					status: "pending",
					publicToken: `tok-${Date.now()}`,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(1);
		});

		it("should exclude invoices where all payments are paid", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					dueDate: Date.now() - 7 * DAY_MS,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 1100,
					dueDate: Date.now() - 7 * DAY_MS,
					description: "Full Payment",
					sortOrder: 0,
					status: "paid",
					publicToken: `tok-${Date.now()}`,
					paidAt: Date.now(),
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(0);
		});

		it("should exclude invoices with unpaid payments due more than 7 days out", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					dueDate: Date.now() + 14 * DAY_MS,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 1100,
					dueDate: Date.now() + 14 * DAY_MS,
					description: "Full Payment",
					sortOrder: 0,
					status: "pending",
					publicToken: `tok-${Date.now()}`,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(0);
		});

		it("should exclude invoices with status paid, draft, or cancelled", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const pastDue = Date.now() - 7 * DAY_MS;
				for (const status of ["paid", "draft", "cancelled"] as const) {
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						status,
						dueDate: pastDue,
					});
					await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 1100,
						dueDate: pastDue,
						description: "Full Payment",
						sortOrder: 0,
						status: "pending",
						publicToken: `tok-${Date.now()}-${status}`,
					});
				}
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(0);
		});
	});

	describe("organization isolation", () => {
		it("should not return invoices from other organizations", async () => {
			const { clerkUserId1, clerkOrgId1, clerkOrgId2 } = await t.run(
				async (ctx) => {
					// Create first org with an invoice
					const {
						orgId: orgId1,
						clerkUserId,
						clerkOrgId,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});
					const clientId1 = await createTestClient(ctx, orgId1);
					await createTestInvoice(ctx, orgId1, clientId1, {
						invoiceNumber: "ORG1-001",
					});

					// Create second org with an invoice
					const {
						orgId: orgId2,
						clerkUserId: clerkUserId2,
						clerkOrgId: clerkOrgId2,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					await createTestInvoice(ctx, orgId2, clientId2, {
						invoiceNumber: "ORG2-001",
					});

					return {
						clerkUserId1: clerkUserId,
						clerkOrgId1: clerkOrgId,
						clerkOrgId2,
					};
				}
			);

			// User from org 1 should only see org 1's invoices
			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			const invoices = await asUser1.query(api.invoices.list, {});
			expect(invoices).toHaveLength(1);
			expect(invoices[0].invoiceNumber).toBe("ORG1-001");
		});
	});
});
