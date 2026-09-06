import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestClient, createTestIdentity, createTestOrg } from "./test.helpers";
import { triggers } from "./lib/triggers";

describe("recurring agreements", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 8, 6)); t = setupConvexTest(); });

	async function fixture() {
		const org = await t.run(async (ctx) => { const setup = await createTestOrg(ctx); return { ...setup, clientId: await createTestClient(ctx, setup.orgId) }; });
		const user = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const projectId = await user.mutation(api.projects.create, { clientId: org.clientId, title: "Weekly cleaning", status: "planned", projectType: "recurring", startDate: Date.UTC(2026, 8, 6), recurrenceRule: { frequency: "weekly", interval: 1, end: { kind: "count", count: 3 } } });
		const project = (await t.run((ctx) => ctx.db.get(projectId)))!;
		const quoteId = await user.mutation(api.quotes.create, { projectId, clientId: org.clientId, title: "Standing scope", status: "draft", subtotal: 0, total: 0 });
		await user.mutation(api.quoteLineItems.create, { quoteId, description: "Service", quantity: 1, unit: "visit", rate: 125, sortOrder: 0 });
		return { ...org, user, projectId, seriesId: project.recurringSeriesId!, quoteId };
	}

	it("captures a pending immutable revision without publishing its quote template", async () => {
		const f = await fixture();
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		const prepared = await f.user.mutation(api.projectSeriesAgreements.prepare, { quoteId: f.quoteId, billingMode: "per_visit", paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }, proposedScope: { title: "Approved cleaning scope", description: "Kitchen and bath" }, proposedRule: { frequency: "weekly", interval: 2, end: { kind: "count", count: 8 } }, expectedSeriesRevision: setup.revision });
		const [series, revision, quote] = await t.run(async (ctx) => Promise.all([ctx.db.get(f.seriesId), ctx.db.get(prepared.revisionId), ctx.db.get(f.quoteId)]));
		expect(series).toMatchObject({ agreementQuoteId: f.quoteId, pendingAgreementRevisionId: prepared.revisionId });
		expect(revision).toMatchObject({ status: "draft", revisionNumber: 1, approvalCycle: 0 });
		expect(revision!.terms).toEqual(prepared.terms);
		expect(prepared.terms.scope).toEqual({ title: "Approved cleaning scope", description: "Kitchen and bath" });
		expect(prepared.terms.schedule.rule).toEqual({ frequency: "weekly", interval: 2, end: { kind: "count", count: 8 } });
		expect((await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId })).savedTerms).toEqual(prepared.terms);
		expect(quote!.recurringAgreementTerms?.paymentRule).toEqual({ type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] });
		const template = await t.run((ctx) => ctx.db.get(revision!.templateId));
		expect(template!.active).toBe(false);
	});

	it("discards an unsent revision while preserving its history and source references", async () => {
		const f = await fixture();
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		const prepared = await f.user.mutation(api.projectSeriesAgreements.prepare, { quoteId: f.quoteId, billingMode: "per_visit", paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }, expectedSeriesRevision: setup.revision });
		await f.user.mutation(api.projectSeriesAgreements.discardPending, { seriesId: f.seriesId, expectedRevisionId: prepared.revisionId });
		const [series, revision, quote] = await t.run(async (ctx) => Promise.all([ctx.db.get(f.seriesId), ctx.db.get(prepared.revisionId), ctx.db.get(f.quoteId)]));
		expect(series?.pendingAgreementRevisionId).toBeUndefined();
		expect(series?.agreementQuoteId).toBeUndefined();
		expect(revision).toMatchObject({ status: "superseded", sourceQuoteId: f.quoteId, quoteVersionId: expect.any(String), withdrawnAt: Date.now() });
		expect(quote).toMatchObject({ status: "draft", approvalCycle: 1 });
		expect(quote?.recurringAgreementRevisionId).toBeUndefined();
		const agreement = await f.user.query(api.projectSeriesAgreements.getSeriesAgreement, { seriesId: f.seriesId });
		expect(agreement.history[0]).toMatchObject({ _id: prepared.revisionId, deliveryState: "withdrawn", canDiscard: false, canWithdraw: false });
	});

	it("does not expose or discard another organization's agreement", async () => {
		const f = await fixture();
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
		const prepared = await f.user.mutation(api.projectSeriesAgreements.prepare, { quoteId: f.quoteId, billingMode: "per_visit", paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] }, expectedSeriesRevision: setup.revision });
		const outsider = await t.run(async (ctx) => createTestOrg(ctx, { clerkOrgId: "org_outside", clerkUserId: "user_outside" }));
		const otherUser = t.withIdentity(createTestIdentity(outsider.clerkUserId, outsider.clerkOrgId));
		await expect(otherUser.query(api.projectSeriesAgreements.getSeriesAgreement, { seriesId: f.seriesId })).rejects.toThrow();
		await expect(otherUser.mutation(api.projectSeriesAgreements.discardPending, { seriesId: f.seriesId, expectedRevisionId: prepared.revisionId })).rejects.toThrow();
		expect((await t.run((ctx) => ctx.db.get(f.seriesId)))?.pendingAgreementRevisionId).toBe(prepared.revisionId);
	});

	it("marks a reopened inherited visit as an override and removes inherited approval provenance", async () => {
		const f = await fixture();
		await t.run(async (ctx) => {
			const db = triggers.wrapDB(ctx).db;
			await db.patch(f.quoteId, { status: "approved", approvedAt: 10, recurringInheritedAt: 10 });
			await db.patch(f.quoteId, { status: "draft", approvedAt: undefined });
		});
		const quote = await t.run((ctx) => ctx.db.get(f.quoteId));
		expect(quote).toMatchObject({ status: "draft", recurringQuoteOverride: true, approvalCycle: 1 });
		expect(quote!.recurringInheritedAt).toBeUndefined();
	});
});
