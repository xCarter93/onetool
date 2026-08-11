import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";

// The mobile "share pay link" surface is backend-served: getPortalLink reuses
// buildPortalInvoiceUrl (the invite email's URL builder) so the portal origin
// has one source of truth. getByQuote drives the quote detail's View-invoice
// CTA. Both are thin org-scoped reads — the tests pin their contracts.
process.env.PORTAL_JWT_ISSUER =
	process.env.PORTAL_JWT_ISSUER ?? "https://portal.example.com";

describe("invoices.getPortalLink / invoices.getByQuote", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed(opts: { portalAccess: boolean }) {
		const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			if (opts.portalAccess) {
				await ctx.db.patch(clientId, { portalAccessId: "portal-abc-123" });
			}
			return { clientId, clerkUserId, clerkOrgId };
		});
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const now = Date.now();
		// Create via API so invoice aggregates initialize.
		const invoiceId = await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: "INV-PORTAL-1",
			subtotal: 250,
			total: 250,
			status: "draft",
			issuedDate: now,
			dueDate: now + 30 * 24 * 60 * 60 * 1000,
		});
		return { asUser, invoiceId, clientId };
	}

	it("returns the canonical portal URL when the client has portal access", async () => {
		const { asUser, invoiceId } = await seed({ portalAccess: true });
		const url = await asUser.query(api.invoices.getPortalLink, {
			id: invoiceId,
		});
		expect(url).toBe(
			`https://portal.example.com/portal/c/portal-abc-123/invoices/${invoiceId}`
		);
	});

	it("returns null when the client has no portal access", async () => {
		const { asUser, invoiceId } = await seed({ portalAccess: false });
		const url = await asUser.query(api.invoices.getPortalLink, {
			id: invoiceId,
		});
		expect(url).toBeNull();
	});

	it("throws for a caller from another org", async () => {
		const { invoiceId } = await seed({ portalAccess: true });
		const { otherUserId, otherOrgId } = await t.run(async (ctx) => {
			const { clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
				clerkUserId: "user_other_org",
				clerkOrgId: "org_other_org",
			});
			return { otherUserId: clerkUserId, otherOrgId: clerkOrgId };
		});
		const asOther = t.withIdentity(createTestIdentity(otherUserId, otherOrgId));
		await expect(
			asOther.query(api.invoices.getPortalLink, { id: invoiceId })
		).rejects.toThrow();
	});

	it("getByQuote returns null before conversion and the invoice after", async () => {
		const { clientId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			return { clientId, clerkUserId, clerkOrgId };
		});
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		const quoteId = await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Convertible",
			status: "approved",
			subtotal: 100,
			total: 100,
		});

		expect(
			await asUser.query(api.invoices.getByQuote, { quoteId })
		).toBeNull();

		const invoiceId = await asUser.mutation(api.invoices.createFromQuote, {
			quoteId,
		});
		expect(
			await asUser.query(api.invoices.getByQuote, { quoteId })
		).toEqual({ _id: invoiceId });
	});
});
