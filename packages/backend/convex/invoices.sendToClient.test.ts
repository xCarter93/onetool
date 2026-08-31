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

	it("schedules a server-side PDF render when the invoice has no document", async () => {
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });

		const pending = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter(
				(row) =>
					row.name.includes("generateInvoicePdf") &&
					row.state.kind === "pending"
			);
		});
		expect(pending.length).toBe(1);

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const docs = await t.run(async (ctx) =>
			(await ctx.db.query("documents").collect()).filter(
				(d) => d.documentType === "invoice" && d.documentId === invoiceId
			)
		);
		expect(docs.length).toBe(1);
	});

	it("does not schedule a PDF render when the invoice already has one", async () => {
		const { asUser, invoiceId, orgId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-existing"], { type: "application/pdf" })
			);
			await ctx.db.insert("documents", {
				orgId,
				documentType: "invoice",
				documentId: invoiceId,
				storageId,
				generatedAt: Date.now(),
				version: 1,
			});
			// Spell out the freshness this case depends on: the render must post-
			// date the content, or the staleness branch (next test) would fire.
			await ctx.db.patch(invoiceId, { contentUpdatedAt: Date.now() - 1000 });
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });

		const pending = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter((row) => row.name.includes("generateInvoicePdf"));
		});
		expect(pending.length).toBe(0);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	});

	it("schedules a fresh render when the newest PDF predates a content edit", async () => {
		const { asUser, invoiceId, orgId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		// A PDF from before the latest edit — sent-invoice line items stay
		// editable, so this state arises without any revert.
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(
				new Blob(["%PDF-stale"], { type: "application/pdf" })
			);
			await ctx.db.insert("documents", {
				orgId,
				documentType: "invoice",
				documentId: invoiceId,
				storageId,
				generatedAt: 1000,
				version: 1,
			});
			// The edit's touchContent stamp (the seed's raw inserts don't set it).
			await ctx.db.patch(invoiceId, { contentUpdatedAt: Date.now() });
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });

		const pending = await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter((row) => row.name.includes("generateInvoicePdf"));
		});
		expect(pending.length).toBe(1);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
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

	it("mints portal access for a client that has none", async () => {
		const { asUser, invoiceId, clientId } = await seed({
			portalAccess: false,
			contactEmail: "client@example.com",
		});

		await asUser.mutation(api.invoices.sendToClient, { id: invoiceId });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const client = await t.run(async (ctx) => ctx.db.get(clientId));
		expect(client?.portalAccessId).toBeTruthy();
		const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
		expect(invoice?.status).toBe("sent");
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

	it("refuses a custom send without a portal issuer before changing status", async () => {
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		vi.stubEnv("PORTAL_JWT_ISSUER", "");

		try {
			await expect(
				asUser.mutation(api.invoices.sendToClient, {
					id: invoiceId,
					mode: "custom",
					html: "<p>Custom invoice message</p>",
				})
			).rejects.toThrow(/Portal links aren't configured/);

			const invoice = await asUser.query(api.invoices.get, { id: invoiceId });
			expect(invoice?.status).toBe("draft");
			expect(invoice?.firstSentAt).toBeUndefined();
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("backfills a 'Full Payment' row on an invoice that predates create-time seeding", async () => {
		// Without a row the portal can't mint a PaymentIntent, so an invoice old
		// enough to have none still gets one on its way to the client.
		const { asUser, invoiceId } = await seed({
			portalAccess: true,
			contactEmail: "client@example.com",
		});
		await t.run(async (ctx) => {
			for (const row of await ctx.db
				.query("payments")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.collect()) {
				await ctx.db.delete(row._id);
			}
		});

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
		// Replace the create-time row with a custom schedule of the same shape.
		await t.run(async (ctx) => {
			for (const row of await ctx.db
				.query("payments")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
				.collect()) {
				await ctx.db.delete(row._id);
			}
			await ctx.db.insert("payments", {
				orgId,
				invoiceId,
				paymentAmount: 1000,
				dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				description: "Deposit",
				sortOrder: 0,
				status: "pending",
				publicToken: `tok_${Math.random().toString(36).slice(2)}`,
			});
		});

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
