// Plan 14-02 Task 2: portal.quotes.approve action — implements
// QUOTE-03/04/05/06 happy path + audit shape + stale-no-orphan-blob +
// status-precondition + cross-tenant + rate-limit + event-emission +
// receipt return shape.
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../../test.setup";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

// Minimal valid PNG (1x1 transparent), base64-encoded.
const VALID_PNG_B64 =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

type Seed = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	otherClientId: Id<"clients">;
	otherContactId: Id<"clientContacts">;
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
			name: "Acme Co",
			ownerUserId: userId,
		});
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Owning Client Inc",
			status: "active",
			portalAccessId: "portal-approve-1",
		});
		const otherClientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Other Client",
			status: "active",
			portalAccessId: "portal-approve-other",
		});
		const clientContactId = await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: "Jane",
			lastName: "Customer",
			email: "jane@example.com",
			isPrimary: true,
		});
		const otherContactId = await ctx.db.insert("clientContacts", {
			clientId: otherClientId,
			orgId,
			firstName: "Bob",
			lastName: "Other",
			email: "bob@example.com",
			isPrimary: true,
		});
		return {
			orgId,
			clientId,
			otherClientId,
			otherContactId,
			clientContactId,
			clientPortalId: "portal-approve-1",
		};
	});
}

async function seedSession(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	jti: string,
	contactId?: Id<"clientContacts">,
	clientPortalId?: string,
	clientId?: Id<"clients">,
) {
	await t.run(async (ctx) => {
		await ctx.db.insert("portalSessions", {
			orgId: s.orgId,
			clientId: clientId ?? s.clientId,
			clientContactId: contactId ?? s.clientContactId,
			clientPortalId: clientPortalId ?? s.clientPortalId,
			tokenJti: jti,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			expiresAt: Date.now() + 24 * 60 * 60 * 1000,
		});
	});
}

function ident(
	s: Seed,
	jti: string,
	overrides: Partial<{ contactId: Id<"clientContacts">; clientPortalId: string }> = {},
) {
	return {
		issuer: PORTAL_ISSUER,
		subject: overrides.contactId ?? s.clientContactId,
		aud: "convex-portal",
		jti,
		orgId: s.orgId,
		clientContactId: overrides.contactId ?? s.clientContactId,
		clientPortalId: overrides.clientPortalId ?? s.clientPortalId,
	};
}

