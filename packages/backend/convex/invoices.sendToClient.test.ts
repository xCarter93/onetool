import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";

// sendToClient schedules a fire-and-forget email action. The action short-
// circuits on this sentinel before touching the Resend component (unregistered
// in tests); PORTAL_JWT_ISSUER feeds the portal deep-link it builds first.
process.env.RESEND_API_KEY = "test-key";
process.env.PORTAL_JWT_ISSUER =
	process.env.PORTAL_JWT_ISSUER ?? "https://portal.example.com";

// invoices.sendToClient flips draft→sent and schedules the portal-invite email.
// Tests assert the mutation's contract (recipient guards + status transition);
// the scheduled email action is drained to a guarded no-op so it can't leak a
// post-transaction write.
describe("invoices.sendToClient", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seed(opts: {
		portalAccess: boolean;
		contactEmail?: string | null;
		status?: "draft" | "sent" | "paid" | "cancelled";
	}) {
		const { orgId, clientId, clerkUserId, clerkOrgId } = await t.run(
			async (ctx) => {
				const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, orgId);
				if (opts.portalAccess) {
					await ctx.db.patch(clientId, { portalAccessId: "portal-abc-123" });
				}
				if (opts.contactEmail !== undefined) {
					await createTestClientContact(ctx, orgId, clientId, {
						isPrimary: true,
						email: opts.contactEmail ?? undefined,
					});
				}
				return { orgId, clientId, clerkUserId, clerkOrgId };
			}
		);

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const now = Date.now();
		// Create via API so invoice aggregates initialize.
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-001",
			subtotal: 1000,
			total: 1000,
			status: opts.status ?? "draft",
			issuedDate: now,
			dueDate: now + 30 * 24 * 60 * 60 * 1000,
		});
		return { asUser, invoiceId, orgId, clientId };
	}

	it("flips a draft invoice to sent", async () => {
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		// Drain the scheduled email action (guarded no-op) inside the harness so
		// it doesn't write to _scheduled_functions after the test transaction.
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("sent");
	});

	it("re-sends an already-sent invoice without changing status", async () => {
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
			status: "sent",
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("sent");
	});

	it("throws when the client has no portal access", async () => {
		const { asUser, invoiceId } = await seed({
			portalAccess: false,
			contactEmail: "client@example.com",
		});

		await expect(
			asUser.mutation(api.invoices.sendToClient, { id: invoiceId })
		).rejects.toThrow(/portal access/i);
	});

	it("throws when the primary contact has no email", async () => {
		// Empty string models a primary contact row that exists but has no email
		// (the test helper substitutes a default when email is undefined).
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "",
		});

		await expect(
			asUser.mutation(api.invoices.sendToClient, { id: invoiceId })
		).rejects.toThrow(/email/i);
	});

	it("seeds a 'Full Payment' row when a manual invoice has none, so it is portal-payable", async () => {
		// invoices.create adds no payment rows (unlike createFromQuote). Without a
		// row the portal can't mint a PaymentIntent, so sendToClient backfills one.
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});

		const before = await t.run(async (ctx) =>
			(await ctx.db.query("payments").collect()).filter(
				(p) => p.invoiceId === invoiceId
			)
		);
		expect(before.length).toBe(0);

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const after = await t.run(async (ctx) =>
			(await ctx.db.query("payments").collect()).filter(
				(p) => p.invoiceId === invoiceId
			)
		);
		expect(after.length).toBe(1);
		expect(after[0]!.paymentAmount).toBe(1000);
		expect(after[0]!.description).toBe("Full Payment");
		expect(after[0]!.status).toBe("pending");
	});

	it("does not add a second row when the invoice already has one", async () => {
		const { asUser, invoiceId, orgId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		// Seed an existing installment row.
		await t.run(async (ctx) =>
			ctx.db.insert("payments", {
				orgId,
				invoiceId,
				paymentAmount: 1000,
				dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				description: "Deposit",
				sortOrder: 0,
				status: "pending",
				publicToken: `tok_${Math.random().toString(36).slice(2)}`,
			})
		);

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const rows = await t.run(async (ctx) =>
			(await ctx.db.query("payments").collect()).filter(
				(p) => p.invoiceId === invoiceId
			)
		);
		expect(rows.length).toBe(1);
		expect(rows[0]!.description).toBe("Deposit");
	});

	it("refuses to send a paid invoice", async () => {
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
			status: "paid",
		});

		await expect(
			asUser.mutation(api.invoices.sendToClient, { id: invoiceId })
		).rejects.toThrow(/paid/i);
	});
});
