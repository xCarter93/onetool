import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";
import { generatePublicToken } from "./lib/shared";

// When an invoice is marked paid outside the portal (cash/check), the workspace
// mutations must settle its outstanding installment rows so the portal reflects
// the payment as completed and never offers a Pay button on a paid invoice.
describe("invoices mark-paid reconciliation", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seedInvoiceWithPendingPayment() {
		const { orgId, clientId, contactId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				const contactId = await createTestClientContact(ctx, orgId, clientId, {
					isPrimary: true,
					email: "client@example.com",
				});
				return { orgId, clientId, contactId, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const now = Date.now();
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-001",
			subtotal: 1000,
			total: 1000,
			status: "sent",
			issuedDate: now,
			dueDate: now + 30 * 24 * 60 * 60 * 1000,
		});

		// Seed the installment row the portal reads (mirrors createFromQuote's
		// default "Full Payment" row).
		const paymentId = await t.run(async (ctx) =>
			ctx.db.insert("payments", {
				orgId,
				invoiceId,
				paymentAmount: 1000,
				dueDate: now + 30 * 24 * 60 * 60 * 1000,
				description: "Full Payment",
				sortOrder: 0,
				status: "pending",
				publicToken: generatePublicToken(),
			})
		);

		return { asUser, orgId, clientId, contactId, invoiceId, paymentId };
	}

	it("markPaid settles outstanding rows and tags them recordedOutsidePortal", async () => {
		const { asUser, invoiceId, paymentId } =
			await seedInvoiceWithPendingPayment();

		await asUser.mutation(api.invoices.markPaid, { id: invoiceId });

		const payment = await t.run(async (ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.recordedOutsidePortal).toBe(true);
		expect(payment?.paidAt).toBeTypeOf("number");
	});

	it("update({status:paid}) also settles outstanding rows", async () => {
		const { asUser, invoiceId, paymentId } =
			await seedInvoiceWithPendingPayment();

		await asUser.mutation(api.invoices.update, {
			id: invoiceId,
			status: "paid",
		});

		const payment = await t.run(async (ctx) => ctx.db.get(paymentId));
		expect(payment?.status).toBe("paid");
		expect(payment?.recordedOutsidePortal).toBe(true);
	});

	it("portal offers a payable target before paid, and none after", async () => {
		const { asUser, orgId, contactId, invoiceId } =
			await seedInvoiceWithPendingPayment();

		// Payable while outstanding.
		const target = await t.query(
			internal.portal.invoices._getPaymentTargetInternal,
			{
				invoiceId,
				sessionClientContactId: contactId,
				sessionOrgId: orgId,
			}
		);
		expect(target.payment.paymentAmount).toBe(1000);

		await asUser.mutation(api.invoices.markPaid, { id: invoiceId });

		// Paid invoice is never payable.
		await expect(
			t.query(internal.portal.invoices._getPaymentTargetInternal, {
				invoiceId,
				sessionClientContactId: contactId,
				sessionOrgId: orgId,
			})
		).rejects.toThrow(/NO_ACTIVE_PAYMENT/);
	});
});
