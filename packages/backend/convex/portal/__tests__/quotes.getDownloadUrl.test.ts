// Plan 14.1-03 Task 1 (Wave 0 RED): portal.quotes.getDownloadUrl
//
// Asserts:
//  - Test A: returns { url } via pinned latestDocumentId
//  - Test B: documents-table fallback when latestDocumentId is null (Phase 14-13)
//  - Test C: throws FORBIDDEN for cross-org session
//  - Test D: returns null when no document exists (pre-publish)
//  - Tests E1-E4: pinned-doc strict validation (REVIEWS HIGH 2026-05-10) —
//    rejects pinned doc with foreign orgId / wrong documentType / mismatched
//    documentId, falls back to documents-table; accepts when all three match.
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

async function seedOrg(
	t: ReturnType<typeof convexTest>,
	portalId = "portal-dl-1",
): Promise<Seed> {
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

async function insertQuote(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	status: "sent" | "approved" | "declined" = "sent",
): Promise<Id<"quotes">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("quotes", {
			orgId: s.orgId,
			clientId: s.clientId,
			title: "Test Quote",
			status,
			subtotal: 100,
			total: 100,
			sentAt: Date.now(),
			terms: "n30",
		});
	});
}

describe("portal.quotes.getDownloadUrl (Plan 14.1-03)", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("Test A — returns { url } via pinned latestDocumentId (uses docV2 storageId)", async () => {
		const s = await seedOrg(t, "portal-dl-A");
		const jti = "dl-A";
		await seedSession(t, s, jti);
		const quoteId = await insertQuote(t, s);

		const { docV2Id, docV2Url } = await t.run(async (ctx) => {
			const s1 = await ctx.storage.store(
				new Blob(["v1"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: s1,
				generatedAt: Date.now(),
				version: 1,
			});
			const s2 = await ctx.storage.store(
				new Blob(["v2"], { type: "application/pdf" }),
			);
			const v2 = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: s2,
				generatedAt: Date.now(),
				version: 2,
			});
			await ctx.db.patch(quoteId, { latestDocumentId: v2 });
			const url = await ctx.storage.getUrl(s2);
			return { docV2Id: v2, docV2Url: url };
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId,
		});
		expect(result).not.toBeNull();
		expect(typeof result!.url).toBe("string");
		expect(result!.url.length).toBeGreaterThan(0);
		// URL came from docV2 (the pinned doc), not docV1.
		expect(result!.url).toBe(docV2Url);
		expect(docV2Id).toBeTruthy();
	});

	it("Test B — uses Phase 14-13 documents-table fallback when latestDocumentId is null", async () => {
		const s = await seedOrg(t, "portal-dl-B");
		const jti = "dl-B";
		await seedSession(t, s, jti);
		const quoteId = await insertQuote(t, s);

		const expectedUrl = await t.run(async (ctx) => {
			const sid = await ctx.storage.store(
				new Blob(["v1"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: sid,
				generatedAt: Date.now(),
				version: 1,
			});
			return await ctx.storage.getUrl(sid);
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId,
		});
		expect(result).not.toBeNull();
		expect(result!.url).toBe(expectedUrl);
	});

	it("Test C — throws FORBIDDEN for cross-org portal session", async () => {
		const sA = await seedOrg(t, "portal-dl-C-A");
		const sB = await seedOrg(t, "portal-dl-C-B");
		const jtiB = "dl-C-B";
		await seedSession(t, sB, jtiB);
		const quoteAId = await insertQuote(t, sA);

		// Pin a doc to ensure code reaches scope checks.
		await t.run(async (ctx) => {
			const sid = await ctx.storage.store(
				new Blob(["v1"], { type: "application/pdf" }),
			);
			const dId = await ctx.db.insert("documents", {
				orgId: sA.orgId,
				documentType: "quote",
				documentId: quoteAId,
				storageId: sid,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.patch(quoteAId, { latestDocumentId: dId });
		});

		const asPortalB = t.withIdentity(ident(sB, jtiB));
		try {
			await asPortalB.query(api.portal.quotes.getDownloadUrl, {
				quoteId: quoteAId,
			});
			throw new Error("expected throw");
		} catch (err: unknown) {
			const e = err as { name?: string; data?: unknown };
			const data =
				typeof e.data === "string"
					? (JSON.parse(e.data) as { code?: string })
					: (e.data as { code?: string } | undefined);
			expect(data?.code).toBe("FORBIDDEN");
		}
	});

	it("Test D — returns null when no document exists (pre-publish)", async () => {
		const s = await seedOrg(t, "portal-dl-D");
		const jti = "dl-D";
		await seedSession(t, s, jti);
		const quoteId = await insertQuote(t, s);

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId,
		});
		expect(result).toBeNull();
	});

	// ---- REVIEWS HIGH 2026-05-10: pinned-doc strict validation ----

	it("Test E1 — rejects pinned doc with foreign orgId; falls back to documents-table", async () => {
		const sA = await seedOrg(t, "portal-dl-E1-A");
		const sB = await seedOrg(t, "portal-dl-E1-B");
		const jtiA = "dl-E1-A";
		await seedSession(t, sA, jtiA);
		const quoteAId = await insertQuote(t, sA);

		const fallbackUrl = await t.run(async (ctx) => {
			// docCorrupted: orgId=sB.orgId (foreign), but pinned by quoteA.
			const corruptedSid = await ctx.storage.store(
				new Blob(["bad"], { type: "application/pdf" }),
			);
			const docCorrupted = await ctx.db.insert("documents", {
				orgId: sB.orgId, // FOREIGN
				documentType: "quote",
				documentId: quoteAId,
				storageId: corruptedSid,
				generatedAt: Date.now(),
				version: 99,
			});
			// docFallback: orgId=sA.orgId, valid same-quote row.
			const fallbackSid = await ctx.storage.store(
				new Blob(["good"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: sA.orgId,
				documentType: "quote",
				documentId: quoteAId,
				storageId: fallbackSid,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.patch(quoteAId, { latestDocumentId: docCorrupted });
			return await ctx.storage.getUrl(fallbackSid);
		});

		const asPortal = t.withIdentity(ident(sA, jtiA));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId: quoteAId,
		});
		expect(result).not.toBeNull();
		expect(result!.url).toBe(fallbackUrl);
	});

	it("Test E2 — rejects pinned doc with wrong documentType; falls back", async () => {
		const s = await seedOrg(t, "portal-dl-E2");
		const jti = "dl-E2";
		await seedSession(t, s, jti);
		const quoteId = await insertQuote(t, s);

		const fallbackUrl = await t.run(async (ctx) => {
			const wrongTypeSid = await ctx.storage.store(
				new Blob(["bad"], { type: "application/pdf" }),
			);
			const docWrongType = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "invoice", // WRONG TYPE
				documentId: quoteId,
				storageId: wrongTypeSid,
				generatedAt: Date.now(),
				version: 99,
			});
			const fallbackSid = await ctx.storage.store(
				new Blob(["good"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: fallbackSid,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.patch(quoteId, { latestDocumentId: docWrongType });
			return await ctx.storage.getUrl(fallbackSid);
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId,
		});
		expect(result).not.toBeNull();
		expect(result!.url).toBe(fallbackUrl);
	});

	it("Test E3 — rejects pinned doc with mismatched documentId; falls back", async () => {
		const s = await seedOrg(t, "portal-dl-E3");
		const jti = "dl-E3";
		await seedSession(t, s, jti);
		const quoteAId = await insertQuote(t, s);
		const quoteBId = await insertQuote(t, s);

		const fallbackUrl = await t.run(async (ctx) => {
			// docPinnedWrongId: documentId=quoteBId (mismatched), but pinned by quoteA.
			const wrongIdSid = await ctx.storage.store(
				new Blob(["bad"], { type: "application/pdf" }),
			);
			const docWrongId = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteBId, // WRONG QUOTE
				storageId: wrongIdSid,
				generatedAt: Date.now(),
				version: 99,
			});
			const fallbackSid = await ctx.storage.store(
				new Blob(["good"], { type: "application/pdf" }),
			);
			await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteAId,
				storageId: fallbackSid,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.patch(quoteAId, { latestDocumentId: docWrongId });
			return await ctx.storage.getUrl(fallbackSid);
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId: quoteAId,
		});
		expect(result).not.toBeNull();
		expect(result!.url).toBe(fallbackUrl);
	});

	it("Test E4 — accepts pinned doc when all three checks pass AND no fallback exists", async () => {
		const s = await seedOrg(t, "portal-dl-E4");
		const jti = "dl-E4";
		await seedSession(t, s, jti);
		const quoteId = await insertQuote(t, s);

		const validUrl = await t.run(async (ctx) => {
			const sid = await ctx.storage.store(
				new Blob(["valid"], { type: "application/pdf" }),
			);
			const docValid = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: sid,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.patch(quoteId, { latestDocumentId: docValid });
			return await ctx.storage.getUrl(sid);
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.query(api.portal.quotes.getDownloadUrl, {
			quoteId,
		});
		expect(result).not.toBeNull();
		expect(result!.url).toBe(validUrl);
	});
});
