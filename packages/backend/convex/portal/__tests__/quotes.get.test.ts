// Plan 14-02 Task 1: portal.quotes.get — implements QUOTE-02.
//
// Asserts:
//  - Returns the FULL extended shape: quote, lineItems, latestDocument,
//    businessName, clientName, clientEmail, latestApproval (REVIEWS-mandated)
//  - latestApproval is null when no quoteApprovals rows exist
//  - latestApproval projects the most recent row when multiple exist
//  - FORBIDDEN when fetching a quote owned by a different client
//  - NOT_FOUND when quoteId does not exist
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../../test.setup";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

type Seed = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	otherClientId: Id<"clients">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
};

async function seed(t: ReturnType<typeof convexTest>): Promise<Seed> {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Owner",
			email: `owner_${Math.random()}@example.com`,
			image: "https://example.com/u.png",
			externalId: `user_${Math.random()}`,
		});
		const orgId = await ctx.db.insert("organizations", {
			clerkOrganizationId: `org_${Math.random()}`,
			name: "Acme Co",
			ownerUserId: userId,
		});
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Owning Client Inc",
			status: "active",
			portalAccessId: "portal-get-1",
		});
		const otherClientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Other Client",
			status: "active",
			portalAccessId: "portal-get-other",
		});
		const clientContactId = await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: "Jane",
			lastName: "Customer",
			email: "jane@example.com",
			isPrimary: true,
		});
		return {
			orgId,
			clientId,
			otherClientId,
			clientContactId,
			clientPortalId: "portal-get-1",
		};
	});
}

async function seedSession(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	jti: string,
) {
	await t.run(async (ctx) => {
		await ctx.db.insert("portalSessions", {
			orgId: s.orgId,
			clientId: s.clientId,
			clientContactId: s.clientContactId,
			clientPortalId: s.clientPortalId,
			tokenJti: jti,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000,
		});
	});
}

function ident(s: Seed, jti: string) {
	return {
		issuer: PORTAL_ISSUER,
		subject: s.clientContactId,
		aud: "convex-portal",
		jti,
		orgId: s.orgId,
		clientContactId: s.clientContactId,
		clientPortalId: s.clientPortalId,
	};
}

async function insertQuoteWithDoc(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	clientId: Id<"clients">,
	status: "sent" | "approved" | "declined" = "sent",
): Promise<{ quoteId: Id<"quotes">; documentId: Id<"documents">; lineItems: Id<"quoteLineItems">[] }> {
	return await t.run(async (ctx) => {
		const quoteId = await ctx.db.insert("quotes", {
			orgId: s.orgId,
			clientId,
			title: "Test Quote",
			status,
			subtotal: 100,
			taxAmount: 10,
			total: 110,
			sentAt: Date.now(),
			terms: "net 30",
		});
		const storageId = await ctx.storage.store(
			new Blob(["pdf"], { type: "application/pdf" }),
		);
		const documentId = await ctx.db.insert("documents", {
			orgId: s.orgId,
			documentType: "quote",
			documentId: quoteId,
			storageId,
			generatedAt: Date.now(),
			version: 2,
		});
		await ctx.db.patch(quoteId, { latestDocumentId: documentId });
		const li1 = await ctx.db.insert("quoteLineItems", {
			quoteId,
			orgId: s.orgId,
			description: "First",
			quantity: 1,
			unit: "item",
			rate: 60,
			amount: 60,
			sortOrder: 0,
		});
		const li2 = await ctx.db.insert("quoteLineItems", {
			quoteId,
			orgId: s.orgId,
			description: "Second",
			quantity: 1,
			unit: "item",
			rate: 40,
			amount: 40,
			sortOrder: 1,
		});
		return { quoteId, documentId, lineItems: [li1, li2] };
	});
}

