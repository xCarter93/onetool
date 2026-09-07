import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { triggers } from "./lib/triggers";
import {
	MAX_GENERATED_QUOTE_LINE_WRITES,
	MAX_GENERATED_QUOTES,
} from "./lib/projectSeriesQuotes";
import { MAX_GENERATED_TASKS } from "./lib/projectSeriesTasks";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestClientContact,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 6);
const NOW = START + 16 * 3_600_000;

describe("recurring project quote copy-forward edges", () => {
	let t: ReturnType<typeof setupConvexTest>;
	let sequence = 0;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
		sequence = 0;
	});

	afterEach(() => vi.useRealTimers());

	async function fixture(
		count = 5,
		interval = 1,
		frequency: "daily" | "weekly" = "weekly",
	) {
		const n = ++sequence;
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx, {
				clerkUserId: `quote_edge_user_${n}`,
				clerkOrgId: `quote_edge_org_${n}`,
			});
			await ctx.db.patch(setup.orgId, { timezone: "America/New_York" });
			return {
				...setup,
				clientId: await createTestClient(ctx, setup.orgId),
			};
		});
		const user = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId),
		);
		const projectId = await user.mutation(api.projects.create, {
			clientId: org.clientId,
			title: "Recurring clean",
			projectType: "recurring",
			status: "planned",
			startDate: START,
			recurrenceRule: {
				frequency,
				interval,
				end: { kind: "count", count },
			},
		});
		const project = await t.run((ctx) => ctx.db.get(projectId));
		const seriesId = project!.recurringSeriesId!;
		const quoteId = await user.mutation(api.quotes.create, {
			clientId: org.clientId,
			projectId,
			title: "Weekly service",
			status: "draft",
			subtotal: 0,
			total: 0,
			validUntil: START + 30 * DAY,
			terms: "Original recurring terms",
		});
		const lineId = await user.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Standard visit",
			quantity: 1,
			unit: "visit",
			rate: 125,
			sortOrder: 0,
		});
		return { ...org, user, projectId, seriesId, quoteId, lineId };
	}

	type Fixture = Awaited<ReturnType<typeof fixture>>;

	async function visits(f: Fixture) {
		return t.run((ctx) =>
			ctx.db
				.query("projects")
				.withIndex("by_series_start", (q) =>
					q.eq("recurringSeriesId", f.seriesId),
				)
				.collect(),
		);
	}

	async function projectQuotes(projectId: Id<"projects">) {
		return t.run((ctx) =>
			ctx.db
				.query("quotes")
				.withIndex("by_project", (q) => q.eq("projectId", projectId))
				.collect(),
		);
	}

	async function quoteLines(quoteId: Id<"quotes">) {
		return t.run((ctx) =>
			ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
				.collect(),
		);
	}

	async function copy(f: Fixture, quoteId = f.quoteId) {
		const preview = await f.user.query(api.projectSeriesQuotes.previewCopy, {
			quoteId,
		});
		return f.user.mutation(api.projectSeriesQuotes.copy, {
			quoteId,
			expectedRevision: preview.revision,
		});
	}

	it("overwrites ordinary draft edits but preserves an explicit visit override", async () => {
		const f = await fixture(4);
		await copy(f);
		const rows = await visits(f);
		const ordinary = (await projectQuotes(rows[1]._id))[0];
		const overridden = (await projectQuotes(rows[2]._id))[0];
		const ordinaryLine = (await quoteLines(ordinary._id))[0];

		await f.user.mutation(api.quotes.update, {
			id: ordinary._id,
			title: "Disposable local edit",
		});
		await f.user.mutation(api.quoteLineItems.update, {
			id: ordinaryLine._id,
			description: "Disposable line edit",
		});
		await t.run(async (ctx) => {
			const wrapped = triggers.wrapDB(ctx);
			await wrapped.db.patch(overridden._id, {
				recurringQuoteOverride: true,
			});
		});
		await f.user.mutation(api.quotes.update, {
			id: f.quoteId,
			title: "Published replacement",
		});
		await f.user.mutation(api.quoteLineItems.update, {
			id: f.lineId,
			description: "Published line",
		});

		const result = await copy(f);
		expect(result.updateCount).toBe(2);
		expect(result.preservedCount).toBe(1);
		const refreshedOrdinary = await t.run((ctx) => ctx.db.get(ordinary._id));
		expect(refreshedOrdinary).toMatchObject({ title: "Published replacement" });
		expect(refreshedOrdinary?.recurringQuoteOverride).toBeUndefined();
		expect((await quoteLines(ordinary._id))[0].description).toBe(
			"Published line",
		);
		expect(await t.run((ctx) => ctx.db.get(overridden._id))).toMatchObject({
			title: "Weekly service",
			recurringQuoteOverride: true,
		});
	});

	it("uses a later generated quote as the same template with a forward-only new version", async () => {
		const f = await fixture(5);
		await copy(f);
		const rows = await visits(f);
		const earlier = (await projectQuotes(rows[1]._id))[0];
		const laterSource = (await projectQuotes(rows[2]._id))[0];
		const afterLater = (await projectQuotes(rows[3]._id))[0];
		const originalTemplateId = laterSource.projectSeriesQuoteTemplateId!;
		const originalVersionId = laterSource.projectSeriesQuoteVersionId!;
		const originalVersion = await t.run((ctx) => ctx.db.get(originalVersionId));

		await f.user.mutation(api.quotes.update, {
			id: laterSource._id,
			title: "Scope from the later visit",
		});
		await copy(f, laterSource._id);

		const setup = await f.user.query(api.projectSeriesQuotes.getSetup, {
			projectId: f.projectId,
		});
		expect(setup?.templates).toHaveLength(1);
		expect(setup?.templates[0]).toMatchObject({
			_id: originalTemplateId,
			sourceQuoteId: f.quoteId,
			version: 2,
		});
		expect(await t.run((ctx) => ctx.db.get(earlier._id))).toMatchObject({
			title: "Weekly service",
			projectSeriesQuoteVersionId: originalVersionId,
		});
		expect(await t.run((ctx) => ctx.db.get(laterSource._id))).toMatchObject({
			title: "Scope from the later visit",
			projectSeriesQuoteTemplateId: originalTemplateId,
		});
		expect(await t.run((ctx) => ctx.db.get(afterLater._id))).toMatchObject({
			title: "Scope from the later visit",
			projectSeriesQuoteTemplateId: originalTemplateId,
		});
		const versions = await t.run((ctx) =>
			ctx.db
				.query("projectSeriesQuoteVersions")
				.withIndex("by_source_quote", (q) => q.eq("sourceQuoteId", f.quoteId))
				.collect(),
		);
		expect(versions).toHaveLength(2);
		expect(
			versions.find((version) => version._id === originalVersionId),
		).toEqual(originalVersion);
		expect(versions.find((version) => version.version === 2)).toMatchObject({
			sourceQuoteId: f.quoteId,
			capturedFromQuoteId: laterSource._id,
			title: "Scope from the later visit",
		});
	});

	it("tombstones deleted copies and protects moved copies without refilling their slots", async () => {
		const f = await fixture(5);
		await copy(f);
		const rows = await visits(f);
		const deletedProject = rows[1];
		const movedProject = rows[2];
		const destination = rows[3];
		const deleted = (await projectQuotes(deletedProject._id))[0];
		const moved = (await projectQuotes(movedProject._id))[0];

		await f.user.mutation(api.quotes.remove, { id: deleted._id });
		await f.user.mutation(api.quotes.update, {
			id: moved._id,
			projectId: destination._id,
		});
		await copy(f);

		expect(await projectQuotes(deletedProject._id)).toEqual([]);
		expect(await projectQuotes(movedProject._id)).toEqual([]);
		expect(await t.run((ctx) => ctx.db.get(moved._id))).toMatchObject({
			projectId: destination._id,
		});
		const ledgers = await t.run((ctx) =>
			ctx.db
				.query("projectSeriesQuoteCopies")
				.withIndex("by_template", (q) =>
					q.eq("templateId", moved.projectSeriesQuoteTemplateId!),
				)
				.collect(),
		);
		const deletedLedger = ledgers.find(
			(row) => row.projectId === deletedProject._id,
		);
		expect(deletedLedger).toMatchObject({
			state: "removed-by-user",
			protected: true,
		});
		expect(deletedLedger?.quoteId).toBeUndefined();
		expect(
			ledgers.find((row) => row.projectId === movedProject._id),
		).toMatchObject({
			state: "materialized",
			protected: true,
			quoteId: moved._id,
		});
	});

	it("copies no send, approval, signature, document, or expiration metadata", async () => {
		const f = await fixture(3);
		const signatureStorageId = await t.run((ctx) =>
			ctx.storage.store(new Blob(["signature"], { type: "image/png" })),
		);
		await t.run(async (ctx) => {
			const wrapped = triggers.wrapDB(ctx);
			await wrapped.db.patch(f.quoteId, {
				sentAt: NOW - DAY,
				firstSentAt: NOW - DAY,
				approvedAt: NOW,
				requiresCountersignature: true,
				countersignerId: f.userId,
				signingOrder: "client_first",
			});
			const documentId = await wrapped.db.insert("documents", {
				orgId: f.orgId,
				documentType: "quote",
				documentId: f.quoteId,
				storageId: signatureStorageId,
				generatedAt: NOW,
				version: 1,
				boldsignDocumentId: "boldsign-source",
			});
			await wrapped.db.patch(f.quoteId, { latestDocumentId: documentId });
		});

		await copy(f);
		const copied = (await projectQuotes((await visits(f))[1]._id))[0];
		expect(copied).toMatchObject({ status: "draft" });
		for (const field of [
			"validUntil",
			"sentAt",
			"firstSentAt",
			"approvedAt",
			"declinedAt",
			"latestDocumentId",
			"requiresCountersignature",
			"countersignerId",
			"signingOrder",
		] as const) {
			expect(copied[field]).toBeUndefined();
		}
		expect(
			await t.run((ctx) =>
				ctx.db
					.query("quoteApprovals")
					.withIndex("by_quote", (q) => q.eq("quoteId", copied._id))
					.collect(),
			),
		).toEqual([]);
		expect(
			await t.run((ctx) =>
				ctx.db
					.query("documents")
					.withIndex("by_document", (q) =>
						q.eq("documentType", "quote").eq("documentId", copied._id),
					)
					.collect(),
			),
		).toEqual([]);
	});

	it("rejects cross-tenant sources and a quote whose client mismatches its project", async () => {
		const f = await fixture(3);
		const foreign = await fixture(3);
		await expect(
			foreign.user.query(api.projectSeriesQuotes.previewCopy, {
				quoteId: f.quoteId,
			}),
		).rejects.toThrow();

		const wrongClient = await t.run((ctx) =>
			createTestClient(ctx, f.orgId, { companyName: "Wrong client" }),
		);
		await t.run(async (ctx) => {
			const wrapped = triggers.wrapDB(ctx);
			await wrapped.db.patch(f.quoteId, { clientId: wrongClient });
		});
		await expect(
			f.user.query(api.projectSeriesQuotes.previewCopy, {
				quoteId: f.quoteId,
			}),
		).rejects.toThrow(/client.*project/i);
	});

	it("rejects a source occurrence whose client or property no longer matches its series", async () => {
		const f = await fixture(3);
		const propertyId = await t.run((ctx) =>
			ctx.db.insert("clientProperties", {
				orgId: f.orgId,
				clientId: f.clientId,
				propertyName: "Visit-only site",
				streetAddress: "10 Side St",
				city: "Buffalo",
				state: "NY",
				zipCode: "14201",
				isPrimary: false,
			}),
		);
		await t.run(async (ctx) => {
			const wrapped = triggers.wrapDB(ctx);
			await wrapped.db.patch(f.projectId, { propertyId });
		});

		await expect(
			f.user.query(api.projectSeriesQuotes.previewCopy, {
				quoteId: f.quoteId,
			}),
		).rejects.toThrow(/series|property/i);
	});

	it("makes invoice linkage permanently protect a copy even after the invoice is removed", async () => {
		const f = await fixture(4);
		await copy(f);
		const target = (await visits(f))[1];
		const copied = (await projectQuotes(target._id))[0];
		const preview = await f.user.query(api.projectSeriesQuotes.previewCopy, {
			quoteId: f.quoteId,
		});
		const invoiceId = await f.user.mutation(api.invoices.create, {
			clientId: f.clientId,
			quoteId: copied._id,
			invoiceNumber: "QUOTE-EDGE-INVOICE-1",
			status: "draft",
			subtotal: 125,
			total: 125,
			issuedDate: NOW,
			dueDate: NOW + DAY,
		});
		await expect(
			f.user.mutation(api.projectSeriesQuotes.copy, {
				quoteId: f.quoteId,
				expectedRevision: preview.revision,
			}),
		).rejects.toThrow(/stale|preview/i);

		await f.user.mutation(api.invoices.remove, { id: invoiceId });
		await f.user.mutation(api.quotes.update, {
			id: f.quoteId,
			title: "New source after invoice removal",
		});
		const result = await copy(f);
		expect(result.preservedCount).toBe(1);
		expect(await t.run((ctx) => ctx.db.get(copied._id))).toMatchObject({
			title: "Weekly service",
		});
		const ledger = await t.run((ctx) =>
			ctx.db
				.query("projectSeriesQuoteCopies")
				.withIndex("by_quote", (q) => q.eq("quoteId", copied._id))
				.unique(),
		);
		expect(ledger).toMatchObject({ protected: true, state: "materialized" });
	});

	it("remains bounded after more than 200 historical visits", async () => {
		const f = await fixture(350);
		await copy(f);
		for (let period = 1; period <= 18; period++) {
			vi.setSystemTime(NOW + period * 84 * DAY);
			await t.mutation(internal.projectSeries.generate, {
				orgId: f.orgId,
				seriesId: f.seriesId,
			});
		}
		expect((await visits(f)).length).toBeGreaterThan(200);
		await f.user.query(api.projectSeriesQuotes.previewCopy, {
			quoteId: f.quoteId,
		});
	});

	it("rejects a manual copy whose target window would exceed the line-write bound", async () => {
		const f = await fixture(100, 1, "daily");
		for (let i = 1; i < 100; i++) {
			await f.user.mutation(api.quoteLineItems.create, {
				quoteId: f.quoteId,
				description: `Line ${i}`,
				quantity: 1,
				unit: "item",
				rate: i,
				sortOrder: i,
			});
		}
		await expect(
			f.user.query(api.projectSeriesQuotes.previewCopy, {
				quoteId: f.quoteId,
			}),
		).rejects.toThrow(/2000 quote line items/i);
	});

	it("combines task and zero-line quote generation caps with idempotent continuation", async () => {
		expect(MAX_GENERATED_QUOTES).toBe(100);
		expect(MAX_GENERATED_QUOTE_LINE_WRITES).toBe(500);
		expect(MAX_GENERATED_TASKS).toBe(200);
		const f = await fixture(200, 1, "daily");
		const taskId = await f.user.mutation(api.tasks.create, {
			clientId: f.clientId,
			projectId: f.projectId,
			type: "external",
			title: "Generated checklist",
			date: START,
			status: "pending",
		});
		const taskPreview = await f.user.query(api.projectSeriesTasks.previewCopy, {
			taskId,
		});
		await f.user.mutation(api.projectSeriesTasks.copy, {
			taskId,
			expectedRevision: taskPreview.revision,
		});

		for (let index = 0; index < 20; index++) {
			const quoteId = await f.user.mutation(api.quotes.create, {
				clientId: f.clientId,
				projectId: f.projectId,
				title: `Zero-line setup ${index}`,
				status: "draft",
				subtotal: 0,
				total: 0,
			});
			await copy(f, quoteId);
		}

		vi.setSystemTime(NOW + 120 * DAY);
		const beforeGeneration = new Set(
			(await visits(f)).map((project) => project._id),
		);
		const first = await t.mutation(internal.projectSeries.generate, {
			orgId: f.orgId,
			seriesId: f.seriesId,
		});
		expect(first).toMatchObject({ created: 5 });
		const generated = (await visits(f)).filter(
			(project) => !beforeGeneration.has(project._id),
		);
		expect(generated).toHaveLength(5);
		for (const project of generated) {
			expect(await projectQuotes(project._id)).toHaveLength(20);
			const tasks = await t.run((ctx) =>
				ctx.db
					.query("tasks")
					.withIndex("by_project", (q) => q.eq("projectId", project._id))
					.collect(),
			);
			expect(
				tasks.filter((task) => task.title === "Generated checklist"),
			).toHaveLength(1);
		}

		let remaining = first.remaining;
		while (remaining > 0) {
			const next = await t.mutation(internal.projectSeries.generate, {
				orgId: f.orgId,
				seriesId: f.seriesId,
			});
			remaining = next.remaining;
		}
		const settled = await t.mutation(internal.projectSeries.generate, {
			orgId: f.orgId,
			seriesId: f.seriesId,
		});
		expect(settled).toEqual({ created: 0, remaining: 0 });
		const occurrenceDates = (await visits(f)).map(
			(project) => project.recurringNominalDate,
		);
		expect(new Set(occurrenceDates).size).toBe(occurrenceDates.length);
	}, 30_000);

	it("reprices copies inherited under an earlier agreement revision once the revision is approved", async () => {
		const f = await fixture(3);
		await t.run((ctx) =>
			createTestClientContact(ctx, f.orgId, f.clientId, {
				isPrimary: true,
				email: "client@example.com",
			}),
		);
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
			rate: 75,
			sortOrder: 0,
		});
		const paymentRule = {
			type: "percentage" as const,
			installments: [{ percentage: 100, dayOffset: 30 }],
		};
		const approve = async (sourceQuoteId: Id<"quotes">, providerId: string) => {
			const setup = await f.user.query(api.projectSeriesAgreements.getSetup, {
				quoteId: sourceQuoteId,
			});
			await f.user.mutation(api.projectSeriesAgreements.prepare, {
				quoteId: sourceQuoteId,
				billingMode: "per_visit",
				paymentRule,
				expectedSeriesRevision: setup.revision,
			});
			const data = await t.query(internal.pdfData._getQuoteRenderData, {
				quoteId: sourceQuoteId,
				orgId: f.orgId,
			});
			const storageId = await t.run((ctx) =>
				ctx.storage.store(new Blob([providerId])),
			);
			const { documentId } = await t.mutation(
				internal.pdfData._insertGeneratedDocument,
				{
					documentType: "quote",
					documentId: sourceQuoteId,
					orgId: f.orgId,
					storageId,
					quoteContentSnapshot: data.quoteContentSnapshot,
				},
			);
			await f.user.mutation(internal.boldsign.reserveRecurringSignatureSend, {
				quoteId: sourceQuoteId,
				documentId,
			});
			await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, {
				quoteId: sourceQuoteId,
				documentId,
				boldsignDocumentId: providerId,
				recurringAgreementLocked: true,
				sendUrl: "",
				sendUrlExpiresAt: NOW,
				sentTo: [],
			});
			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId: providerId,
				eventType: "Completed",
			});
		};
		const copies = async () =>
			t.run(async (ctx) =>
				(
					await ctx.db
						.query("projectSeriesQuoteCopies")
						.withIndex("by_series", (q) => q.eq("seriesId", f.seriesId))
						.collect()
				).map((ledger) => ledger.quoteId!),
			);

		await approve(quoteId, "agreement-v1");
		const firstRevisionId = (await t.run((ctx) => ctx.db.get(f.seriesId)))!
			.activeAgreementRevisionId!;
		const original = await copies();
		expect(original).toHaveLength(2);

		const { quoteId: revisionQuoteId } = await f.user.mutation(
			api.projectSeriesAgreements.createRevisionDraft,
			{ seriesId: f.seriesId },
		);
		const revisionLine = await t.run((ctx) =>
			ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", revisionQuoteId))
				.first(),
		);
		await f.user.mutation(api.quoteLineItems.update, {
			id: revisionLine!._id,
			rate: 95,
		});
		await approve(revisionQuoteId, "agreement-v2");

		const series = await t.run((ctx) => ctx.db.get(f.seriesId));
		expect(series!.activeAgreementRevisionId).not.toBe(firstRevisionId);
		expect(await copies()).toEqual(original);
		for (const copyId of original) {
			const [copy, lines] = await t.run(
				async (ctx) =>
					[
						await ctx.db.get(copyId),
						await ctx.db
							.query("quoteLineItems")
							.withIndex("by_quote", (q) => q.eq("quoteId", copyId))
							.collect(),
					] as const,
			);
			expect(copy).toMatchObject({
				status: "approved",
				total: 95,
				recurringAgreementRevisionId: series!.activeAgreementRevisionId,
			});
			expect(copy!.latestDocumentId).toBeUndefined();
			expect(lines.map((line) => line.rate)).toEqual([95]);
		}
		expect(await t.run((ctx) => ctx.db.get(quoteId))).toMatchObject({
			status: "approved",
			total: 75,
		});
	});
});
