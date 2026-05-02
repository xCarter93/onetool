// Plan 14-02 Task 1: portal.quotes.list — implements QUOTE-01.
//
// Asserts:
//  - Returns only quotes owned by the session's clientContact (multi-tenant scope)
//  - Excludes quotes for other clients (even in the same org)
//  - Excludes drafts (clients should never see workspace-only drafts)
//  - Orders by sentAt desc
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../../test.setup";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

type SessionSeed = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	otherClientId: Id<"clients">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
};

async function seedTwoClients(
	t: ReturnType<typeof convexTest>,
): Promise<SessionSeed> {
	const portalId = "portal-list-1";
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
		const otherClientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Other Client",
			status: "active",
			portalAccessId: "portal-other-1",
		});
		const clientContactId = await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: "Pat",
			lastName: "Customer",
			email: "pat@example.com",
			isPrimary: true,
		});
		return { orgId, clientId, otherClientId, clientContactId, clientPortalId: portalId };
	});
}

async function seedSession(
	t: ReturnType<typeof convexTest>,
	seed: SessionSeed,
	jti: string,
) {
	await t.run(async (ctx) => {
		await ctx.db.insert("portalSessions", {
			orgId: seed.orgId,
			clientId: seed.clientId,
			clientContactId: seed.clientContactId,
			clientPortalId: seed.clientPortalId,
			tokenJti: jti,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000,
		});
	});
}

function portalIdentity(seed: SessionSeed, jti: string) {
	return {
		issuer: PORTAL_ISSUER,
		subject: seed.clientContactId,
		aud: "convex-portal",
		jti,
		orgId: seed.orgId,
		clientContactId: seed.clientContactId,
		clientPortalId: seed.clientPortalId,
	};
}

async function insertQuote(
	t: ReturnType<typeof convexTest>,
	overrides: {
		orgId: Id<"organizations">;
		clientId: Id<"clients">;
		status: "draft" | "sent" | "approved" | "declined" | "expired";
		sentAt?: number;
		title?: string;
	},
): Promise<Id<"quotes">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("quotes", {
			orgId: overrides.orgId,
			clientId: overrides.clientId,
			title: overrides.title ?? "Quote",
			status: overrides.status,
			subtotal: 100,
			total: 100,
			sentAt: overrides.sentAt,
		});
	});
}

describe("portal.quotes.list", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("returns only quotes for the authenticated clientContact's client+org", async () => {
		const seed = await seedTwoClients(t);
		const jti = "list-jti-1";
		await seedSession(t, seed, jti);

		const ownedSent = Date.now() - 60_000;
		const ownedQuoteId = await insertQuote(t, {
			orgId: seed.orgId,
			clientId: seed.clientId,
			status: "sent",
			sentAt: ownedSent,
			title: "Owned",
		});
		await insertQuote(t, {
			orgId: seed.orgId,
			clientId: seed.otherClientId,
			status: "sent",
			sentAt: Date.now() - 30_000,
			title: "Other client's quote",
		});

		const asPortal = t.withIdentity(portalIdentity(seed, jti));
		const result = await asPortal.query(api.portal.quotes.list, {});

		expect(result.length).toBe(1);
		expect(result[0]?._id).toBe(ownedQuoteId);
		expect(result[0]?.title).toBe("Owned");
	});

	it("returns quotes ordered by sentAt desc", async () => {
		const seed = await seedTwoClients(t);
		const jti = "list-jti-2";
		await seedSession(t, seed, jti);

		const olderId = await insertQuote(t, {
			orgId: seed.orgId,
			clientId: seed.clientId,
			status: "sent",
			sentAt: Date.now() - 5 * 60_000,
			title: "Older",
		});
		const newerId = await insertQuote(t, {
			orgId: seed.orgId,
			clientId: seed.clientId,
			status: "sent",
			sentAt: Date.now() - 60_000,
			title: "Newer",
		});

		const asPortal = t.withIdentity(portalIdentity(seed, jti));
		const result = await asPortal.query(api.portal.quotes.list, {});

		expect(result.length).toBe(2);
		expect(result[0]?._id).toBe(newerId);
		expect(result[1]?._id).toBe(olderId);
	});

	it("excludes draft quotes", async () => {
		const seed = await seedTwoClients(t);
		const jti = "list-jti-3";
		await seedSession(t, seed, jti);

		await insertQuote(t, {
			orgId: seed.orgId,
			clientId: seed.clientId,
			status: "draft",
			sentAt: Date.now(),
			title: "Draft",
		});
		const sentId = await insertQuote(t, {
			orgId: seed.orgId,
			clientId: seed.clientId,
			status: "sent",
			sentAt: Date.now() - 10_000,
			title: "Sent",
		});

		const asPortal = t.withIdentity(portalIdentity(seed, jti));
		const result = await asPortal.query(api.portal.quotes.list, {});

		expect(result.length).toBe(1);
		expect(result[0]?._id).toBe(sentId);
	});
});
