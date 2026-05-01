// Plan 14-14 / CodeRabbit Finding 6: decline audit row's snapshot fields must
// reflect line-item-derived totals (the same source of truth Plan 14-09's
// portal display path uses), NOT the stored `quote.subtotal/taxAmount/total`
// which can be stale relative to the line items.
//
// Setup mirrors `quotes.totals-recompute.test.ts`: a quote whose stored totals
// are 0 but whose line items sum to 110. Pre-fix the audit row would persist
// {subtotalSnapshot: 0, totalSnapshot: 0}; post-fix it persists the recomputed
// {subtotalSnapshot: 110, totalSnapshot: 110}, matching what the client saw
// before they declined.

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
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
};

async function seed(t: ReturnType<typeof convexTest>): Promise<Seed> {
	const portalId = "portal-decline-snapshot-1";
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Owner",
			email: `owner_${Math.random()}@example.com`,
			image: "https://example.com/u.png",
			externalId: `user_${Math.random()}`,
		});
		const orgId = await ctx.db.insert("organizations", {
			clerkOrganizationId: `org_${Math.random()}`,
			name: "Acme",
			ownerUserId: userId,
		});
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Owning Client",
			status: "active",
			portalAccessId: portalId,
		});
		const clientContactId = await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: "Jane",
			lastName: "Customer",
			email: "jane@example.com",
			isPrimary: true,
		});
		return { orgId, clientId, clientContactId, clientPortalId: portalId };
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

/**
 * Insert a sent quote with stale stored totals (subtotal=0, total=0) and
 * line items summing to `lineItemAmounts`. Mirrors
 * quotes.totals-recompute.test.ts so the decline-snapshot test pins parallel
 * recompute semantics.
 */
async function insertStaleTotalsQuote(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	opts: { lineItemAmounts: number[] },
): Promise<{ quoteId: Id<"quotes">; documentId: Id<"documents"> }> {
	return await t.run(async (ctx) => {
		const quoteId = await ctx.db.insert("quotes", {
			orgId: s.orgId,
			clientId: s.clientId,
			title: "Stale Totals Quote",
			status: "sent",
			subtotal: 0,
			taxAmount: 0,
			total: 0,
			discountEnabled: false,
			taxEnabled: false,
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
			version: 1,
		});
		await ctx.db.patch(quoteId, { latestDocumentId: documentId });
		for (let i = 0; i < opts.lineItemAmounts.length; i++) {
			const amount = opts.lineItemAmounts[i]!;
			await ctx.db.insert("quoteLineItems", {
				quoteId,
				orgId: s.orgId,
				description: `Item ${i + 1}`,
				quantity: 1,
				unit: "ea",
				rate: amount,
				amount,
				sortOrder: i,
			});
		}
		return { quoteId, documentId };
	});
}

describe("decline audit snapshot recomputes from line items (Finding 6)", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("snapshot fields equal recomputed totals (110), NOT stored stale 0s", async () => {
		const s = await seed(t);
		const jti = "decline-snapshot-jti-A";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await insertStaleTotalsQuote(t, s, {
			lineItemAmounts: [50, 60],
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.mutation(api.portal.quotes.decline, {
			quoteId,
			expectedDocumentId: documentId,
			declineReason: "Too expensive",
			ipAddress: "1.2.3.4",
			userAgent: "ua",
		});

		// Response total reflects recompute, not stored stale 0.
		expect(result.total).toBe(110);

		// Audit row snapshot reflects recompute, not stored stale 0.
		await t.run(async (ctx) => {
			const audits = await ctx.db.query("quoteApprovals").collect();
			expect(audits.length).toBe(1);
			const audit = audits[0]!;
			expect(audit.subtotalSnapshot).toBe(110);
			expect(audit.taxSnapshot).toBe(0);
			expect(audit.totalSnapshot).toBe(110);
		});
	});

	it("snapshot tax recomputes when taxEnabled=true with stored stale total", async () => {
		const s = await seed(t);
		const jti = "decline-snapshot-jti-B";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await t.run(async (ctx) => {
			const qid = await ctx.db.insert("quotes", {
				orgId: s.orgId,
				clientId: s.clientId,
				title: "Stale w/ tax",
				status: "sent",
				subtotal: 0,
				taxAmount: 0,
				total: 0,
				discountEnabled: false,
				taxEnabled: true,
				taxRate: 10,
				sentAt: Date.now(),
				terms: undefined,
			});
			const storageId = await ctx.storage.store(
				new Blob(["pdf"], { type: "application/pdf" }),
			);
			const did = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: qid,
				storageId,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.patch(qid, { latestDocumentId: did });
			await ctx.db.insert("quoteLineItems", {
				quoteId: qid,
				orgId: s.orgId,
				description: "Item",
				quantity: 1,
				unit: "ea",
				rate: 100,
				amount: 100,
				sortOrder: 0,
			});
			return { quoteId: qid, documentId: did };
		});

		const asPortal = t.withIdentity(ident(s, jti));
		await asPortal.mutation(api.portal.quotes.decline, {
			quoteId,
			expectedDocumentId: documentId,
			ipAddress: "1.2.3.4",
			userAgent: "ua",
		});

		await t.run(async (ctx) => {
			const audit = (await ctx.db.query("quoteApprovals").collect())[0]!;
			expect(audit.subtotalSnapshot).toBe(100);
			expect(audit.taxSnapshot).toBe(10); // 10% of 100
			expect(audit.totalSnapshot).toBe(110);
		});
	});
});