async function seedQuoteWithDoc(
	t: ReturnType<typeof convexTest>,
	s: Seed,
	clientId: Id<"clients">,
	status: "draft" | "sent" | "approved" | "declined" | "expired" = "sent",
): Promise<{ quoteId: Id<"quotes">; documentId: Id<"documents"> }> {
	return await t.run(async (ctx) => {
		const quoteId = await ctx.db.insert("quotes", {
			orgId: s.orgId,
			clientId,
			title: "Test Quote",
			status,
			subtotal: 100,
			taxAmount: 10,
			total: 110,
			// _preflightApproval now recomputes via calculateQuoteTotals (Greptile
			// PR #188 P1 fix). Set tax flags so recompute produces (100, 10, 110)
			// — matches stored stale values and keeps assertions stable.
			taxEnabled: true,
			taxRate: 10,
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

describe("portal.quotes.approve", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("happy path typed: stores signature, inserts audit row, patches status='approved', emits status_changed, returns receipt", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-1";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "typed",
			signatureRawData: JSON.stringify({ typedName: "Jane Client", font: "Caveat" }),
			ipAddress: "1.2.3.4",
			userAgent: "test-ua",
			termsAccepted: true,
		});

		expect(result.action).toBe("approved");
		expect(result.documentVersion).toBe(2);
		expect(result.lineItemsCount).toBe(2);
		expect(result.total).toBe(110);
		expect(result.signatureStorageId).toBeDefined();
		expect(typeof result.signatureUrl === "string" || result.signatureUrl === null).toBe(true);

		await t.run(async (ctx) => {
			const audits = await ctx.db.query("quoteApprovals").collect();
			expect(audits.length).toBe(1);
			const audit = audits[0]!;
			expect(audit.action).toBe("approved");
			expect(audit.signatureMode).toBe("typed");
			expect(audit.documentVersion).toBe(2);
			expect(audit.lineItemsSnapshot.length).toBe(2);
			expect(audit.termsAcceptedAt).toBeDefined();

			const quote = await ctx.db.get(quoteId);
			expect(quote?.status).toBe("approved");
			expect(quote?.approvedAt).toBeDefined();

			const events = await ctx.db
				.query("domainEvents")
				.filter((q) => q.eq(q.field("eventType"), "entity.status_changed"))
				.collect();
			const matching = events.find(
				(e) =>
					e.payload.entityId === quoteId &&
					e.payload.oldValue === "sent" &&
					e.payload.newValue === "approved" &&
					e.eventSource === "portal.quotes.approve",
			);
			expect(matching).toBeDefined();
		});
	});

	it("happy path drawn: audit row carries signatureMode='drawn'", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-2";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		const asPortal = t.withIdentity(ident(s, jti));
		await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "drawn",
			signatureRawData: "stroke-data",
			ipAddress: "1.2.3.4",
			userAgent: "ua",
			termsAccepted: true,
		});

		await t.run(async (ctx) => {
			const audit = (await ctx.db.query("quoteApprovals").collect())[0]!;
			expect(audit.signatureMode).toBe("drawn");
		});
	});

	it("audit row contains ipAddress, userAgent, documentVersion, snapshots, terms, termsAcceptedAt", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-3";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		const asPortal = t.withIdentity(ident(s, jti));
		await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "typed",
			signatureRawData: JSON.stringify({ typedName: "Jane" }),
			ipAddress: "10.0.0.1",
			userAgent: "MyBrowser/1.0",
			termsAccepted: true,
		});

		await t.run(async (ctx) => {
			const audit = (await ctx.db.query("quoteApprovals").collect())[0]!;
			expect(audit.ipAddress).toBe("10.0.0.1");
			expect(audit.userAgent).toBe("MyBrowser/1.0");
			expect(audit.documentVersion).toBe(2);
			expect(audit.subtotalSnapshot).toBe(100);
			expect(audit.taxSnapshot).toBe(10);
			expect(audit.totalSnapshot).toBe(110);
			expect(audit.termsSnapshot).toBe("net 30");
			expect(audit.termsAcceptedAt).toBeGreaterThan(0);
		});
	});

	it("rejects QUOTE_VERSION_STALE when expectedDocumentId !== quotes.latestDocumentId; no orphan blob, no audit row", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-4";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		// Pre-test: snapshot storage IDs.
		const preStorageIds = await t.run(async (ctx) => {
			const all = await ctx.db.system.query("_storage").collect();
			return all.map((r) => r._id);
		});

		// Simulate a republish — bump latestDocumentId to a different document.
		const newDocId = await t.run(async (ctx) => {
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
			return id;
		});

		const asPortal = t.withIdentity(ident(s, jti));
		await expect(
			asPortal.action(api.portal.quotes.approve, {
				quoteId,
				expectedDocumentId: documentId, // stale (v2) — current is v3 (newDocId)
				signatureBase64: VALID_PNG_B64,
				signatureMode: "typed",
				signatureRawData: "x",
				ipAddress: "1.1.1.1",
				userAgent: "ua",
				termsAccepted: true,
			}),
		).rejects.toThrow();

		// No audit row was inserted.
		const auditCount = await t.run(async (ctx) =>
			(await ctx.db.query("quoteApprovals").collect()).length,
		);
		expect(auditCount).toBe(0);
		// Storage IDs unchanged → no orphan signature blob lingered.
		const postStorageIds = await t.run(async (ctx) => {
			const all = await ctx.db.system.query("_storage").collect();
			return all.map((r) => r._id);
		});
		const newDocStorageId = await t.run(async (ctx) => {
			const d = await ctx.db.get(newDocId);
			return d?.storageId ?? null;
		});
		const allowed = new Set(preStorageIds);
		if (newDocStorageId) allowed.add(newDocStorageId);
		for (const id of postStorageIds) {
			expect(allowed.has(id)).toBe(true);
		}
	});

	it("rejects QUOTE_NOT_PENDING when quote.status !== 'sent'; no orphan blob", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-5";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		await t.run(async (ctx) => {
			await ctx.db.patch(quoteId, { status: "approved" });
		});

		const preStorage = await t.run(async (ctx) =>
			(await ctx.db.system.query("_storage").collect()).length,
		);

		const asPortal = t.withIdentity(ident(s, jti));
		await expect(
			asPortal.action(api.portal.quotes.approve, {
				quoteId,
				expectedDocumentId: documentId,
				signatureBase64: VALID_PNG_B64,
				signatureMode: "typed",
				signatureRawData: "x",
				ipAddress: "1",
				userAgent: "u",
				termsAccepted: true,
			}),
		).rejects.toThrow();

		await t.run(async (ctx) => {
			const audits = await ctx.db.query("quoteApprovals").collect();
			expect(audits.length).toBe(0);
			const postStorage = (await ctx.db.system.query("_storage").collect()).length;
			expect(postStorage).toBe(preStorage);
		});
	});

	it("rejects FORBIDDEN when contactA approves quote owned by clientB; no orphan blob", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-6";
		// Session keyed to the OTHER contact (clientB).
		await seedSession(
			t,
			s,
			jti,
			s.otherContactId,
			"portal-approve-other",
			s.otherClientId,
		);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		const preStorage = await t.run(async (ctx) =>
			(await ctx.db.system.query("_storage").collect()).length,
		);

		const asOther = t.withIdentity(
			ident(s, jti, {
				contactId: s.otherContactId,
				clientPortalId: "portal-approve-other",
			}),
		);
		await expect(
			asOther.action(api.portal.quotes.approve, {
				quoteId, // belongs to s.clientId, not s.otherClientId
				expectedDocumentId: documentId,
				signatureBase64: VALID_PNG_B64,
				signatureMode: "typed",
				signatureRawData: "x",
				ipAddress: "1",
				userAgent: "u",
				termsAccepted: true,
			}),
		).rejects.toThrow();

		await t.run(async (ctx) => {
			const audits = await ctx.db.query("quoteApprovals").collect();
			expect(audits.length).toBe(0);
			const postStorage = (await ctx.db.system.query("_storage").collect()).length;
			expect(postStorage).toBe(preStorage);
		});
	});

	it("rate-limit: 6th approve in quick succession throws RATE_LIMITED with retryAfter", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-rl";
		await seedSession(t, s, jti);
		// 5 separate quotes so first 5 succeed (capacity=5).
		const quotes: { quoteId: Id<"quotes">; documentId: Id<"documents"> }[] = [];
		for (let i = 0; i < 6; i++) {
			quotes.push(await seedQuoteWithDoc(t, s, s.clientId));
		}

		const asPortal = t.withIdentity(ident(s, jti));
		for (let i = 0; i < 5; i++) {
			await asPortal.action(api.portal.quotes.approve, {
				quoteId: quotes[i]!.quoteId,
				expectedDocumentId: quotes[i]!.documentId,
				signatureBase64: VALID_PNG_B64,
				signatureMode: "typed",
				signatureRawData: "x",
				ipAddress: "1",
				userAgent: "u",
				termsAccepted: true,
			});
		}

		let captured: unknown = null;
		try {
			await asPortal.action(api.portal.quotes.approve, {
				quoteId: quotes[5]!.quoteId,
				expectedDocumentId: quotes[5]!.documentId,
				signatureBase64: VALID_PNG_B64,
				signatureMode: "typed",
				signatureRawData: "x",
				ipAddress: "1",
				userAgent: "u",
				termsAccepted: true,
			});
		} catch (err) {
			captured = err;
		}
		expect(captured).not.toBeNull();
		const e = captured as { name?: string; data?: unknown };
		expect(e.name).toBe("ConvexError");
		// convex-test double-encodes ConvexError data when the throw crosses
		// the action -> internalMutation boundary. Try both single- and
		// double-decode paths.
		let data: { code?: string; retryAfter?: number } = {};
		const raw = e.data;
		if (typeof raw === "string") {
			let parsed: unknown = raw;
			try { parsed = JSON.parse(parsed as string); } catch { /* noop */ }
			if (typeof parsed === "string") {
				try { parsed = JSON.parse(parsed); } catch { /* noop */ }
			}
			data = parsed as typeof data;
		} else if (raw && typeof raw === "object") {
			data = raw as typeof data;
		}
		expect(data.code).toBe("RATE_LIMITED");
		expect(typeof data.retryAfter).toBe("number");
	});

	it("event emission: status_changed event row is linked to the audit row by quoteId", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-7";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		const asPortal = t.withIdentity(ident(s, jti));
		await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "typed",
			signatureRawData: "x",
			ipAddress: "1",
			userAgent: "u",
			termsAccepted: true,
		});

		await t.run(async (ctx) => {
			const audits = await ctx.db
				.query("quoteApprovals")
				.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
				.collect();
			expect(audits.length).toBe(1);
			const events = await ctx.db
				.query("domainEvents")
				.filter((q) => q.eq(q.field("eventType"), "entity.status_changed"))
				.collect();
			const matching = events.filter(
				(e) =>
					e.payload.entityId === quoteId &&
					e.payload.newValue === "approved" &&
					e.eventSource === "portal.quotes.approve",
			);
			expect(matching.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("Case 4 (Plan 14-13 / Gap B): approves a quote whose document exists in the documents table even when quote.latestDocumentId is null", async () => {
		const s = await seedAll(t);
		const jti = "approve-fallback-jti";
		await seedSession(t, s, jti);

		const { quoteId, documentId } = await t.run(async (ctx) => {
			const qId = await ctx.db.insert("quotes", {
				orgId: s.orgId,
				clientId: s.clientId,
				quoteNumber: "Q-FB-APV-1",
				title: "Fallback Approve Quote",
				status: "sent",
				subtotal: 100,
				taxAmount: 0,
				total: 100,
				sentAt: Date.now(),
				terms: "n30",
				// INTENTIONALLY no latestDocumentId — mirrors the user-reported state.
			});
			const storageId = await ctx.storage.store(
				new Blob(["pdf"], { type: "application/pdf" }),
			);
			const dId = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: qId,
				storageId,
				generatedAt: Date.now(),
				version: 2,
			});
			await ctx.db.insert("quoteLineItems", {
				quoteId: qId,
				orgId: s.orgId,
				description: "Item",
				quantity: 1,
				unit: "each",
				rate: 100,
				amount: 100,
				sortOrder: 0,
			});
			return { quoteId: qId, documentId: dId };
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "typed",
			signatureRawData: JSON.stringify({ typedName: "Fallback Client", font: "Caveat" }),
			ipAddress: "1.2.3.4",
			userAgent: "test-ua",
			termsAccepted: true,
		});
		expect(result.action).toBe("approved");
		expect(result.documentVersion).toBe(2);
	});

	it("Case 4b RED-precision: post-fix positive smoke check (was: throws QUOTE_VERSION_STALE pre-fix; converted to mirror Case 4 per Task 2) (Plan 14-13 / Gap B)", async () => {
		// Post-Task-2: the GREEN fix relaxes the OCC predicate when
		// latestDocumentId is null, so this call no longer throws. Case 4b is
		// preserved as a second positive smoke check (different version
		// number, different jti) — its pre-fix QUOTE_VERSION_STALE assertion
		// has been retired now that the failure mode is gone. The
		// RED-precision probe is captured in git history (commit
		// `test(14-13): add failing RED tests for document-not-ready
		// fallback (Gap B)`).
		const s = await seedAll(t);
		const jti = "approve-fallback-precision-jti";
		await seedSession(t, s, jti);

		const { quoteId, documentId } = await t.run(async (ctx) => {
			const qId = await ctx.db.insert("quotes", {
				orgId: s.orgId,
				clientId: s.clientId,
				quoteNumber: "Q-FB-APV-2",
				title: "Fallback Approve Quote 2",
				status: "sent",
				subtotal: 100,
				taxAmount: 0,
				total: 100,
				sentAt: Date.now(),
				terms: "n30",
				// INTENTIONALLY no latestDocumentId — same bug surface as Case 4.
			});
			const storageId = await ctx.storage.store(
				new Blob(["pdf"], { type: "application/pdf" }),
			);
			const dId = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: qId,
				storageId,
				generatedAt: Date.now(),
				version: 1,
			});
			await ctx.db.insert("quoteLineItems", {
				quoteId: qId,
				orgId: s.orgId,
				description: "Item",
				quantity: 1,
				unit: "each",
				rate: 100,
				amount: 100,
				sortOrder: 0,
			});
			return { quoteId: qId, documentId: dId };
		});

		const asPortal = t.withIdentity(ident(s, jti));
		const result = await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "typed",
			signatureRawData: JSON.stringify({ typedName: "Precision Client", font: "Caveat" }),
			ipAddress: "1.2.3.4",
			userAgent: "test-ua",
			termsAccepted: true,
		});
		expect(result.action).toBe("approved");
		expect(result.documentVersion).toBe(1);
	});

	it("returns ApprovalReceipt shape with signatureUrl resolved server-side", async () => {
		const s = await seedAll(t);
		const jti = "approve-jti-8";
		await seedSession(t, s, jti);
		const { quoteId, documentId } = await seedQuoteWithDoc(t, s, s.clientId);

		const asPortal = t.withIdentity(ident(s, jti));
		const r = await asPortal.action(api.portal.quotes.approve, {
			quoteId,
			expectedDocumentId: documentId,
			signatureBase64: VALID_PNG_B64,
			signatureMode: "typed",
			signatureRawData: "x",
			ipAddress: "1",
			userAgent: "u",
			termsAccepted: true,
		});
		expect(r).toMatchObject({
			action: "approved",
			documentVersion: 2,
			lineItemsCount: 2,
			total: 110,
		});
		expect(typeof r.auditId).toBe("string");
		expect(typeof r.createdAt).toBe("number");
		expect(typeof r.signatureStorageId).toBe("string");
		// signatureUrl is `string | null` — never `undefined`.
		expect(r.signatureUrl === null || typeof r.signatureUrl === "string").toBe(true);
	});
});
