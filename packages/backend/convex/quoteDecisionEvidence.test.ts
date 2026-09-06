import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildQuoteContentSnapshot } from "./lib/quoteContentSnapshot";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestClientContact,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";

const PORTAL_ISSUER = "https://portal.example.com";
const TEST_ATTESTATION = "test-portal-attestation-0123456789";
const PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const previousIssuer = process.env.PORTAL_JWT_ISSUER;
const previousAttestation = process.env.PORTAL_ATTESTATION_SECRET;

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
	process.env.PORTAL_ATTESTATION_SECRET = TEST_ATTESTATION;
});

afterAll(() => {
	if (previousIssuer === undefined) delete process.env.PORTAL_JWT_ISSUER;
	else process.env.PORTAL_JWT_ISSUER = previousIssuer;
	if (previousAttestation === undefined)
		delete process.env.PORTAL_ATTESTATION_SECRET;
	else process.env.PORTAL_ATTESTATION_SECRET = previousAttestation;
});

describe("quote decision evidence", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed(bound = true) {
		const base = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, orgId);
			await ctx.db.patch(clientId, { portalAccessId: "evidence-portal" });
			const contactId = await createTestClientContact(ctx, orgId, clientId, {
				email: "signer@example.com",
				isPrimary: true,
			});
			const signatureStorageId = await ctx.storage.store(new Blob(["signature"]));
			const quoteId = await ctx.db.insert("quotes", {
				orgId,
				clientId,
				title: "Bound quote",
				status: "sent",
				subtotal: 125,
				taxAmount: 0,
				total: 125,
				terms: "Net 30",
				sentAt: Date.now(),
			});
			await ctx.db.insert("quoteLineItems", {
				orgId,
				quoteId,
				description: "Service",
				quantity: 1,
				unit: "each",
				rate: 125,
				amount: 125,
				sortOrder: 0,
			});
			const quote = (await ctx.db.get(quoteId))!;
			const lines = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
				.collect();
			const snapshot = buildQuoteContentSnapshot(quote, lines);
			const storageId = await ctx.storage.store(new Blob(["pdf"]));
			const documentId = await ctx.db.insert("documents", {
				orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId,
				generatedAt: 10_000,
				version: 1,
				quoteContentSnapshot: bound ? snapshot : undefined,
			});
			await ctx.db.patch(quoteId, { latestDocumentId: documentId });
			await ctx.db.insert("portalSessions", {
				orgId,
				clientId,
				clientContactId: contactId,
				clientPortalId: "evidence-portal",
				tokenJti: "evidence-jti",
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
				expiresAt: Date.now() + 86_400_000,
			});
			return {
				orgId,
				clerkUserId,
				clerkOrgId,
				clientId,
				contactId,
				quoteId,
				documentId,
				signatureStorageId,
				snapshot,
			};
		});
		return {
			...base,
			asUser: t.withIdentity(
				createTestIdentity(base.clerkUserId, base.clerkOrgId),
			),
			asPortal: t.withIdentity({
				issuer: PORTAL_ISSUER,
				subject: base.contactId,
				aud: "convex-portal",
				jti: "evidence-jti",
				orgId: base.orgId,
				clientContactId: base.contactId,
				clientPortalId: "evidence-portal",
			}),
		};
	}

	const portalArgs = (s: Awaited<ReturnType<typeof seed>>) => ({
		attestation: TEST_ATTESTATION,
		intentAffirmed: true,
		quoteId: s.quoteId,
		expectedDocumentId: s.documentId,
		signatureBase64: PNG,
		signatureMode: "typed" as const,
		signatureRawData: "Jane",
		ipAddress: "1.2.3.4",
		userAgent: "test",
		termsAccepted: true as const,
	});

	it("records portal evidence linked to its audit and rendered snapshot", async () => {
		const s = await seed();
		const receipt = await s.asPortal.action(api.portal.quotes.approve, portalArgs(s));
		const evidence = await t.run(
			async (ctx) => (await ctx.db.query("quoteDecisionEvidence").collect())[0],
		);
		expect(evidence).toMatchObject({
			quoteId: s.quoteId,
			documentId: s.documentId,
			quoteApprovalId: receipt.auditId,
			action: "approved",
			channel: "portal",
			contentBinding: "rendered_document",
			contentSnapshot: s.snapshot,
		});
	});

	it("records portal decline evidence linked to its audit", async () => {
		const s = await seed();
		const receipt = await s.asPortal.mutation(api.portal.quotes.decline, {
			attestation: TEST_ATTESTATION,
			quoteId: s.quoteId,
			expectedDocumentId: s.documentId,
			declineReason: "Not this time",
			ipAddress: "1.2.3.4",
			userAgent: "test",
		});
		const evidence = await t.run(
			async (ctx) => (await ctx.db.query("quoteDecisionEvidence").collect())[0],
		);
		expect(evidence).toMatchObject({
			quoteApprovalId: receipt.auditId,
			action: "declined",
			channel: "portal",
			contentBinding: "rendered_document",
		});
	});

	it("records in-person evidence linked to its audit", async () => {
		const s = await seed();
		const receipt = await s.asUser.mutation(api.quotes.approveInPerson, {
			id: s.quoteId,
			clientContactId: s.contactId,
			expectedDocumentId: s.documentId,
			signatureStorageId: s.signatureStorageId,
		});
		const evidence = await t.run(
			async (ctx) => (await ctx.db.query("quoteDecisionEvidence").collect())[0],
		);
		expect(evidence).toMatchObject({
			quoteApprovalId: receipt.auditId,
			channel: "in_person",
			contentBinding: "rendered_document",
			contentSnapshot: s.snapshot,
		});
	});

	it("labels a legacy unbound PDF with a decision-time snapshot", async () => {
		const s = await seed(false);
		await s.asPortal.action(api.portal.quotes.approve, portalArgs(s));
		const evidence = await t.run(
			async (ctx) => (await ctx.db.query("quoteDecisionEvidence").collect())[0],
		);
		expect(evidence?.contentBinding).toBe("decision_time");
		expect(evidence?.contentSnapshot).toEqual(s.snapshot);
	});

	it("rejects same-timestamp source edits during preflight", async () => {
		const s = await seed();
		await t.run(async (ctx) => {
			const line = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", s.quoteId))
				.first();
			await ctx.db.patch(line!._id, { description: "Changed after render" });
		});
		await expect(
			s.asPortal.action(api.portal.quotes.approve, portalArgs(s)),
		).rejects.toThrow(/QUOTE_VERSION_STALE/);
		expect(
			await t.run(async (ctx) => ctx.db.query("quoteDecisionEvidence").collect()),
		).toHaveLength(0);
	});

	it("rolls back approval when legacy content changes after preflight", async () => {
		const s = await seed(false);
		const preflight = await t.query(internal.portal.quotes._preflightApproval, {
			quoteId: s.quoteId,
			expectedDocumentId: s.documentId,
			clientContactId: s.contactId,
			orgId: s.orgId,
		});
		await t.run(async (ctx) => {
			const line = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", s.quoteId))
				.first();
			await ctx.db.patch(line!._id, { rate: 150, amount: 150 });
		});
		await expect(
			t.mutation(internal.portal.quotes._commitApproval, {
				quoteId: s.quoteId,
				expectedDocumentId: s.documentId,
				clientContactId: s.contactId,
				orgId: s.orgId,
				action: "approved",
				ipAddress: "1",
				userAgent: "test",
				documentVersion: preflight.documentVersion,
				lineItemsSnapshot: preflight.lineItemsSnapshot,
				subtotal: preflight.subtotal,
				taxAmount: preflight.taxAmount,
				total: preflight.total,
				terms: preflight.terms,
				clientCompanyName: preflight.clientCompanyName,
				expectedContentSnapshot: preflight.contentSnapshot,
			}),
		).rejects.toThrow(/QUOTE_VERSION_STALE/);
		const rows = await t.run(async (ctx) => ({
			audits: await ctx.db.query("quoteApprovals").collect(),
			evidence: await ctx.db.query("quoteDecisionEvidence").collect(),
		}));
		expect(rows.audits).toHaveLength(0);
		expect(rows.evidence).toHaveLength(0);
	});

	it("manual status approval creates no decision evidence", async () => {
		const s = await seed();
		await s.asUser.mutation(api.quotes.update, {
			id: s.quoteId,
			status: "approved",
		});
		expect(
			await t.run(async (ctx) => ctx.db.query("quoteDecisionEvidence").collect()),
		).toHaveLength(0);
	});

	it("records distinct evidence for unchanged PDFs across reopened cycles", async () => {
		const s = await seed();
		await s.asUser.mutation(api.quotes.approveInPerson, {
			id: s.quoteId,
			clientContactId: s.contactId,
			expectedDocumentId: s.documentId,
			signatureStorageId: s.signatureStorageId,
		});
		await s.asUser.mutation(api.quotes.update, { id: s.quoteId, status: "draft" });
		await s.asUser.mutation(api.quotes.update, { id: s.quoteId, status: "sent" });
		const secondDocumentId = await t.run(async (ctx) => {
			const quote = (await ctx.db.get(s.quoteId))!;
			const lines = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", s.quoteId))
				.collect();
			const currentSnapshot = buildQuoteContentSnapshot(quote, lines);
			const storageId = await ctx.storage.store(new Blob(["pdf-v2"]));
			const id = await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: s.quoteId,
				storageId,
				generatedAt: 20_000,
				version: 2,
				quoteContentSnapshot: currentSnapshot,
			});
			await ctx.db.patch(s.quoteId, { latestDocumentId: id });
			return id;
		});
		await s.asUser.mutation(api.quotes.approveInPerson, {
			id: s.quoteId,
			clientContactId: s.contactId,
			expectedDocumentId: secondDocumentId,
			signatureStorageId: s.signatureStorageId,
		});
		const evidence = await t.run(async (ctx) =>
			ctx.db.query("quoteDecisionEvidence").collect(),
		);
		expect(evidence).toHaveLength(2);
		expect(new Set(evidence.map((row) => row.documentId))).toEqual(
			new Set([s.documentId, secondDocumentId]),
		);
		expect(evidence[0]?.quoteApprovalId).not.toBe(evidence[1]?.quoteApprovalId);
	});

	it("retains a legacy approval document even when no evidence row exists", async () => {
		const s = await seed(false);
		await t.run(async (ctx) => {
			await ctx.db.insert("quoteApprovals", {
				quoteId: s.quoteId,
				orgId: s.orgId,
				clientContactId: s.contactId,
				action: "approved",
				ipAddress: "legacy",
				userAgent: "legacy",
				documentId: s.documentId,
				documentVersion: 1,
				lineItemsSnapshot: s.snapshot.lineItems,
				subtotalSnapshot: s.snapshot.subtotal,
				taxSnapshot: s.snapshot.taxAmount,
				totalSnapshot: s.snapshot.total,
				createdAt: Date.now(),
			});
		});
		await expect(
			s.asUser.mutation(api.documents.remove, { id: s.documentId }),
		).rejects.toThrow(/approval history/i);
	});

	it("retains vendor-request documents against update and removal", async () => {
		const s = await seed(false);
		await t.run(async (ctx) => {
			await ctx.db.patch(s.documentId, {
				boldsign: {
					documentId: "vendor-request",
					status: "Sent",
					sentTo: [
						{
							name: "Signer",
							email: "signer@example.com",
							signerType: "Signer",
						},
					],
				},
			});
		});
		await expect(
			s.asUser.mutation(api.documents.update, {
				id: s.documentId,
				version: 2,
			}),
		).rejects.toThrow(/approval history/i);
		await expect(
			s.asUser.mutation(api.documents.remove, { id: s.documentId }),
		).rejects.toThrow(/approval history/i);
	});

	it("prevents in-place mutation of a fresh bound document but permits removal", async () => {
		const s = await seed();
		await expect(
			s.asUser.mutation(api.documents.update, {
				id: s.documentId,
				version: 2,
			}),
		).rejects.toThrow(/Generate a new version/i);
		await expect(
			s.asUser.mutation(api.documents.remove, { id: s.documentId }),
		).resolves.toBe(s.documentId);
		expect(await t.run(async (ctx) => ctx.db.get(s.documentId))).toBeNull();
	});

	it("denies cross-organization document mutation before retention checks", async () => {
		const s = await seed();
		const other = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "other-user",
				clerkOrgId: "other-org",
				userEmail: "other@example.com",
			}),
		);
		const asOther = t.withIdentity(
			createTestIdentity(other.clerkUserId, other.clerkOrgId),
		);
		await expect(
			asOther.mutation(api.documents.update, {
				id: s.documentId,
				version: 2,
			}),
		).rejects.toThrow();
		await expect(
			asOther.mutation(api.documents.remove, { id: s.documentId }),
		).rejects.toThrow();
		expect(await t.run(async (ctx) => ctx.db.get(s.documentId))).not.toBeNull();
	});

	it("regenerates and repins a bound document after a same-timestamp reopen edit", async () => {
		const s = await seed();
		await s.asUser.mutation(api.quotes.approveInPerson, {
			id: s.quoteId,
			clientContactId: s.contactId,
			expectedDocumentId: s.documentId,
			signatureStorageId: s.signatureStorageId,
		});
		await s.asUser.mutation(api.quotes.update, { id: s.quoteId, status: "draft" });
		await s.asUser.mutation(api.quotes.update, {
			id: s.quoteId,
			title: "Edited in the new cycle",
		});
		await s.asUser.mutation(api.quotes.update, { id: s.quoteId, status: "sent" });
		await t.run(async (ctx) => {
			await ctx.db.patch(s.documentId, { generatedAt: 30_000 });
			await ctx.db.patch(s.quoteId, { contentUpdatedAt: 30_000 });
		});
		expect(
			await s.asUser.query(internal.pdfData._ensureQuotePdfAuth, {
				quoteId: s.quoteId,
			}),
		).toMatchObject({ existingDocumentId: null });

		const currentDocumentId = await t.run(async (ctx) => {
			const quote = (await ctx.db.get(s.quoteId))!;
			const lines = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", s.quoteId))
				.collect();
			const storageId = await ctx.storage.store(new Blob(["current-pdf"]));
			return await ctx.db.insert("documents", {
				orgId: s.orgId,
				documentType: "quote",
				documentId: s.quoteId,
				storageId,
				generatedAt: 30_000,
				version: 2,
				quoteContentSnapshot: buildQuoteContentSnapshot(quote, lines),
			});
		});
		expect(
			await s.asUser.query(internal.pdfData._ensureQuotePdfAuth, {
				quoteId: s.quoteId,
			}),
		).toMatchObject({ existingDocumentId: currentDocumentId });
		await s.asUser.mutation(api.quotes.approveInPerson, {
			id: s.quoteId,
			clientContactId: s.contactId,
			expectedDocumentId: currentDocumentId,
			signatureStorageId: s.signatureStorageId,
		});
		const quote = await t.run(async (ctx) => ctx.db.get(s.quoteId));
		expect(quote?.latestDocumentId).toBe(currentDocumentId);
	});
});
