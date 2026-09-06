import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestClient, createTestIdentity, createTestOrg } from "./test.helpers";

const NOW = Date.UTC(2026, 8, 6, 16);
const ORIGINAL = { type: "percentage" as const, installments: [{ percentage: 100, dayOffset: 30 }] };
const CHANGED = { type: "percentage" as const, installments: [{ percentage: 40, dayOffset: 0 }, { percentage: 60, dayOffset: 20 }] };

describe("approved future payment arrangements", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); t = setupConvexTest(); });
	afterEach(() => vi.useRealTimers());

	async function approve(user: ReturnType<typeof t.withIdentity>, orgId: Id<"organizations">, quoteId: Id<"quotes">) {
		const data = await t.query(internal.pdfData._getQuoteRenderData, { quoteId, orgId });
		const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["PDF"])));
		const { documentId } = await t.mutation(internal.pdfData._insertGeneratedDocument, { documentType: "quote", documentId: quoteId, orgId, storageId, quoteContentSnapshot: data.quoteContentSnapshot });
		await user.mutation(internal.boldsign.reserveRecurringSignatureSend, { quoteId, documentId });
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, { quoteId, documentId, boldsignDocumentId: String(documentId), recurringAgreementLocked: true, sendUrl: "", sendUrlExpiresAt: NOW, sentTo: [] });
		await t.mutation(internal.boldsign.handleWebhook, { boldsignDocumentId: String(documentId), eventType: "Completed" });
	}

	async function fixture(mode: "monthly" | "per_visit", count = 1) {
		const org = await t.run(async (ctx) => { const org = await createTestOrg(ctx); return { ...org, clientId: await createTestClient(ctx, org.orgId) }; });
		const user = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const series = [];
		for (let i = 0; i < count; i++) {
			const projectId = await user.mutation(api.projects.create, { clientId: org.clientId, title: `Service ${i}`, status: "planned", projectType: "recurring", startDate: NOW, recurrenceRule: { frequency: "weekly", interval: 1, end: { kind: "count", count: 8 } } });
			const quoteId = await user.mutation(api.quotes.create, { clientId: org.clientId, projectId, status: "draft", title: `Services ${i}`, subtotal: 0, total: 0 });
			await user.mutation(api.quoteLineItems.create, { quoteId, description: "Mow lawn", quantity: 1, unit: "visit", rate: 75, sortOrder: 0 });
			const setup = await user.query(api.projectSeriesAgreements.getSetup, { quoteId });
			const prepared = await user.mutation(api.projectSeriesAgreements.prepare, { quoteId, billingMode: mode, paymentRule: ORIGINAL, expectedSeriesRevision: setup.revision });
			await approve(user, org.orgId, quoteId);
			series.push({ projectId, quoteId, seriesId: setup.seriesId, revisionId: prepared.revisionId });
		}
		const invoiceId = await user.mutation(api.invoices.createFromQuote, { quoteId: series[0].quoteId });
		return { ...org, user, series, invoiceId };
	}

	it("keeps the billed source intact and waits for per-visit agreement approval", async () => {
		const f = await fixture("per_visit");
		const originalQuote = await t.run((ctx) => ctx.db.get(f.series[0].quoteId));
		const result = await f.user.mutation(api.payments.configurePaymentsWithScope, { invoiceId: f.invoiceId, scope: "future", futureRule: CHANGED, expectedPaymentRuleSourceRevisionId: f.series[0].revisionId, payments: [{ paymentAmount: 75, dueDate: NOW, sortOrder: 0 }] });
		expect(result.futureProposal?.quoteIds).toHaveLength(1);
		const draftId = result.futureProposal!.quoteIds[0];
		expect(draftId).not.toBe(f.series[0].quoteId);
		expect(await t.run((ctx) => ctx.db.get(f.series[0].quoteId))).toEqual(originalQuote);
		expect((await t.run((ctx) => ctx.db.get(f.series[0].seriesId)))?.activeAgreementRevisionId).toBe(f.series[0].revisionId);
		await approve(f.user, f.orgId, draftId);
		const series = await t.run((ctx) => ctx.db.get(f.series[0].seriesId));
		expect(series?.activeAgreementRevisionId).not.toBe(f.series[0].revisionId);
		await expect(f.user.mutation(api.invoices.createFromQuote, { quoteId: draftId })).rejects.toThrow(/revision|visit/i);
	});

	it("requires every monthly agreement then waits for the next full month", async () => {
		const f = await fixture("monthly", 2);
		const result = await f.user.mutation(api.payments.configurePaymentsWithScope, { invoiceId: f.invoiceId, scope: "future", futureRule: CHANGED, expectedPaymentRuleSourceRevisionId: f.series[0].revisionId, payments: [{ paymentAmount: 75, dueDate: NOW, sortOrder: 0 }] });
		const proposal = result.futureProposal!;
		expect(proposal.quoteIds).toHaveLength(2);
		await approve(f.user, f.orgId, proposal.quoteIds[0]);
		let version = await t.run((ctx) => ctx.db.get(proposal.monthlyScheduleVersionId!));
		expect(version?.status).toBe("pending_approval");
		await t.mutation(internal.recurringPaymentSchedules.activateClient, { orgId: f.orgId, clientId: f.clientId });
		for (const s of f.series) expect((await t.run((ctx) => ctx.db.get(s.seriesId)))?.activeAgreementRevisionId).toBe(s.revisionId);
		await approve(f.user, f.orgId, proposal.quoteIds[1]);
		version = await t.run((ctx) => ctx.db.get(proposal.monthlyScheduleVersionId!));
		expect(version).toMatchObject({ status: "scheduled", effectiveMonth: "2026-10" });
		await t.mutation(internal.recurringPaymentSchedules.activateClient, { orgId: f.orgId, clientId: f.clientId });
		for (const s of f.series) expect((await t.run((ctx) => ctx.db.get(s.seriesId)))?.activeAgreementRevisionId).toBe(s.revisionId);
		vi.setSystemTime(Date.UTC(2026, 9, 1, 16));
		for (let i = 0; i < 3; i++) await t.mutation(internal.recurringPaymentSchedules.activateClient, { orgId: f.orgId, clientId: f.clientId });
		expect((await t.run((ctx) => ctx.db.get(proposal.monthlyScheduleVersionId!)))?.status).toBe("active");
		for (const s of f.series) expect((await t.run((ctx) => ctx.db.get(s.seriesId)))?.activeAgreementRevisionId).not.toBe(s.revisionId);
	});
});
