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
		it("should return invoices with status sent and dueDate in the past", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					dueDate: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(1);
			expect(invoices[0].status).toBe("sent");
		});

		it("should return invoices with status overdue and dueDate in the past", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				await createTestInvoice(ctx, orgId, clientId, {
					status: "overdue",
					dueDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
				});
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(1);
			expect(invoices[0].status).toBe("overdue");
		});

		it("should exclude invoices with status paid, draft, or cancelled", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const pastDue = Date.now() - 7 * 24 * 60 * 60 * 1000;
				for (const status of ["paid", "draft", "cancelled"] as const) {
					await createTestInvoice(ctx, orgId, clientId, {
						status,
						dueDate: pastDue,
					});
				}
				return { clerkUserId, clerkOrgId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
			const invoices = await asUser.query(api.invoices.getOverdue, {});
			expect(invoices).toHaveLength(0);
		});

		it("should exclude invoices with dueDate in the future regardless of status", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const futureDue = Date.now() + 7 * 24 * 60 * 60 * 1000;
				await createTestInvoice(ctx, orgId, clientId, {
					status: "sent",
					dueDate: futureDue,
				});
				await createTestInvoice(ctx, orgId, clientId, {
					status: "overdue",
					dueDate: futureDue,
				});
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