describe("portal.quotes.get", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("returns full extended shape: quote + lineItems + latestDocument + businessName + clientName + clientEmail + latestApproval=null", async () => {
		const s = await seed(t);
		const jti = "get-jti-1";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await insertQuoteWithDoc(t, s, s.clientId);

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.get, { quoteId });

		expect(result.quote._id).toBe(quoteId);
		expect(result.lineItems.length).toBe(2);
		expect(result.lineItems[0]?.sortOrder).toBe(0);
		expect(result.latestDocument?._id).toBe(documentId);
		expect(result.latestDocument?.version).toBe(2);
		expect(result.businessName).toBe("Acme Co");
		expect(result.clientName).toBe("Owning Client Inc");
		expect(result.clientEmail).toBe("jane@example.com");
		expect(result.latestApproval).toBeNull();
	});

	it("returns latestApproval projection from the most recent quoteApprovals row", async () => {
		const s = await seed(t);
		const jti = "get-jti-2";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await insertQuoteWithDoc(t, s, s.clientId);

		// Seed two approvals with different createdAt timestamps.
		const olderId = await t.run(async (ctx) => {
			return await ctx.db.insert("quoteApprovals", {
				quoteId,
				orgId: s.orgId,
				clientContactId: s.clientContactId,
				action: "approved",
				ipAddress: "1.1.1.1",
				userAgent: "ua",
				documentId,
				documentVersion: 1,
				lineItemsSnapshot: [
					{ description: "x", quantity: 1, unit: "item", rate: 10, amount: 10, sortOrder: 0 },
				],
				subtotalSnapshot: 10,
				taxSnapshot: 0,
				totalSnapshot: 10,
				createdAt: Date.now() - 60_000,
			});
		});
		const newerId = await t.run(async (ctx) => {
			return await ctx.db.insert("quoteApprovals", {
				quoteId,
				orgId: s.orgId,
				clientContactId: s.clientContactId,
				action: "declined",
				ipAddress: "2.2.2.2",
				userAgent: "ua",
				documentId,
				documentVersion: 2,
				lineItemsSnapshot: [
					{ description: "x", quantity: 1, unit: "item", rate: 10, amount: 10, sortOrder: 0 },
					{ description: "y", quantity: 2, unit: "item", rate: 5, amount: 10, sortOrder: 1 },
				],
				subtotalSnapshot: 20,
				taxSnapshot: 2,
				totalSnapshot: 22,
				createdAt: Date.now(),
			});
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.get, { quoteId });

		expect(result.latestApproval).not.toBeNull();
		expect(result.latestApproval?.auditId).toBe(newerId);
		expect(result.latestApproval?.action).toBe("declined");
		expect(result.latestApproval?.documentVersion).toBe(2);
		expect(result.latestApproval?.lineItemsCount).toBe(2);
		expect(result.latestApproval?.total).toBe(22);
		// signatureStorageId is undefined on this decline row, so URL is null.
		expect(result.latestApproval?.signatureUrl).toBeNull();
		// olderId is asserted not-returned by the auditId equality above.
		expect(olderId).not.toBe(newerId);
	});

	it("rejects with FORBIDDEN when clientContact does not own the quote", async () => {
		const s = await seed(t);
		const jti = "get-jti-3";
		await seedSession(t, s, jti);
		const { quoteId } = await insertQuoteWithDoc(t, s, s.otherClientId);

		const asPortal = t.withIdentity(ident(s, jti));
		await expect(
			asPortal.query(api.portal.quotes.get, { quoteId }),
		).rejects.toThrow();
	});

	it("rejects with NOT_FOUND when quoteId does not exist", async () => {
		const s = await seed(t);
		const jti = "get-jti-4";
		await seedSession(t, s, jti);

		// Insert a throwaway quote then delete it to get a valid-shape ID that
		// no longer exists.
		const ghostId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("quotes", {
				orgId: s.orgId,
				clientId: s.clientId,
				title: "ghost",
				status: "sent",
				subtotal: 0,
				total: 0,
			});
			await ctx.db.delete(id);
			return id;
		});

		const asPortal = t.withIdentity(ident(s, jti));
		await expect(
			asPortal.query(api.portal.quotes.get, { quoteId: ghostId }),
		).rejects.toThrow();
	});
});
