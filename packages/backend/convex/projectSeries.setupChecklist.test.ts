import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";

const NOW = Date.UTC(2026, 8, 6, 16);

describe("projectSeries.getSetupChecklist", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
	});
	afterEach(() => vi.useRealTimers());

	async function fixture() {
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx);
			return { ...setup, clientId: await createTestClient(ctx, setup.orgId) };
		});
		const user = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId),
		);
		const projectId = await user.mutation(api.projects.create, {
			clientId: org.clientId,
			title: "Weekly care",
			status: "planned",
			projectType: "recurring",
			startDate: NOW,
			recurrenceRule: {
				frequency: "weekly",
				interval: 1,
				end: { kind: "count", count: 3 },
			},
		});
		const project = (await t.run((ctx) => ctx.db.get(projectId)))!;
		return { ...org, user, projectId, seriesId: project.recurringSeriesId! };
	}

	async function addQuote(f: Awaited<ReturnType<typeof fixture>>) {
		const quoteId = await f.user.mutation(api.quotes.create, {
			clientId: f.clientId,
			projectId: f.projectId,
			status: "draft",
			title: "Grounds care",
			subtotal: 0,
			total: 0,
		});
		await f.user.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Mow lawn",
			quantity: 1,
			unit: "visit",
			rate: 125,
			sortOrder: 0,
		});
		return quoteId;
	}

	async function prepareAgreement(
		f: Awaited<ReturnType<typeof fixture>>,
		quoteId: Id<"quotes">,
	) {
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, {
			quoteId,
		});
		await f.user.mutation(api.projectSeriesAgreements.prepare, {
			quoteId,
			billingMode: "per_visit",
			paymentRule: {
				type: "percentage",
				installments: [{ percentage: 100, dayOffset: 0 }],
			},
			expectedSeriesRevision: setup.revision,
		});
	}

	async function signAgreement(
		f: Awaited<ReturnType<typeof fixture>>,
		quoteId: Id<"quotes">,
	) {
		const data = await t.query(internal.pdfData._getQuoteRenderData, {
			quoteId,
			orgId: f.orgId,
		});
		const storageId = await t.run((ctx) =>
			ctx.storage.store(new Blob(["PDF"])),
		);
		const { documentId } = await t.mutation(
			internal.pdfData._insertGeneratedDocument,
			{
				documentType: "quote",
				documentId: quoteId,
				orgId: f.orgId,
				storageId,
				quoteContentSnapshot: data.quoteContentSnapshot,
			},
		);
		await f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, {
			quoteId,
			documentId,
		});
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, {
			quoteId,
			documentId,
			boldsignDocumentId: String(documentId),
			recurringAgreementLocked: true,
			sendUrl: "",
			sendUrlExpiresAt: NOW,
			sentTo: [],
		});
		await t.mutation(internal.boldsign.handleWebhook, {
			boldsignDocumentId: String(documentId),
			eventType: "Completed",
		});
	}

	it("reports only the schedule for a fresh series", async () => {
		const f = await fixture();
		expect(
			await f.user.query(api.projectSeries.getSetupChecklist, {
				seriesId: f.seriesId,
			}),
		).toEqual({ quote: null, billing: null });
	});

	it("finds a quote on a visit before any agreement exists", async () => {
		const f = await fixture();
		const quoteId = await addQuote(f);
		const checklist = await f.user.query(
			api.projectSeries.getSetupChecklist,
			{ seriesId: f.seriesId },
		);
		expect(checklist.quote).toMatchObject({ _id: quoteId, total: 125 });
		expect(checklist.quote?.quoteNumber).toBeTruthy();
		expect(checklist.billing).toBeNull();
	});

	it("ignores a visit quote that can no longer start an agreement", async () => {
		const f = await fixture();
		const quoteId = await addQuote(f);
		await f.user.mutation(api.quotes.update, { id: quoteId, status: "sent" });
		const checklist = await f.user.query(
			api.projectSeries.getSetupChecklist,
			{ seriesId: f.seriesId },
		);
		expect(checklist.quote).toBeNull();
	});

	it("keeps billing unset while the agreement is pending", async () => {
		const f = await fixture();
		const quoteId = await addQuote(f);
		await prepareAgreement(f, quoteId);
		const series = (await t.run((ctx) => ctx.db.get(f.seriesId)))!;
		expect(series.agreementQuoteId).toBe(quoteId);
		expect(series.pendingAgreementRevisionId).toBeDefined();
		const checklist = await f.user.query(
			api.projectSeries.getSetupChecklist,
			{ seriesId: f.seriesId },
		);
		expect(checklist.quote?._id).toBe(quoteId);
		expect(checklist.billing).toBeNull();
	});

	it("reports the billing mode once the agreement is approved", async () => {
		const f = await fixture();
		const quoteId = await addQuote(f);
		await prepareAgreement(f, quoteId);
		await signAgreement(f, quoteId);
		const series = (await t.run((ctx) => ctx.db.get(f.seriesId)))!;
		expect(series.activeAgreementRevisionId).toBeDefined();
		expect(
			await f.user.query(api.projectSeries.getSetupChecklist, {
				seriesId: f.seriesId,
			}),
		).toMatchObject({
			quote: { _id: quoteId, total: 125 },
			billing: { mode: "per_visit" },
		});
	});

	it("rejects a series from another organization", async () => {
		const f = await fixture();
		const other = await t.run((ctx) => createTestOrg(ctx));
		const outsider = t.withIdentity(
			createTestIdentity(other.clerkUserId, other.clerkOrgId),
		);
		await expect(
			outsider.query(api.projectSeries.getSetupChecklist, {
				seriesId: f.seriesId,
			}),
		).rejects.toThrow();
	});
});
