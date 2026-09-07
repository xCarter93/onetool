import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import {
	addMemberToOrg,
	createTestClient,
	createTestIdentity,
	createTestInvoice,
	createTestOrg,
	createTestProject,
} from "./test.helpers";

const NOW = Date.UTC(2026, 8, 6, 16);
const DAY = 86_400_000;
const SPLIT_RULE = {
	type: "percentage" as const,
	installments: [
		{ percentage: 50, dayOffset: 0 },
		{ percentage: 50, dayOffset: 30 },
	],
};

describe("recurring draft billing", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
	});
	afterEach(() => vi.useRealTimers());

	async function fixture(mode: "per_visit" | "monthly" = "per_visit") {
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
		const quoteId = await user.mutation(api.quotes.create, {
			clientId: org.clientId,
			projectId,
			status: "draft",
			title: "Grounds care",
			subtotal: 0,
			total: 0,
		});
		await user.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Mow lawn",
			quantity: 1,
			unit: "visit",
			rate: 75,
			sortOrder: 0,
		});
		const setup = await user.query(api.projectSeriesAgreements.getSetup, {
			quoteId,
		});
		await user.mutation(api.projectSeriesAgreements.prepare, {
			quoteId,
			billingMode: mode,
			paymentRule: SPLIT_RULE,
			expectedSeriesRevision: setup.revision,
		});
		await signAgreement(user, org.orgId, quoteId);
		return { ...org, user, projectId, quoteId, seriesId: setup.seriesId };
	}

	async function signAgreement(
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

	/** Second monthly series whose approved terms carry a different split than the fixture's. */
	async function legacyMonthlySeries(f: Awaited<ReturnType<typeof fixture>>) {
		const projectId = await f.user.mutation(api.projects.create, {
			clientId: f.clientId,
			title: "Window care",
			status: "planned",
			projectType: "recurring",
			startDate: NOW,
			recurrenceRule: {
				frequency: "monthly",
				interval: 1,
				end: { kind: "count", count: 2 },
			},
		});
		const quoteId = await f.user.mutation(api.quotes.create, {
			clientId: f.clientId,
			projectId,
			status: "draft",
			title: "Windows",
			subtotal: 0,
			total: 0,
		});
		await f.user.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Wash windows",
			quantity: 1,
			unit: "visit",
			rate: 125,
			sortOrder: 0,
		});
		const setup = await f.user.query(api.projectSeriesAgreements.getSetup, {
			quoteId,
		});
		await f.user.mutation(api.projectSeriesAgreements.prepare, {
			quoteId,
			billingMode: "monthly",
			paymentRule: SPLIT_RULE,
			expectedSeriesRevision: setup.revision,
		});
		await signAgreement(f.user, f.orgId, quoteId);
		await t.run(async (ctx) => {
			const quote = (await ctx.db.get(quoteId))!;
			const revision = (await ctx.db.get(quote.recurringAgreementRevisionId!))!;
			const paymentRule = {
				type: "fixed_plus_balance" as const,
				installments: [{ amount: 25, dayOffset: 0 }],
				balance: { dayOffset: 30 },
			};
			await ctx.db.patch(revision._id, {
				terms: { ...revision.terms!, paymentRule },
			});
			await ctx.db.patch(quote._id, {
				recurringAgreementTerms: {
					...quote.recurringAgreementTerms!,
					paymentRule,
				},
			});
		});
		return { projectId, quoteId };
	}

	it("drafts once after completion and shares the manual conversion allocation", async () => {
		const f = await fixture();
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		const invoiceId = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		expect(invoiceId).toBeTruthy();
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBe(invoiceId);
		await expect(
			f.user.mutation(api.invoices.createFromQuote, { quoteId: f.quoteId }),
		).rejects.toThrow(/already billed|already been created/);
		const invoice = await t.run((ctx) => ctx.db.get(invoiceId!));
		expect(invoice).toMatchObject({
			status: "draft",
			total: 75,
			recurringPaymentRule: { type: "percentage" },
		});
		expect(invoice?.firstSentAt).toBeUndefined();
		const payments = await t.run((ctx) =>
			ctx.db
				.query("payments")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId!))
				.collect(),
		);
		expect(payments).toHaveLength(0);
	});

	it("recognizes a manual conversion performed before completion and never duplicates it", async () => {
		const f = await fixture();
		const manual = await f.user.mutation(api.invoices.createFromQuote, {
			quoteId: f.quoteId,
		});
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBe(manual);
		expect(
			await t.run((ctx) =>
				ctx.db
					.query("invoices")
					.withIndex("by_org", (q) => q.eq("orgId", f.orgId))
					.collect(),
			),
		).toHaveLength(1);
	});

	it("never invoices an agreement revision quote as another visit", async () => {
		const f = await fixture();
		const { quoteId } = await f.user.mutation(
			api.projectSeriesAgreements.createRevisionDraft,
			{ seriesId: f.seriesId },
		);
		await expect(
			f.user.mutation(api.invoices.createFromQuote, { quoteId }),
		).rejects.toThrow(/future terms.*cannot be invoiced/i);
		expect(
			await t.run((ctx) =>
				ctx.db
					.query("invoices")
					.withIndex("by_org", (q) => q.eq("orgId", f.orgId))
					.collect(),
			),
		).toHaveLength(0);
	});

	it("bills only explicitly selected additions with current approval evidence", async () => {
		const f = await fixture();
		const unselectedId = await f.user.mutation(api.quotes.create, {
			clientId: f.clientId,
			projectId: f.projectId,
			status: "draft",
			title: "Alternative treatment",
			subtotal: 0,
			total: 0,
		});
		await f.user.mutation(api.quoteLineItems.create, {
			quoteId: unselectedId,
			description: "Alternative",
			quantity: 1,
			unit: "visit",
			rate: 40,
			sortOrder: 0,
		});
		const alternativeId = await f.user.mutation(api.quotes.create, {
			clientId: f.clientId,
			projectId: f.projectId,
			status: "draft",
			title: "Optional edging",
			subtotal: 0,
			total: 0,
		});
		await f.user.mutation(api.quoteLineItems.create, {
			quoteId: alternativeId,
			description: "Edge beds",
			quantity: 1,
			unit: "visit",
			rate: 25,
			sortOrder: 0,
		});
		await expect(
			f.user.mutation(api.recurringBilling.setBillableAddition, {
				quoteId: alternativeId,
				selected: true,
			}),
		).rejects.toThrow(/current customer evidence/i);
		const render = await t.query(internal.pdfData._getQuoteRenderData, {
			quoteId: alternativeId,
			orgId: f.orgId,
		});
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(new Blob(["addition pdf"]));
			const documentId = await ctx.db.insert("documents", {
				orgId: f.orgId,
				documentType: "quote",
				documentId: alternativeId,
				storageId,
				generatedAt: NOW,
				version: 1,
			});
			await ctx.db.patch(alternativeId, {
				status: "approved",
				approvedAt: NOW,
				approvalCycle: 0,
			});
			await ctx.db.insert("quoteDecisionEvidence", {
				orgId: f.orgId,
				quoteId: alternativeId,
				clientId: f.clientId,
				documentId,
				documentVersion: 1,
				decisionKey: "addition-approved",
				action: "approved",
				channel: "portal",
				snapshotSource: "server",
				contentBinding: "rendered_document",
				contentSnapshot: render.quoteContentSnapshot,
				decidedAt: NOW,
				recordedAt: NOW,
			});
		});
		await f.user.mutation(api.recurringBilling.setBillableAddition, {
			quoteId: alternativeId,
			selected: true,
		});
		expect(
			await f.user.query(api.recurringBilling.listBillableAdditions, {
				projectId: f.projectId,
			}),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					quoteId: alternativeId,
					selected: true,
					eligible: true,
				}),
				expect.objectContaining({ quoteId: unselectedId, selected: false }),
			]),
		);
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		const invoiceId = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		const invoice = await t.run((ctx) => ctx.db.get(invoiceId!));
		const groups = await t.run((ctx) =>
			ctx.db
				.query("invoiceGroups")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId!))
				.collect(),
		);
		expect(invoice?.total).toBe(100);
		expect(groups).toHaveLength(2);
	});

	it("rebills a selected addition together with its visit after the first invoice is cancelled", async () => {
		const f = await fixture();
		const additionId = await f.user.mutation(api.quotes.create, {
			clientId: f.clientId,
			projectId: f.projectId,
			status: "draft",
			title: "Optional edging",
			subtotal: 0,
			total: 0,
		});
		await f.user.mutation(api.quoteLineItems.create, {
			quoteId: additionId,
			description: "Edge beds",
			quantity: 1,
			unit: "visit",
			rate: 25,
			sortOrder: 0,
		});
		const render = await t.query(internal.pdfData._getQuoteRenderData, {
			quoteId: additionId,
			orgId: f.orgId,
		});
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(new Blob(["addition pdf"]));
			const documentId = await ctx.db.insert("documents", {
				orgId: f.orgId,
				documentType: "quote",
				documentId: additionId,
				storageId,
				generatedAt: NOW,
				version: 1,
			});
			await ctx.db.patch(additionId, {
				status: "approved",
				approvedAt: NOW,
				approvalCycle: 0,
			});
			await ctx.db.insert("quoteDecisionEvidence", {
				orgId: f.orgId,
				quoteId: additionId,
				clientId: f.clientId,
				documentId,
				documentVersion: 1,
				decisionKey: "addition-approved",
				action: "approved",
				channel: "portal",
				snapshotSource: "server",
				contentBinding: "rendered_document",
				contentSnapshot: render.quoteContentSnapshot,
				decidedAt: NOW,
				recordedAt: NOW,
			});
		});
		await f.user.mutation(api.recurringBilling.setBillableAddition, {
			quoteId: additionId,
			selected: true,
		});
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		const original = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		await f.user.mutation(api.invoices.update, {
			id: original!,
			status: "cancelled",
		});
		const reviews = await t.run((ctx) =>
			ctx.db
				.query("recurringBillingAllocations")
				.withIndex("by_project", (q) => q.eq("projectId", f.projectId))
				.collect(),
		);
		expect(reviews.map((allocation) => allocation.state)).toEqual([
			"review",
			"review",
		]);
		for (const allocation of reviews)
			await f.user.mutation(api.recurringBilling.resolve, {
				allocationId: allocation._id,
				resolution: "rebill",
			});
		const replacement = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		expect(replacement).not.toBe(original);
		const { invoice, groups } = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(replacement!),
			groups: await ctx.db
				.query("invoiceGroups")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", replacement!))
				.collect(),
		}));
		expect(invoice?.total).toBe(100);
		expect(groups.map((group) => group.sourceQuoteId).sort()).toEqual(
			[f.quoteId, additionId].sort(),
		);
	});

	it("does not bill a cancelled recurring visit", async () => {
		const f = await fixture();
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "cancelled",
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBeNull();
		expect(
			(
				await f.user.query(api.recurringBilling.getVisit, {
					projectId: f.projectId,
				})
			).state,
		).toBe("ineligible");
	});

	it("requires organization-wide access at the public billing boundary", async () => {
		const f = await fixture();
		const member = await t.run((ctx) =>
			addMemberToOrg(ctx, f.orgId, {
				clerkUserId: "scoped_billing_member",
				role: "member",
			}),
		);
		await t.run(async (ctx) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", f.orgId).eq("userId", member.userId),
				)
				.unique();
			await ctx.db.patch(membership!._id, {
				permissions: {
					projects: { level: "view", allRecords: false },
					quotes: { level: "view", allRecords: true },
					invoices: { level: "modify", allRecords: true },
				},
			});
		});
		const scoped = t.withIdentity(
			createTestIdentity(member.clerkUserId, f.clerkOrgId),
		);
		await expect(
			scoped.query(api.recurringBilling.getVisit, { projectId: f.projectId }),
		).rejects.toThrow(/Organization-wide/);
		await expect(
			scoped.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).rejects.toThrow(/Organization-wide/);
	});

	it("keeps cancellations on review until explicitly rebilled", async () => {
		const f = await fixture();
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		const original = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		await f.user.mutation(api.invoices.update, {
			id: original!,
			status: "cancelled",
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBeNull();
		const status = await f.user.query(api.recurringBilling.getVisit, {
			projectId: f.projectId,
		});
		expect(status.state).toBe("review");
		await f.user.mutation(api.recurringBilling.resolve, {
			allocationId: status.allocationId!,
			resolution: "rebill",
		});
		const replacement = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		expect(replacement).toBeTruthy();
		expect(replacement).not.toBe(original);
	});

	it("holds an overridden visit and resumes after explicit restoration", async () => {
		const f = await fixture();
		const projects = await t.run((ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_start", (q) =>
					q.eq("recurringSeriesId", f.seriesId),
				)
				.collect(),
		);
		const visit = projects.find((p) => p._id !== f.projectId)!;
		const quote = await t.run((ctx) =>
			ctx.db
				.query("quotes")
				.withIndex("by_project", (q) => q.eq("projectId", visit._id))
				.first(),
		);
		await f.user.mutation(api.quotes.update, {
			id: quote!._id,
			status: "draft",
		});
		await f.user.mutation(api.projects.update, {
			id: visit._id,
			status: "completed",
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: visit._id,
			}),
		).toBeNull();
		expect(
			(
				await f.user.query(api.recurringBilling.getVisit, {
					projectId: visit._id,
				})
			).state,
		).toBe("held");
		await f.user.mutation(api.projectSeriesAgreements.restoreVisit, {
			quoteId: quote!._id,
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: visit._id,
			}),
		).toBeTruthy();
	});

	it("consolidates completed visits after the local month closes", async () => {
		const f = await fixture("monthly");
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBeNull();
		const prematureSeptemberRun = await t.run((ctx) =>
			ctx.db
				.query("recurringMonthlyBillingRuns")
				.withIndex("by_org_client_period", (q) =>
					q
						.eq("orgId", f.orgId)
						.eq("clientId", f.clientId)
						.eq("period", "2026-09"),
				)
				.unique(),
		);
		expect(prematureSeptemberRun).toBeNull();
		vi.setSystemTime(Date.UTC(2026, 9, 1, 16));
		const invoiceId = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		expect(invoiceId).toBeTruthy();
		const invoice = await t.run((ctx) => ctx.db.get(invoiceId!));
		expect(invoice).toMatchObject({
			status: "draft",
			total: 75,
			recurringBillingPeriod: "2026-09",
		});
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBe(invoiceId);
	});

	it("never reopens a finalized legacy monthly run", async () => {
		const f = await fixture("monthly");
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		const invoiceId = await t.run(async (ctx) => {
			const id = await createTestInvoice(ctx, f.orgId, f.clientId, {
				status: "draft",
				total: 75,
			});
			await ctx.db.insert("recurringMonthlyBillingRuns", {
				orgId: f.orgId,
				clientId: f.clientId,
				period: "2026-09",
				invoiceId: id,
				createdAt: NOW,
			});
			return id;
		});
		vi.setSystemTime(Date.UTC(2026, 9, 1, 16));
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBe(invoiceId);
		const run = await t.run((ctx) =>
			ctx.db
				.query("recurringMonthlyBillingRuns")
				.withIndex("by_org_client_period", (q) =>
					q
						.eq("orgId", f.orgId)
						.eq("clientId", f.clientId)
						.eq("period", "2026-09"),
				)
				.unique(),
		);
		expect(run).toMatchObject({ invoiceId });
		expect(run?.candidateQuoteIds).toBeUndefined();
	});

	it("pages past more than 200 historical completed projects without losing a fresh monthly visit", async () => {
		const f = await fixture("monthly");
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		await t.run(async (ctx) => {
			for (let index = 0; index < 205; index++) {
				const id = await createTestProject(ctx, f.orgId, f.clientId, {
					status: "completed",
					startDate: Date.UTC(2020, 0, 1) + index,
				});
				await ctx.db.patch(id, { completedAt: Date.UTC(2020, 0, 2) + index });
			}
		});
		vi.setSystemTime(Date.UTC(2026, 9, 1, 16));
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBeNull();
		for (let page = 0; page < 10; page++) {
			const run = await t.run((ctx) =>
				ctx.db
					.query("recurringMonthlyBillingRuns")
					.withIndex("by_org_client_period", (q) =>
						q
							.eq("orgId", f.orgId)
							.eq("clientId", f.clientId)
							.eq("period", "2026-09"),
					)
					.unique(),
			);
			if (run?.scanComplete) break;
			await t.mutation(internal.recurringBilling.continueMonthlyRun, {
				runId: run!._id,
			});
		}
		const run = await t.run((ctx) =>
			ctx.db
				.query("recurringMonthlyBillingRuns")
				.withIndex("by_org_client_period", (q) =>
					q
						.eq("orgId", f.orgId)
						.eq("clientId", f.clientId)
						.eq("period", "2026-09"),
				)
				.unique(),
		);
		expect(run).toMatchObject({ scanComplete: true });
		expect(run?.invoiceId).toBeTruthy();
		expect((await t.run((ctx) => ctx.db.get(run!.invoiceId!)))?.total).toBe(75);
	});

	it("holds every visit for review when mixed rules have no shared client schedule to follow", async () => {
		const f = await fixture("monthly");
		const second = await legacyMonthlySeries(f);
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		await f.user.mutation(api.projects.update, {
			id: second.projectId,
			status: "completed",
		});
		vi.setSystemTime(Date.UTC(2026, 9, 1, 16));
		expect(
			await f.user.mutation(api.recurringBilling.draftVisit, {
				projectId: f.projectId,
			}),
		).toBeNull();
		const { invoices, allocations, runs } = await t.run(async (ctx) => ({
			invoices: await ctx.db
				.query("invoices")
				.withIndex("by_org", (q) => q.eq("orgId", f.orgId))
				.collect(),
			allocations: await ctx.db
				.query("recurringBillingAllocations")
				.withIndex("by_org_state", (q) =>
					q.eq("orgId", f.orgId).eq("state", "review"),
				)
				.collect(),
			runs: await ctx.db
				.query("recurringMonthlyBillingRuns")
				.withIndex("by_org_client_period", (q) =>
					q
						.eq("orgId", f.orgId)
						.eq("clientId", f.clientId)
						.eq("period", "2026-09"),
				)
				.collect(),
		}));
		expect(invoices).toHaveLength(0);
		expect(allocations).toHaveLength(2);
		expect(
			allocations.every((allocation) =>
				allocation.reason?.includes("incompatible"),
			),
		).toBe(true);
		expect(runs).toHaveLength(1);
		expect(runs[0]!.invoiceId).toBeUndefined();
	});

	it("bills visits matching the shared monthly schedule and holds only conflicting terms for review", async () => {
		const f = await fixture("monthly");
		const second = await legacyMonthlySeries(f);
		await t.run((ctx) =>
			ctx.db.insert("clientMonthlyPaymentScheduleVersions", {
				orgId: f.orgId,
				clientId: f.clientId,
				version: 1,
				rule: SPLIT_RULE,
				seriesIds: [f.seriesId],
				approvedSeriesIds: [f.seriesId],
				agreementRevisionIds: [],
				status: "active",
				createdAt: NOW,
				createdByUserId: f.userId,
			}),
		);
		await f.user.mutation(api.projects.update, {
			id: f.projectId,
			status: "completed",
		});
		await f.user.mutation(api.projects.update, {
			id: second.projectId,
			status: "completed",
		});
		vi.setSystemTime(Date.UTC(2026, 9, 1, 16));
		const invoiceId = await f.user.mutation(api.recurringBilling.draftVisit, {
			projectId: f.projectId,
		});
		expect(invoiceId).toBeTruthy();
		const { invoice, groups, allocations } = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(invoiceId!),
			groups: await ctx.db
				.query("invoiceGroups")
				.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId!))
				.collect(),
			allocations: await ctx.db
				.query("recurringBillingAllocations")
				.withIndex("by_org_state", (q) =>
					q.eq("orgId", f.orgId).eq("state", "review"),
				)
				.collect(),
		}));
		expect(invoice).toMatchObject({
			total: 75,
			recurringBillingPeriod: "2026-09",
			recurringPaymentRule: SPLIT_RULE,
		});
		expect(groups.map((group) => group.sourceQuoteId)).toEqual([f.quoteId]);
		expect(allocations.map((allocation) => allocation.quoteId)).toEqual([
			second.quoteId,
		]);
		expect(
			(
				await f.user.query(api.recurringBilling.getVisit, {
					projectId: second.projectId,
				})
			).state,
		).toBe("review");
	});

	it("materializes the series schedule on first send when a web conversion supplies default dates", async () => {
		const f = await fixture();
		const invoiceId = await f.user.mutation(api.invoices.createFromQuote, {
			quoteId: f.quoteId,
			issuedDate: NOW,
			dueDate: NOW + 30 * DAY,
		});
		expect(
			(await t.run((ctx) => ctx.db.get(invoiceId)))?.paymentScheduleIsCustom,
		).toBeUndefined();
		await f.user.mutation(api.invoices.update, {
			id: invoiceId,
			status: "sent",
		});
		const { invoice, payments } = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(invoiceId),
			payments: await ctx.db
				.query("payments")
				.withIndex("by_invoice_sort", (q) => q.eq("invoiceId", invoiceId))
				.collect(),
		}));
		expect(payments.map((payment) => payment.paymentAmount)).toEqual([
			37.5, 37.5,
		]);
		expect(invoice?.paymentScheduleAnchorAt).toBe(NOW);
		expect(invoice?.dueDate).toBe(payments[1]!.dueDate);
	});
});
