// Plan 14-02 Task 3: portal.quotes.decline mutation — implements
// QUOTE-04 decline path + QUOTE-06 event emission. Also asserts the
// REVIEWS-mandated decline-without-terms semantics (termsAcceptedAt is
// NEVER set on decline rows).
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

async function seedAll(t: ReturnType<typeof convexTest>): Promise<Seed> {
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
			portalAccessId: "portal-decline-1",
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
			clientContactId,
			clientPortalId: "portal-decline-1",
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

async function seedQuoteWithDoc(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	status: "draft" | "sent" | "approved" | "declined" | "expired" = "sent",
): Promise<{ quoteId: Id<"quotes">; documentId: Id<"documents"> }> {
	return await t.run(async (ctx) => {
		const quoteId = await ctx.db.insert("quotes", {
			orgId: s.orgId,
			clientId: s.clientId,
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
		await ctx.db.insert("quoteLineItems", {
			quoteId,
			orgId: s.orgId,
			description: "First",
			quantity: 1,
			unit: "item",
			rate: 60,
			amount: 60,
			sortOrder: 0,
		});
		await ctx.db.insert("quoteLineItems", {
			quoteId,
			orgId: s.orgId,
			description: "Second",
			quantity: 1,
			unit: "item",
			rate: 40,
			amount: 40,
			sortOrder: 1,
		});
		return { quoteId, documentId };
	});
}

describe("portal.quotes.decline", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("happy path: inserts audit row with action='declined', no signatureStorageId, no termsAcceptedAt; emits sent->declined", async () => {
		const s = await seedAll(t);
		const jti = "decline-jti-1";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s);

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.mutation(api.portal.quotes.decline, {
			quoteId,
			expectedDocumentId: documentId,
			declineReason: "Too expensive",
			ipAddress: "1.2.3.4",
			userAgent: "ua",
		});

		expect(result.action).toBe("declined");
		expect(result.documentVersion).toBe(2);
		expect(result.lineItemsCount).toBe(2);
		// Plan 14-14 / Finding 6: response total now reflects line-item-derived
		// recompute (60 + 40 = 100). The seed's stored quote.total=110 would
		// only apply if taxEnabled were true with taxRate=10; this seed sets
		// taxAmount=10 directly without taxEnabled, so recompute yields 100.
		expect(result.total).toBe(100);

		await t.run(async (ctx) => {
			const audits = await ctx.db.query("quoteApprovals").collect();
			expect(audits.length).toBe(1);
			const audit = audits[0]!;
			expect(audit.action).toBe("declined");
			expect(audit.declineReason).toBe("Too expensive");
			expect(audit.signatureStorageId).toBeUndefined();
			expect(audit.signatureMode).toBeUndefined();
			expect(audit.signatureRawData).toBeUndefined();
			expect(audit.termsAcceptedAt).toBeUndefined();

			const quote = await ctx.db.get(quoteId);
			expect(quote?.status).toBe("declined");
			expect(quote?.declinedAt).toBeDefined();

			const events = await ctx.db
				.query("domainEvents")
				.filter((q) => q.eq(q.field("eventType"), "entity.status_changed"))
				.collect();
			const matching = events.find(
				(e) =>
					e.payload.entityId === quoteId &&
					e.payload.oldValue === "sent" &&
					e.payload.newValue === "declined" &&
					e.eventSource === "portal.quotes.decline",
			);
			expect(matching).toBeDefined();
		});
	});

	it("decline-without-terms: termsAcceptedAt === undefined on the inserted audit row", async () => {
		const s = await seedAll(t);
		const jti = "decline-jti-2";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s);

		const asPortal = t.withIdentity(ident(s, jti));
		await asPortal.mutation(api.portal.quotes.decline, {
			quoteId,
			expectedDocumentId: documentId,
			declineReason: "no thanks",
			ipAddress: "1",
			userAgent: "u",
		});

		await t.run(async (ctx) => {
			const audit = (await ctx.db.query("quoteApprovals").collect())[0]!;
			expect("termsAcceptedAt" in audit ? audit.termsAcceptedAt : undefined).toBeUndefined();
		});
	});

	it("accepts empty/missing declineReason (optional reason is legitimate)", async () => {
		const s = await seedAll(t);
		const jti = "decline-jti-3";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s);

		const asPortal = t.withIdentity(ident(s, jti));
		await asPortal.mutation(api.portal.quotes.decline, {
			quoteId,
			expectedDocumentId: documentId,
			ipAddress: "1",
			userAgent: "u",
		});

		await t.run(async (ctx) => {
			const audit = (await ctx.db.query("quoteApprovals").collect())[0]!;
			expect(audit.declineReason).toBeUndefined();
		});
	});

	it("rejects QUOTE_VERSION_STALE when expectedDocumentId is stale", async () => {
		const s = await seedAll(t);
		const jti = "decline-jti-4";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s);

		// Bump latestDocumentId.
		await t.run(async (ctx) => {
			const newStorageId = await ctx.storage.store(
				new Blob(["pdf-v3"], { type: "application/pdf" }),
			);
			const id = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId: newStorageId,
				generatedAt: Date.now(),
				version: 3,
			});
			await ctx.db.patch(quoteId, { latestDocumentId: id });
		});

		const asPortal = t.withIdentity(ident(s, jti));
		await expect(
			asPortal.mutation(api.portal.quotes.decline, {
				quoteId,
				expectedDocumentId: documentId,
				ipAddress: "1",
				userAgent: "u",
			}),
		).rejects.toThrow();

		const auditCount = await t.run(async (ctx) =>
			(await ctx.db.query("quoteApprovals").collect()).length,
		);
		expect(auditCount).toBe(0);
	});

	it("rejects QUOTE_NOT_PENDING when status is not 'sent'", async () => {
		const s = await seedAll(t);
		const jti = "decline-jti-5";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s);

		await t.run(async (ctx) => {
			await ctx.db.patch(quoteId, { status: "declined" });
		});

		const asPortal = t.withIdentity(ident(s, jti));
		await expect(
			asPortal.mutation(api.portal.quotes.decline, {
				quoteId,
				expectedDocumentId: documentId,
				ipAddress: "1",
				userAgent: "u",
			}),
		).rejects.toThrow();
	});

	it("returns ApprovalReceipt-shaped payload with action='declined' and no signatureStorageId", async () => {
		const s = await seedAll(t);
		const jti = "decline-jti-6";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s);

		const asPortal = t.withIdentity(ident(s, jti));
		const r = await asPortal.mutation(api.portal.quotes.decline, {
			quoteId,
			expectedDocumentId: documentId,
			declineReason: "nope",
			ipAddress: "1",
			userAgent: "u",
		});
		expect(r).toMatchObject({
			action: "declined",
			documentVersion: 2,
			lineItemsCount: 2,
			// Plan 14-14 / Finding 6: response.total is line-item-derived
			// (60 + 40 = 100). The seed sets stored quote.total=110 with
			// taxAmount=10 but does NOT set taxEnabled=true, so the recompute
			// drops the unconfigured tax — which IS the divergence the fix
			// pins (audit captures what the client actually saw).
			total: 100,
		});
		expect(typeof r.auditId).toBe("string");
		expect(typeof r.createdAt).toBe("number");
		// signatureStorageId is not part of the decline receipt (omitted entirely).
		expect((r as unknown as { signatureStorageId?: unknown }).signatureStorageId).toBeUndefined();
	});
});
