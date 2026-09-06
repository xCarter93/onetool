import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestClient, createTestClientContact, createTestIdentity, createTestOrg } from "./test.helpers";

const NOW = Date.UTC(2026, 8, 6, 16);

describe("recurring agreement document boundaries", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); t = setupConvexTest(); });
	afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

	async function fixture(proposedRule?: { frequency: "weekly"; interval: number; end: { kind: "count"; count: number } }, copyBeforePrepare = false) {
		const org = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const contactId = await createTestClientContact(ctx, org.orgId, clientId, { isPrimary: true, email: "client@example.com" });
			return { ...org, clientId, contactId };
		});
		const user = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const projectId = await user.mutation(api.projects.create, { clientId: org.clientId, title: "Weekly care", status: "planned", projectType: "recurring", startDate: NOW, recurrenceRule: { frequency: "weekly", interval: 1, end: { kind: "count", count: 3 } } });
		const quoteId = await user.mutation(api.quotes.create, { clientId: org.clientId, projectId, status: "draft", title: "Grounds care", subtotal: 0, total: 0 });
		await user.mutation(api.quoteLineItems.create, { quoteId, description: "Mow lawn", quantity: 1, unit: "visit", rate: 75, sortOrder: 0 });
		if (copyBeforePrepare) {
			const preview = await user.query(api.projectSeriesQuotes.previewCopy, { quoteId });
			await user.mutation(api.projectSeriesQuotes.copy, { quoteId, expectedRevision: preview.revision });
		}
		const setup = await user.query(api.projectSeriesAgreements.getSetup, { quoteId });
		await user.mutation(api.projectSeriesAgreements.prepare, { quoteId, billingMode: "per_visit", paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }, proposedRule, expectedSeriesRevision: setup.revision });
		const data = await t.query(internal.pdfData._getQuoteRenderData, { quoteId, orgId: org.orgId });
		const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["controlled PDF"])));
		return { ...org, user, projectId, seriesId: setup.seriesId, quoteId, data, storageId };
	}

	async function approveControlled(f: Awaited<ReturnType<typeof fixture>>, providerId: string) {
		const { documentId } = await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot });
		await f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId: f.quoteId, documentId });
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, { quoteId: f.quoteId, documentId, boldsignDocumentId: providerId, recurringAgreementLocked: true, sendUrl: "", sendUrlExpiresAt: NOW, sentTo: [] });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: providerId, eventType: "Completed" });
	}

	it("rejects browser uploads, including legacy uploads without a content snapshot", async () => {
		const f = await fixture();
		for (const snapshot of [undefined, f.data.quoteContentSnapshot]) {
			await expect(f.user.mutation(api.documents.create, { documentType: "quote", documentId: f.quoteId, storageId: f.storageId, quoteContentSnapshot: snapshot })).rejects.toThrow(/server renderer/);
		}
	});

	it("binds recurring terms to the controlled PDF and rejects a same-time terms change", async () => {
		const f = await fixture();
		expect(f.data.quoteContentSnapshot.recurringAgreementTerms?.billingMode).toBe("per_visit");
		await t.run(async (ctx) => {
			const quote = (await ctx.db.get(f.quoteId))!;
			await ctx.db.patch(f.quoteId, { recurringAgreementTerms: { ...quote.recurringAgreementTerms!, billingMode: "monthly" } });
		});
		await expect(t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot })).rejects.toThrow(/changed while/);
	});

	it("reserves one controlled signature request and refuses duplicate sends", async () => {
		const f = await fixture();
		const { documentId } = await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot });
		await f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId: f.quoteId, documentId });
		await expect(f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId: f.quoteId, documentId })).rejects.toThrow(/already sent or being checked/);
		await t.mutation(internal.boldsign.markRecurringSignatureUncertain, { documentId });
		await expect(f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId: f.quoteId, documentId })).rejects.toThrow(/already sent or being checked/);
	});

	it("sends the controlled PDF once through the direct provider API", async () => {
		const f = await fixture();
		await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot });
		vi.stubEnv("BOLDSIGN_API_KEY", "test-key");
		const { DocumentApi } = await import("boldsign");
		const send = vi.spyOn(DocumentApi.prototype, "sendDocument").mockResolvedValue({ documentId: "direct-controlled" });
		expect(await f.user.action(api.boldsignActions.sendRecurringAgreementForSignature, { quoteId: f.quoteId })).toEqual({ ok: true });
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toMatchObject({ useTextTags: true, disableEmails: false, signers: [{ emailAddress: "client@example.com" }] });
		const quote = await t.run((ctx) => ctx.db.get(f.quoteId));
		expect(quote?.status).toBe("sent");
		await f.user.action(api.boldsignActions.sendRecurringAgreementForSignature, { quoteId: f.quoteId });
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("activates the exact agreement from a controlled signature once without copy signatures", async () => {
		const f = await fixture();
		const { documentId } = await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot });
		await f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId: f.quoteId, documentId });
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, { quoteId: f.quoteId, documentId, boldsignDocumentId: "controlled-agreement", recurringAgreementLocked: true, sendUrl: "", sendUrlExpiresAt: NOW, sentTo: [] });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "controlled-agreement", eventType: "Completed" });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "controlled-agreement", eventType: "Completed" });
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		expect(setup.active?.status).toBe("approved");
		const copies = await t.run((ctx) => ctx.db.query("quotes").withIndex("by_client", (q) => q.eq("clientId", f.clientId)).collect());
		expect(copies.filter((q) => q._id !== f.quoteId)).toHaveLength(2);
		for (const copy of copies.filter((q) => q._id !== f.quoteId)) {
			expect(copy.status).toBe("approved");
			expect(copy.recurringInheritedAt).toBeTruthy();
			expect(copy.latestDocumentId).toBeUndefined();
		}
		const audits = await t.run((ctx) => ctx.db.query("quoteApprovals").collect());
		expect(audits).toHaveLength(0);
		const decisions = await t.run((ctx) => ctx.db.query("quoteDecisionEvidence").collect());
		expect(decisions).toHaveLength(1);
	});

	it("does not activate an agreement after the vendor reports document editing", async () => {
		const f = await fixture();
		const { documentId } = await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot });
		await f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId: f.quoteId, documentId });
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, { quoteId: f.quoteId, documentId, boldsignDocumentId: "agreement-signature", recurringAgreementLocked: true, sendUrl: "", sendUrlExpiresAt: NOW, sentTo: [] });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "agreement-signature", eventType: "Sent" });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "agreement-signature", eventType: "Edited" });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "agreement-signature", eventType: "Completed" });
		const quote = await t.run((ctx) => ctx.db.get(f.quoteId));
		expect(quote?.status).toBe("sent");
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		expect(setup.active).toBeNull();
		const evidence = await t.run((ctx) => ctx.db.query("quoteDecisionEvidence").withIndex("by_quote", (q) => q.eq("quoteId", f.quoteId)).collect());
		expect(evidence).toHaveLength(1);
	});

	it("holds an active agreement when an Edited event arrives after Completed", async () => {
		const f = await fixture();
		await approveControlled(f, "late-edited-agreement");
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "late-edited-agreement", eventType: "Edited", eventTimestamp: NOW + 1 });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: "late-edited-agreement", eventType: "Completed", eventTimestamp: NOW + 2 });
		const series = await t.run((ctx) => ctx.db.get(f.seriesId));
		expect(series).toMatchObject({ agreementReviewRequired: true });
		expect(series?.activeAgreementRevisionId).toBeTruthy();
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		expect(setup.canRestoreAgreementPricing).toBe(false);
	});

	it("rejects binding when pricing changes after the agreement was prepared", async () => {
		const f = await fixture();
		const line = await t.run((ctx) => ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", f.quoteId)).first());
		await f.user.mutation(api.quoteLineItems.update, { id: line!._id, rate: 95 });
		await expect(t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot })).rejects.toThrow(/changed while|Prepare the updated/);
	});

	it("applies cadence only after approval and emits no inherited approval events", async () => {
		const f = await fixture({ frequency: "weekly", interval: 2, end: { kind: "count", count: 6 } });
		expect((await t.run((ctx) => ctx.db.get(f.seriesId)))!.rule.interval).toBe(1);
		await approveControlled(f, "cadence-agreement");
		expect((await t.run((ctx) => ctx.db.get(f.seriesId)))!.rule.interval).toBe(2);
		const approvalEvents = await t.run(async (ctx) => (await ctx.db.query("domainEvents").collect()).filter((event) => event.eventType === "entity.status_changed" && event.payload.entityType === "quote" && event.payload.newValue === "approved"));
		expect(approvalEvents).toHaveLength(1);
		expect(approvalEvents[0]!.payload.entityId).toBe(f.quoteId);
	});

	it("protects a visit override and restores the exact active agreement pricing", async () => {
		const f = await fixture();
		await approveControlled(f, "restore-agreement");
		const copy = await t.run(async (ctx) => (await ctx.db.query("quotes").withIndex("by_client", (q) => q.eq("clientId", f.clientId)).collect()).find((quote) => quote._id !== f.quoteId)!);
		await f.user.mutation(api.quotes.update, { id: copy._id, status: "draft" });
		const line = await t.run((ctx) => ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", copy._id)).first());
		await f.user.mutation(api.quoteLineItems.update, { id: line!._id, rate: 200 });
		expect((await t.run((ctx) => ctx.db.get(copy._id)))!.recurringQuoteOverride).toBe(true);
		await f.user.mutation(api.projectSeriesAgreements.restoreVisit, { quoteId: copy._id });
		const restored = await t.run((ctx) => ctx.db.get(copy._id));
		const restoredLine = await t.run((ctx) => ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", copy._id)).first());
		expect(restored).toMatchObject({ status: "approved", recurringQuoteOverride: false, total: 75 });
		expect(restoredLine?.rate).toBe(75);
	});

	it("does not inherit approval onto copies from an earlier saved version", async () => {
		const f = await fixture(undefined, true);
		await approveControlled(f, "stale-copy-agreement");
		const copies = await t.run(async (ctx) => (await ctx.db.query("quotes").withIndex("by_client", (q) => q.eq("clientId", f.clientId)).collect()).filter((quote) => quote._id !== f.quoteId));
		expect(copies).toHaveLength(2);
		expect(copies.every((quote) => quote.status === "draft" && quote.recurringInheritedAt === undefined)).toBe(true);
	});

	it("activates the exact agreement through in-person approval", async () => {
		const f = await fixture();
		const { documentId } = await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: f.quoteId, orgId: f.orgId, storageId: f.storageId, quoteContentSnapshot: f.data.quoteContentSnapshot });
		await f.user.mutation(api.quotes.update, { id: f.quoteId, status: "sent" });
		const signatureStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["signature"])));
		await f.user.mutation(api.quotes.approveInPerson, { id: f.quoteId, clientContactId: f.contactId, expectedDocumentId: documentId, signatureStorageId, signatureRawData: JSON.stringify([{ d: "M0,0 L1,1" }]) });
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		expect(setup.active?.status).toBe("approved");
		const copies = await t.run(async (ctx) => (await ctx.db.query("quotes").withIndex("by_client", (q) => q.eq("clientId", f.clientId)).collect()).filter((quote) => quote._id !== f.quoteId));
		expect(copies).toHaveLength(2);
		expect(copies.every((quote) => quote.status === "approved" && quote.recurringInheritedAt !== undefined)).toBe(true);
	});

	it("revises through a fresh quote without changing the invoiced agreement source", async () => {
		const f = await fixture();
		await approveControlled(f, "original-agreement");
		const invoiceId = await f.user.mutation(api.invoices.createFromQuote, { quoteId: f.quoteId });
		const original = await t.run((ctx) => ctx.db.get(f.quoteId));
		const { quoteId: revisionQuoteId } = await f.user.mutation(api.projectSeriesAgreements.createRevisionDraft, { seriesId: f.seriesId });
		const revisionDraft = await t.run((ctx) => ctx.db.get(revisionQuoteId));
		expect(revisionDraft).toMatchObject({ status: "draft", recurringAgreementSourceQuoteId: f.quoteId, total: 75 });
		expect(revisionDraft!.quoteNumber).not.toBe(original!.quoteNumber);
		const revisionLine = await t.run((ctx) => ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", revisionQuoteId)).first());
		await f.user.mutation(api.quoteLineItems.update, { id: revisionLine!._id, rate: 95 });
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: revisionQuoteId });
		await f.user.mutation(api.projectSeriesAgreements.prepare, { quoteId: revisionQuoteId, billingMode: "per_visit", paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }, expectedSeriesRevision: setup.revision });
		const data = await t.query(internal.pdfData._getQuoteRenderData, { quoteId: revisionQuoteId, orgId: f.orgId });
		const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["revised PDF"])));
		await approveControlled({ ...f, quoteId: revisionQuoteId, data, storageId }, "revised-agreement");
		const [unchangedOriginal, invoice, series] = await t.run(async (ctx) => Promise.all([ctx.db.get(f.quoteId), ctx.db.get(invoiceId), ctx.db.get(f.seriesId)]));
		expect(unchangedOriginal).toMatchObject({ status: "approved", total: 75 });
		expect(invoice).toMatchObject({ total: 75, quoteId: f.quoteId });
		expect(series!.agreementQuoteId).toBe(f.quoteId);
		const active = await t.run((ctx) => ctx.db.get(series!.activeAgreementRevisionId!));
		expect(active!.sourceQuoteId).toBe(revisionQuoteId);
	});
});
