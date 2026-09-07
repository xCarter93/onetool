import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";
import { monthlyRuleForPeriod } from "./lib/recurringPaymentChanges";

const NOW = Date.UTC(2026, 8, 6, 16);
const ORIGINAL = {
	type: "percentage" as const,
	installments: [{ percentage: 100, dayOffset: 30 }],
};
const CHANGED = {
	type: "percentage" as const,
	installments: [
		{ percentage: 40, dayOffset: 0 },
		{ percentage: 60, dayOffset: 20 },
	],
};

describe("monthly payment proposal cancellation", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
	});
	afterEach(() => vi.useRealTimers());

	async function approve(
		user: ReturnType<typeof t.withIdentity>,
		orgId: Id<"organizations">,
		quoteId: Id<"quotes">,
	) {
		const data = await t.query(internal.pdfData._getQuoteRenderData, {
			quoteId,
			orgId,
		});
		const storageId = await t.run((ctx) =>
			ctx.storage.store(new Blob(["PDF"])),
		);
		const { documentId } = await t.mutation(
			internal.pdfData._insertGeneratedDocument,
			{
				documentType: "quote",
				documentId: quoteId,
				orgId,
				storageId,
				quoteContentSnapshot: data.quoteContentSnapshot,
			},
		);
		await user.mutation(internal.boldsign.reserveRecurringSignatureSend, {
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

	async function fixture() {
		const org = await t.run(async (ctx) => {
			const value = await createTestOrg(ctx);
			return { ...value, clientId: await createTestClient(ctx, value.orgId) };
		});
		const user = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId),
		);
		const series: Array<{
			seriesId: Id<"projectSeries">;
			quoteId: Id<"quotes">;
			revisionId: Id<"projectSeriesAgreementRevisions">;
		}> = [];
		for (let i = 0; i < 2; i++) {
			const projectId = await user.mutation(api.projects.create, {
				clientId: org.clientId,
				title: `Service ${i}`,
				status: "planned",
				projectType: "recurring",
				startDate: NOW,
				recurrenceRule: {
					frequency: "weekly",
					interval: 1,
					end: { kind: "count", count: 8 },
				},
			});
			const quoteId = await user.mutation(api.quotes.create, {
				clientId: org.clientId,
				projectId,
				status: "draft",
				title: `Services ${i}`,
				subtotal: 0,
				total: 0,
			});
			await user.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Mow",
				quantity: 1,
				unit: "visit",
				rate: 75,
				sortOrder: 0,
			});
			const setup = await user.query(api.projectSeriesAgreements.getSetup, {
				quoteId,
			});
			const prepared = await user.mutation(
				api.projectSeriesAgreements.prepare,
				{
					quoteId,
					billingMode: "monthly",
					paymentRule: ORIGINAL,
					expectedSeriesRevision: setup.revision,
				},
			);
			await approve(user, org.orgId, quoteId);
			series.push({
				seriesId: setup.seriesId,
				quoteId,
				revisionId: prepared.revisionId,
			});
		}
		const invoiceId = await user.mutation(api.invoices.createFromQuote, {
			quoteId: series[0].quoteId,
		});
		return { ...org, user, series, invoiceId };
	}

	it("cancels pending and scheduled proposals without replacing active agreements", async () => {
		const f = await fixture();
		const propose = () =>
			f.user.mutation(api.payments.configurePaymentsWithScope, {
				invoiceId: f.invoiceId,
				scope: "future" as const,
				futureRule: CHANGED,
				expectedPaymentRuleSourceRevisionId: f.series[0].revisionId,
				payments: [{ paymentAmount: 75, dueDate: NOW, sortOrder: 0 }],
			});
		let proposal = (await propose()).futureProposal!;
		await approve(f.user, f.orgId, proposal.quoteIds[0]);
		const pending = await f.user.query(
			api.recurringPaymentSchedules.getPending,
			{ clientId: f.clientId },
		);
		expect(pending).toMatchObject({
			versionId: proposal.monthlyScheduleVersionId,
			status: "pending_approval",
			approvedCount: 1,
			requiredCount: 2,
			canCancel: true,
		});
		await expect(
			f.user.mutation(api.projectSeriesAgreements.prepare, {
				quoteId: proposal.quoteIds[1],
				billingMode: "monthly",
				paymentRule: CHANGED,
				expectedSeriesRevision: (
					await f.user.query(api.projectSeriesAgreements.getSetup, {
						quoteId: proposal.quoteIds[1],
					})
				).revision,
			}),
		).rejects.toThrow(/shared monthly/i);
		await f.user.mutation(api.recurringPaymentSchedules.cancelPending, {
			clientId: f.clientId,
			expectedVersionId: proposal.monthlyScheduleVersionId!,
		});
		for (const original of f.series)
			expect(
				(await t.run((ctx) => ctx.db.get(original.seriesId)))
					?.activeAgreementRevisionId,
			).toBe(original.revisionId);
		expect(
			await f.user.query(api.recurringPaymentSchedules.getPending, {
				clientId: f.clientId,
			}),
		).toBeNull();
		expect(
			await t.run((ctx) =>
				monthlyRuleForPeriod(ctx, f.orgId, f.clientId, "2026-10"),
			),
		).toEqual(ORIGINAL);

		proposal = (await propose()).futureProposal!;
		for (const quoteId of proposal.quoteIds)
			await approve(f.user, f.orgId, quoteId);
		expect(
			await f.user.query(api.recurringPaymentSchedules.getPending, {
				clientId: f.clientId,
			}),
		).toMatchObject({ status: "scheduled", canCancel: true });
		await f.user.mutation(api.recurringPaymentSchedules.cancelPending, {
			clientId: f.clientId,
			expectedVersionId: proposal.monthlyScheduleVersionId!,
		});
		for (const original of f.series)
			expect(
				(await t.run((ctx) => ctx.db.get(original.seriesId)))
					?.activeAgreementRevisionId,
			).toBe(original.revisionId);
		expect(
			await t.run((ctx) =>
				monthlyRuleForPeriod(ctx, f.orgId, f.clientId, "2026-10"),
			),
		).toEqual(ORIGINAL);

		proposal = (await propose()).futureProposal!;
		for (const quoteId of proposal.quoteIds)
			await approve(f.user, f.orgId, quoteId);
		vi.setSystemTime(Date.UTC(2026, 9, 1, 0));
		expect(
			await f.user.query(api.recurringPaymentSchedules.getPending, {
				clientId: f.clientId,
			}),
		).toMatchObject({
			status: "scheduled",
			canCancel: false,
			cancellationReason: "The payment schedule is already effective",
		});
		await expect(
			f.user.mutation(api.recurringPaymentSchedules.cancelPending, {
				clientId: f.clientId,
				expectedVersionId: proposal.monthlyScheduleVersionId!,
			}),
		).rejects.toThrow(/already effective/i);
	});

	it("keeps a reviewed live invoice while preserving its content and allocation", async () => {
		const f = await fixture();
		const before = await t.run((ctx) => ctx.db.get(f.invoiceId));
		const allocation = await t.run((ctx) =>
			ctx.db
				.query("recurringBillingAllocations")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", f.invoiceId))
				.first(),
		);
		expect(allocation).toBeTruthy();
		await t.run(async (ctx) => {
			await ctx.db.patch(allocation!._id, {
				state: "review",
				reason: "Invoiced visit pricing changed",
			});
			await ctx.db.patch(f.invoiceId, { recurringBillingReview: true });
		});
		await f.user.mutation(api.recurringBillingReview.keepExistingInvoice, {
			invoiceId: f.invoiceId,
		});
		const [after, resolved] = await t.run((ctx) =>
			Promise.all([ctx.db.get(f.invoiceId), ctx.db.get(allocation!._id)]),
		);
		expect(after).toMatchObject({
			total: before!.total,
			status: before!.status,
			recurringBillingReview: false,
		});
		expect(resolved).toMatchObject({
			invoiceId: f.invoiceId,
			state: "allocated",
		});

		await t.run(async (ctx) => {
			await ctx.db.patch(allocation!._id, { state: "review" });
			await ctx.db.patch(f.invoiceId, {
				status: "cancelled",
				recurringBillingReview: true,
			});
		});
		await expect(
			f.user.mutation(api.recurringBillingReview.keepExistingInvoice, {
				invoiceId: f.invoiceId,
			}),
		).rejects.toThrow(/Cancelled invoices/i);
	});
});
