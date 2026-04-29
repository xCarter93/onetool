// Plan 14-09 (UAT Gap 5): portal.quotes.get / list must recompute totals from
// line items rather than returning stale stored values on the quote document.
//
// Workspace `quotes.get` recomputes via calculateQuoteTotals (quotes.ts:373);
// portal `quotes.get` previously returned `quote` raw, so stale subtotal=0 /
// total=0 leaked through to the detail page even when line items rendered
// correctly.
//
// These tests pin the contract:
//   A) get() recomputes when stored values are stale (0)
//   B) list() recomputes per-row total (defense-in-depth — list page reads
//      quote.total directly)
//   C) tax is applied to recomputed subtotal (taxRate as percentage, e.g. 10
//      means 10% — matches BusinessUtils.calculateTax in lib/shared.ts)
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
	const portalId = "portal-totals-recompute-1";
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
 * Insert a quote with explicitly stored stale totals (subtotal=0 / total=0)
 * and `lineItemAmounts` worth of line items totaling to those amounts.
 */
async function insertQuoteWithStaleTotals(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	opts: {
		lineItemAmounts: number[];
		taxEnabled?: boolean;
		taxRate?: number;
	},
): Promise<{ quoteId: Id<"quotes"> }> {
	return await t.run(async (ctx) => {
		const quoteId = await ctx.db.insert("quotes", {
			orgId: s.orgId,
			clientId: s.clientId,
			title: "Stale Totals Quote",
			status: "sent",
			subtotal: 0,
			taxAmount: 0,
			total: 0,
			taxEnabled: opts.taxEnabled ?? false,
			taxRate: opts.taxRate,
			discountEnabled: false,
			sentAt: Date.now(),
			terms: "net 30",
		});
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
		return { quoteId };
	});
}

describe("portal.quotes totals recompute (Gap 5 / UAT Test 3)", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("Test A: get() recomputes subtotal/total from line items even when stored values are stale (0)", async () => {
		const s = await seed(t);
		const jti = "totals-recompute-jti-A";
		await seedSession(t, s, jti);
		const { quoteId } = await insertQuoteWithStaleTotals(t, s, {
			lineItemAmounts: [5000, 6000],
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.get, { quoteId });

		expect(result.quote.subtotal).toBe(11000);
		expect(result.quote.total).toBe(11000);
		expect(result.quote.taxAmount).toBe(0);
	});

	it("Test B: list() returns recomputed total per row (defense-in-depth for list page)", async () => {
		const s = await seed(t);
		const jti = "totals-recompute-jti-B";
		await seedSession(t, s, jti);
		const { quoteId } = await insertQuoteWithStaleTotals(t, s, {
			lineItemAmounts: [5000, 6000],
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const list = await asPortal.query(api.portal.quotes.list, {});

		const row = list.find((q) => q._id === quoteId);
		expect(row).toBeDefined();
		expect(row?.total).toBe(11000);
	});

	it("Test C: tax is applied to recomputed subtotal (taxRate=10 → 10% of subtotal)", async () => {
		const s = await seed(t);
		const jti = "totals-recompute-jti-C";
		await seedSession(t, s, jti);
		// Stale stored values still 0; line items still total 11000;
		// taxEnabled=true with taxRate=10 (i.e. 10%).
		const { quoteId } = await insertQuoteWithStaleTotals(t, s, {
			lineItemAmounts: [5000, 6000],
			taxEnabled: true,
			taxRate: 10,
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.get, { quoteId });

		expect(result.quote.subtotal).toBe(11000);
		expect(result.quote.taxAmount).toBe(1100);
		expect(result.quote.total).toBe(12100);
	});
});
