import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestInvoice,
	createTestIdentity,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

describe("Payments", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// ============================================================================
	// Payment CRUD Operations
	// ============================================================================

	describe("create", () => {
		it("should create a payment with valid data", async () => {
			const { orgId, clientId, invoiceId, clerkUserId, clerkOrgId } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						total: 1000,
					});
					return { orgId, clientId, invoiceId, clerkUserId, clerkOrgId };
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			const paymentId = await asUser.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 500,
				dueDate,
				description: "Deposit",
				sortOrder: 0,
			});

			expect(paymentId).toBeDefined();

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment).toMatchObject({
				invoiceId,
				orgId,
				paymentAmount: 500,
				description: "Deposit",
				sortOrder: 0,
				status: "pending",
			});
			expect(payment?.publicToken).toBeDefined();
		});

		it("should create a payment without description", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			const paymentId = await asUser.mutation(api.payments.create, {
				invoiceId,
				paymentAmount: 1000,
				dueDate,
				sortOrder: 0,
			});

			expect(paymentId).toBeDefined();

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment?.description).toBeUndefined();
		});

		it("should reject payment with zero amount", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			await expect(
				asUser.mutation(api.payments.create, {
					invoiceId,
					paymentAmount: 0,
					dueDate,
					sortOrder: 0,
				})
			).rejects.toThrowError("Payment amount must be positive");
		});

		it("should reject payment with negative amount", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			await expect(
				asUser.mutation(api.payments.create, {
					invoiceId,
					paymentAmount: -100,
					dueDate,
					sortOrder: 0,
				})
			).rejects.toThrowError("Payment amount must be positive");
		});

		it("should reject negative sort order", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			await expect(
				asUser.mutation(api.payments.create, {
					invoiceId,
					paymentAmount: 500,
					dueDate,
					sortOrder: -1,
				})
			).rejects.toThrowError("Sort order cannot be negative");
		});
	});

	describe("update", () => {
		it("should update a non-paid payment", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.payments.update, {
				id: paymentId,
				paymentAmount: 600,
				description: "Updated description",
				status: "sent",
			});

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment).toMatchObject({
				paymentAmount: 600,
				description: "Updated description",
				status: "sent",
			});
		});

		it("should reject update on paid payment", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now(),
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.payments.update, {
					id: paymentId,
					paymentAmount: 600,
				})
			).rejects.toThrowError("Cannot update a paid payment");
		});

		it("should reject update with zero amount", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.payments.update, {
					id: paymentId,
					paymentAmount: 0,
				})
			).rejects.toThrowError("Payment amount must be positive");
		});

		it("should reject update with no changes", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.payments.update, {
					id: paymentId,
				})
			).rejects.toThrowError("No valid updates provided");
		});
	});

	describe("remove", () => {
		it("should delete a non-paid payment", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = await asUser.mutation(api.payments.remove, {
				id: paymentId,
			});

			expect(result).toBe(paymentId);

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment).toBeNull();
		});

		it("should reject deletion of paid payment", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now(),
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.payments.remove, { id: paymentId })
			).rejects.toThrowError("Cannot delete a paid payment");
		});
	});

	// ============================================================================
	// Payments Sum Validation (configurePayments)
	// ============================================================================

	describe("configurePayments", () => {
		it("should accept when sum equals invoice total", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			const paymentIds = await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 300, dueDate, sortOrder: 0, description: "Deposit" },
					{ paymentAmount: 700, dueDate, sortOrder: 1, description: "Final" },
				],
			});

			expect(paymentIds).toHaveLength(2);

			const payments = await asUser.query(api.payments.listByInvoice, {
				invoiceId,
			});
			expect(payments).toHaveLength(2);

			const totalAmount = payments.reduce(
				(sum, p) => sum + p.paymentAmount,
				0
			);
			expect(totalAmount).toBe(1000);
		});

		it("should reject when sum is less than invoice total", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ paymentAmount: 300, dueDate, sortOrder: 0 },
						{ paymentAmount: 500, dueDate, sortOrder: 1 },
					],
				})
			).rejects.toThrowError(/Payment amounts must equal invoice total/);
		});

		it("should reject when sum is greater than invoice total", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ paymentAmount: 600, dueDate, sortOrder: 0 },
						{ paymentAmount: 600, dueDate, sortOrder: 1 },
					],
				})
			).rejects.toThrowError(/Payment amounts must equal invoice total/);
		});

		it("should handle floating point precision correctly", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				// Create invoice with a total that could cause floating point issues
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 99.99,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			// 33.33 + 33.33 + 33.33 = 99.99 (potential floating point issue)
			const paymentIds = await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 33.33, dueDate, sortOrder: 0 },
					{ paymentAmount: 33.33, dueDate, sortOrder: 1 },
					{ paymentAmount: 33.33, dueDate, sortOrder: 2 },
				],
			});

			expect(paymentIds).toHaveLength(3);
		});

		it("should reject zero-amount payments in configuration", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			await expect(
				asUser.mutation(api.payments.configurePayments, {
					invoiceId,
					payments: [
						{ paymentAmount: 1000, dueDate, sortOrder: 0 },
						{ paymentAmount: 0, dueDate, sortOrder: 1 },
					],
				})
			).rejects.toThrowError("All payment amounts must be positive");
		});

		it("should preserve paid payments when reconfiguring", async () => {
			const { invoiceId, orgId, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						total: 1000,
					});

					// Create an existing paid payment
					await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 300,
						dueDate: Date.now(),
						sortOrder: 0,
						status: "paid",
						paidAt: Date.now(),
						publicToken: `token_paid_${Date.now()}`,
					});

					return { invoiceId, orgId, clerkUserId, clerkOrgId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			// Configure new payments for remaining amount (1000 - 300 = 700)
			const paymentIds = await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 400, dueDate, sortOrder: 1 },
					{ paymentAmount: 300, dueDate, sortOrder: 2 },
				],
			});

			expect(paymentIds).toHaveLength(3); // 1 paid + 2 new

			const payments = await asUser.query(api.payments.listByInvoice, {
				invoiceId,
			});
			expect(payments).toHaveLength(3);

			const paidPayments = payments.filter((p) => p.status === "paid");
			expect(paidPayments).toHaveLength(1);
			expect(paidPayments[0].paymentAmount).toBe(300);
		});

		it("should replace unpaid payments when reconfiguring", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				// Create existing unpaid payments
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 250,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: `token_1_${Date.now()}`,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 250,
					dueDate: Date.now(),
					sortOrder: 1,
					status: "sent",
					publicToken: `token_2_${Date.now()}`,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 2,
					status: "pending",
					publicToken: `token_3_${Date.now()}`,
				});

				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;

			// Reconfigure with different split
			await asUser.mutation(api.payments.configurePayments, {
				invoiceId,
				payments: [
					{ paymentAmount: 500, dueDate, sortOrder: 0 },
					{ paymentAmount: 500, dueDate, sortOrder: 1 },
				],
			});

			const payments = await asUser.query(api.payments.listByInvoice, {
				invoiceId,
			});
			expect(payments).toHaveLength(2);
			expect(payments[0].paymentAmount).toBe(500);
			expect(payments[1].paymentAmount).toBe(500);
		});
	});

	// ============================================================================
	// Payment Flow
	// ============================================================================

	describe("listByInvoice", () => {
		it("should return payments sorted by sortOrder", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				// Insert payments out of order
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 300,
					dueDate: Date.now(),
					description: "Third",
					sortOrder: 2,
					status: "pending",
					publicToken: `token_3_${Date.now()}`,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 200,
					dueDate: Date.now(),
					description: "First",
					sortOrder: 0,
					status: "pending",
					publicToken: `token_1_${Date.now()}`,
				});
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					description: "Second",
					sortOrder: 1,
					status: "pending",
					publicToken: `token_2_${Date.now()}`,
				});

				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const payments = await asUser.query(api.payments.listByInvoice, {
				invoiceId,
			});

			expect(payments).toHaveLength(3);
			expect(payments[0].description).toBe("First");
			expect(payments[1].description).toBe("Second");
			expect(payments[2].description).toBe("Third");
		});

		it("should return empty array when no payments exist", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);
				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const payments = await asUser.query(api.payments.listByInvoice, {
				invoiceId,
			});

			expect(payments).toEqual([]);
		});
	});

	describe("getByPublicToken", () => {
		it("should return payment with invoice and org context", async () => {
			const { paymentToken, invoiceNumber, orgName } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
						orgName: "Test Business LLC",
					});
					const clientId = await createTestClient(ctx, orgId);
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						invoiceNumber: "INV-12345",
						total: 1000,
					});

					const paymentToken = `public_token_${Date.now()}`;
					await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 500,
						dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
						description: "Deposit",
						sortOrder: 0,
						status: "pending",
						publicToken: paymentToken,
					});

					return { paymentToken, invoiceNumber: "INV-12345", orgName: "Test Business LLC" };
				}
			);

			// No authentication required for public token access
			const result = await t.query(api.payments.getByPublicToken, {
				publicToken: paymentToken,
			});

			expect(result).not.toBeNull();
			expect(result?.payment.publicToken).toBe(paymentToken);
			expect(result?.payment.paymentAmount).toBe(500);
			expect(result?.payment.status).toBe("pending");
			expect(result?.invoice.invoiceNumber).toBe(invoiceNumber);
			expect(result?.invoice.total).toBe(1000);
			expect(result?.org?.name).toBe(orgName);
			expect(result?.paymentContext.paymentNumber).toBe(1);
			expect(result?.paymentContext.totalPayments).toBe(1);
		});

		it("should return null for non-existent token", async () => {
			const result = await t.query(api.payments.getByPublicToken, {
				publicToken: "non_existent_token",
			});

			expect(result).toBeNull();
		});

		it("should include payment context with multiple payments", async () => {
			const { paymentToken2 } = await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 300,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now(),
					publicToken: `token_1_${Date.now()}`,
				});

				const paymentToken2 = `token_2_${Date.now()}`;
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 400,
					dueDate: Date.now(),
					sortOrder: 1,
					status: "pending",
					publicToken: paymentToken2,
				});

				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 300,
					dueDate: Date.now(),
					sortOrder: 2,
					status: "pending",
					publicToken: `token_3_${Date.now()}`,
				});

				return { paymentToken2 };
			});

			const result = await t.query(api.payments.getByPublicToken, {
				publicToken: paymentToken2,
			});

			expect(result?.paymentContext.paymentNumber).toBe(2);
			expect(result?.paymentContext.totalPayments).toBe(3);
			expect(result?.paymentContext.totalPaid).toBe(300);
			expect(result?.paymentContext.totalRemaining).toBe(700);
		});
	});

	describe("markPaidByPublicToken", () => {
		it("should mark payment as paid", async () => {
			const { paymentToken, paymentId } = await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				const paymentToken = `token_${Date.now()}`;
				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 1000,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: paymentToken,
				});

				return { paymentToken, paymentId };
			});

			// No authentication required
			const result = await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken: paymentToken,
				stripeSessionId: "cs_test_123",
				stripePaymentIntentId: "pi_test_123",
			});

			expect(result).toBe(paymentId);

			// Verify payment is marked as paid
			const payment = await t.run(async (ctx) => {
				return await ctx.db.get(paymentId);
			});

			expect(payment?.status).toBe("paid");
			expect(payment?.paidAt).toBeDefined();
			expect(payment?.stripeSessionId).toBe("cs_test_123");
			expect(payment?.stripePaymentIntentId).toBe("pi_test_123");
		});

		it("should be idempotent when payment is already paid", async () => {
			const { paymentToken, paymentId, originalPaidAt } = await t.run(
				async (ctx) => {
					const { orgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						total: 1000,
					});

					const paymentToken = `token_${Date.now()}`;
					const originalPaidAt = Date.now() - 1000;
					const paymentId = await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 1000,
						dueDate: Date.now(),
						sortOrder: 0,
						status: "paid",
						paidAt: originalPaidAt,
						publicToken: paymentToken,
						stripeSessionId: "cs_original",
						stripePaymentIntentId: "pi_original",
					});

					return { paymentToken, paymentId, originalPaidAt };
				}
			);

			// Should not throw, should return success
			const result = await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken: paymentToken,
				stripeSessionId: "cs_new",
				stripePaymentIntentId: "pi_new",
			});

			expect(result).toBe(paymentId);

			// Verify original data is preserved
			const payment = await t.run(async (ctx) => {
				return await ctx.db.get(paymentId);
			});

			expect(payment?.stripeSessionId).toBe("cs_original");
			expect(payment?.paidAt).toBe(originalPaidAt);
		});

		it("should auto-update invoice status when all payments are paid", async () => {
			const { paymentToken2, invoiceId } = await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
					status: "sent",
				});

				// First payment already paid
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now(),
					publicToken: `token_1_${Date.now()}`,
				});

				// Second payment pending
				const paymentToken2 = `token_2_${Date.now()}`;
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 1,
					status: "pending",
					publicToken: paymentToken2,
				});

				return { paymentToken2, invoiceId };
			});

			// Mark second payment as paid
			await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken: paymentToken2,
				stripeSessionId: "cs_test",
				stripePaymentIntentId: "pi_test",
			});

			// Verify invoice is marked as paid
			const invoice = await t.run(async (ctx) => {
				return await ctx.db.get(invoiceId);
			});

			expect(invoice?.status).toBe("paid");
			expect(invoice?.paidAt).toBeDefined();
		});

		it("should not update invoice status when some payments remain unpaid", async () => {
			const { paymentToken1, invoiceId } = await t.run(async (ctx) => {
				const { orgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
					status: "sent",
				});

				const paymentToken1 = `token_1_${Date.now()}`;
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: paymentToken1,
				});

				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 1,
					status: "pending",
					publicToken: `token_2_${Date.now()}`,
				});

				return { paymentToken1, invoiceId };
			});

			// Mark only first payment as paid
			await t.mutation(internal.payments.markPaidByPublicTokenInternal, {
				publicToken: paymentToken1,
				stripeSessionId: "cs_test",
				stripePaymentIntentId: "pi_test",
			});

			// Verify invoice is still sent, not paid
			const invoice = await t.run(async (ctx) => {
				return await ctx.db.get(invoiceId);
			});

			expect(invoice?.status).toBe("sent");
		});

		it("should throw error for non-existent token", async () => {
			await expect(
				t.mutation(internal.payments.markPaidByPublicTokenInternal, {
					publicToken: "non_existent_token",
					stripeSessionId: "cs_test",
					stripePaymentIntentId: "pi_test",
				})
			).rejects.toThrowError("Payment not found");
		});
	});

	describe("createDefaultPayment", () => {
		it("should create single payment for full invoice amount", async () => {
			const { invoiceId, clerkUserId, clerkOrgId, invoiceTotal, invoiceDueDate } =
				await t.run(async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						total: 1500,
						dueDate,
					});
					return {
						invoiceId,
						clerkUserId,
						clerkOrgId,
						invoiceTotal: 1500,
						invoiceDueDate: dueDate,
					};
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const paymentId = await asUser.mutation(api.payments.createDefaultPayment, {
				invoiceId,
			});

			expect(paymentId).toBeDefined();

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment).toMatchObject({
				paymentAmount: invoiceTotal,
				dueDate: invoiceDueDate,
				description: "Full Payment",
				sortOrder: 0,
				status: "pending",
			});
		});

		it("should throw error if payments already exist", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				// Create an existing payment
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 1000,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.payments.createDefaultPayment, { invoiceId })
			).rejects.toThrowError("Payments already exist for this invoice");
		});
	});

	describe("getInvoiceSummary", () => {
		it("should return correct payment summary", async () => {
			const { invoiceId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
					total: 1000,
				});

				// Create mix of paid and pending payments
				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 300,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now(),
					publicToken: `token_1_${Date.now()}`,
				});

				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 400,
					dueDate: Date.now(),
					sortOrder: 1,
					status: "sent",
					publicToken: `token_2_${Date.now()}`,
				});

				await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 300,
					dueDate: Date.now(),
					sortOrder: 2,
					status: "pending",
					publicToken: `token_3_${Date.now()}`,
				});

				return { invoiceId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const summary = await asUser.query(api.payments.getInvoiceSummary, {
				invoiceId,
			});

			expect(summary).toMatchObject({
				totalPayments: 3,
				paidCount: 1,
				pendingCount: 2,
				paidAmount: 300,
				remainingAmount: 700,
				invoiceTotal: 1000,
			});
		});
	});

	// ============================================================================
	// Organization Isolation
	// ============================================================================

	describe("organization isolation", () => {
		it("should not access payments from other organizations", async () => {
			const { paymentId2, clerkUserId1, clerkOrgId1 } = await t.run(
				async (ctx) => {
					// Create first org with a payment
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
					await ctx.db.insert("payments", {
						orgId: orgId1,
						invoiceId: invoiceId1,
						paymentAmount: 500,
						dueDate: Date.now(),
						sortOrder: 0,
						status: "pending",
						publicToken: `token_org1_${Date.now()}`,
					});

					// Create second org with a payment
					const { orgId: orgId2 } = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					const invoiceId2 = await createTestInvoice(ctx, orgId2, clientId2);
					const paymentId2 = await ctx.db.insert("payments", {
						orgId: orgId2,
						invoiceId: invoiceId2,
						paymentAmount: 700,
						dueDate: Date.now(),
						sortOrder: 0,
						status: "pending",
						publicToken: `token_org2_${Date.now()}`,
					});

					return { paymentId2, clerkUserId1, clerkOrgId1 };
				}
			);

			// User from org 1 should not be able to access org 2's payment
			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			await expect(
				asUser1.query(api.payments.get, { id: paymentId2 })
			).rejects.toThrowError("Payment does not belong to your organization");
		});

		it("should not update payments from other organizations", async () => {
			const { paymentId2, clerkUserId1, clerkOrgId1 } = await t.run(
				async (ctx) => {
					// Create first org
					const {
						orgId: orgId1,
						clerkUserId: clerkUserId1,
						clerkOrgId: clerkOrgId1,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});

					// Create second org with a payment
					const { orgId: orgId2 } = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					const invoiceId2 = await createTestInvoice(ctx, orgId2, clientId2);
					const paymentId2 = await ctx.db.insert("payments", {
						orgId: orgId2,
						invoiceId: invoiceId2,
						paymentAmount: 700,
						dueDate: Date.now(),
						sortOrder: 0,
						status: "pending",
						publicToken: `token_org2_${Date.now()}`,
					});

					return { paymentId2, clerkUserId1, clerkOrgId1 };
				}
			);

			// User from org 1 should not be able to update org 2's payment
			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			await expect(
				asUser1.mutation(api.payments.update, {
					id: paymentId2,
					paymentAmount: 800,
				})
			).rejects.toThrowError("Payment does not belong to your organization");
		});

		it("should not list payments from other organizations via invoice", async () => {
			const { invoiceId2, clerkUserId1, clerkOrgId1 } = await t.run(
				async (ctx) => {
					// Create first org
					const {
						orgId: orgId1,
						clerkUserId: clerkUserId1,
						clerkOrgId: clerkOrgId1,
					} = await createTestOrg(ctx, {
						clerkUserId: "user_1",
						clerkOrgId: "org_1",
					});

					// Create second org with an invoice and payment
					const { orgId: orgId2 } = await createTestOrg(ctx, {
						clerkUserId: "user_2",
						clerkOrgId: "org_2",
					});
					const clientId2 = await createTestClient(ctx, orgId2);
					const invoiceId2 = await createTestInvoice(ctx, orgId2, clientId2);
					await ctx.db.insert("payments", {
						orgId: orgId2,
						invoiceId: invoiceId2,
						paymentAmount: 700,
						dueDate: Date.now(),
						sortOrder: 0,
						status: "pending",
						publicToken: `token_org2_${Date.now()}`,
					});

					return { invoiceId2, clerkUserId1, clerkOrgId1 };
				}
			);

			// User from org 1 should not be able to list payments for org 2's invoice
			const asUser1 = t.withIdentity(
				createTestIdentity(clerkUserId1, clerkOrgId1)
			);

			await expect(
				asUser1.query(api.payments.listByInvoice, { invoiceId: invoiceId2 })
			).rejects.toThrowError("Invoice does not belong to your organization");
		});
	});

	// ============================================================================
	// Status Transitions
	// ============================================================================

	describe("status transitions", () => {
		it("should mark payment as sent", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.payments.markAsSent, { id: paymentId });

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment?.status).toBe("sent");
		});

		it("should mark payment as overdue", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now() - 1000, // Past due date
					sortOrder: 0,
					status: "sent",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.payments.markAsOverdue, { id: paymentId });

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment?.status).toBe("overdue");
		});

		it("should cancel a payment", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "pending",
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.payments.cancel, { id: paymentId });

			const payment = await asUser.query(api.payments.get, { id: paymentId });
			expect(payment?.status).toBe("cancelled");
		});

		it("should not allow status changes on paid payments", async () => {
			const { paymentId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const invoiceId = await createTestInvoice(ctx, orgId, clientId);

				const paymentId = await ctx.db.insert("payments", {
					orgId,
					invoiceId,
					paymentAmount: 500,
					dueDate: Date.now(),
					sortOrder: 0,
					status: "paid",
					paidAt: Date.now(),
					publicToken: `token_${Date.now()}`,
				});

				return { paymentId, clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.payments.markAsSent, { id: paymentId })
			).rejects.toThrowError("Cannot send a paid payment");

			await expect(
				asUser.mutation(api.payments.markAsOverdue, { id: paymentId })
			).rejects.toThrowError("Cannot mark a paid payment as overdue");

			await expect(
				asUser.mutation(api.payments.cancel, { id: paymentId })
			).rejects.toThrowError("Cannot cancel a paid payment");
		});
	});

	// ============================================================================
	// Reorder Payments
	// ============================================================================

	describe("reorder", () => {
		it("should reorder payments correctly", async () => {
			const { invoiceId, paymentIds, clerkUserId, clerkOrgId } = await t.run(
				async (ctx) => {
					const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, orgId);
					const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
						total: 1000,
					});

					const paymentId1 = await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 300,
						dueDate: Date.now(),
						description: "First",
						sortOrder: 0,
						status: "pending",
						publicToken: `token_1_${Date.now()}`,
					});

					const paymentId2 = await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 400,
						dueDate: Date.now(),
						description: "Second",
						sortOrder: 1,
						status: "pending",
						publicToken: `token_2_${Date.now()}`,
					});

					const paymentId3 = await ctx.db.insert("payments", {
						orgId,
						invoiceId,
						paymentAmount: 300,
						dueDate: Date.now(),
						description: "Third",
						sortOrder: 2,
						status: "pending",
						publicToken: `token_3_${Date.now()}`,
					});

					return {
						invoiceId,
						paymentIds: [paymentId1, paymentId2, paymentId3],
						clerkUserId,
						clerkOrgId,
					};
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Reorder: Third, First, Second
			await asUser.mutation(api.payments.reorder, {
				invoiceId,
				paymentIds: [paymentIds[2], paymentIds[0], paymentIds[1]],
			});

			const payments = await asUser.query(api.payments.listByInvoice, {
				invoiceId,
			});

			expect(payments[0].description).toBe("Third");
			expect(payments[0].sortOrder).toBe(0);
			expect(payments[1].description).toBe("First");
			expect(payments[1].sortOrder).toBe(1);
			expect(payments[2].description).toBe("Second");
			expect(payments[2].sortOrder).toBe(2);
		});
	});
});
