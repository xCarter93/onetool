import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "./test.helpers";
import { externalIoPool } from "./externalIoPool";
import { buildQuoteContentSnapshot } from "./lib/quoteContentSnapshot";

type TestDb = ReturnType<typeof setupConvexTest>;
type SeedCtx = Parameters<Parameters<TestDb["run"]>[0]>[0];

describe("BoldSign decision evidence lifecycle", () => {
	let t: TestDb;
	let enqueue: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		t = setupConvexTest();
		enqueue = vi
			.spyOn(externalIoPool, "enqueueAction")
			.mockResolvedValue("decision_evidence_work" as never);
	});

	afterEach(() => enqueue.mockRestore());

	async function seed(options?: {
		quoteStatus?: "draft" | "sent";
		boundSnapshot?: boolean;
	}) {
		return await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId, {
				companyName: "Evidence Client",
			});
			const quoteId = await ctx.db.insert("quotes", {
				orgId: org.orgId,
				clientId,
				title: "Annual agreement",
				quoteNumber: "Q-EVIDENCE",
				status: options?.quoteStatus ?? "sent",
				subtotal: 100,
				taxAmount: 0,
				total: 100,
			});
			await ctx.db.insert("quoteLineItems", {
				orgId: org.orgId,
				quoteId,
				description: "Service",
				quantity: 1,
				unit: "visit",
				rate: 100,
				amount: 100,
				sortOrder: 0,
			});
			const quote = (await ctx.db.get(quoteId))!;
			const lines = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
				.collect();
			const storageId = await ctx.storage.store(new Blob(["pdf"]));
			const documentId = await ctx.db.insert("documents", {
				orgId: org.orgId,
				documentType: "quote",
				documentId: quoteId,
				storageId,
				generatedAt: 1_000,
				version: 1,
				quoteContentSnapshot: options?.boundSnapshot
					? buildQuoteContentSnapshot(quote, lines)
					: undefined,
				boldsignDocumentId: "bs_evidence",
				boldsign: {
					documentId: "bs_evidence",
					status: "Sent",
					sentTo: [],
					sentAt: 1_100,
				},
			});
			await ctx.db.patch(quoteId, { latestDocumentId: documentId });
			return { ...org, quoteId, documentId };
		});
	}

	async function webhook(
		boldsignDocumentId: string,
		eventType: string,
		eventTimestamp: number
	) {
		await t.mutation(internal.boldsign.handleWebhook, {
			boldsignDocumentId,
			eventType,
			eventTimestamp,
		});
	}

	async function evidence(quoteId: Id<"quotes">) {
		return await t.run((ctx) =>
			ctx.db
				.query("quoteDecisionEvidence")
				.withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
				.collect()
		);
	}

	async function prepareReferencedDocument(fixture: Awaited<ReturnType<typeof seed>>) {
		const { snapshot, storageId } = await t.run(async (ctx) => {
			const quote = await ctx.db.get(fixture.quoteId);
			if (!quote) throw new Error("Missing quote");
			const lines = await ctx.db
				.query("quoteLineItems")
				.withIndex("by_quote", (q) => q.eq("quoteId", fixture.quoteId))
				.collect();
			return {
				snapshot: buildQuoteContentSnapshot(quote, lines),
				storageId: await ctx.storage.store(new Blob(["referenced pdf"])),
			};
		});
		const asUser = t.withIdentity(
			createTestIdentity(fixture.clerkUserId, fixture.clerkOrgId)
		);
		const documentId = await asUser.mutation(api.documents.create, {
			documentType: "quote",
			documentId: fixture.quoteId,
			storageId,
			quoteContentSnapshot: snapshot,
		});
		const boldsignDocumentId = `bs_referenced_${documentId}`;
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, {
			quoteId: fixture.quoteId,
			documentId,
			boldsignDocumentId,
			sendUrl: "https://boldsign.test/referenced",
			sendUrlExpiresAt: 5_000,
			sentTo: [],
		});
		await t.run((ctx) =>
			ctx.db.patch(documentId, {
				boldsign: {
					documentId: boldsignDocumentId,
					status: "Sent",
					sentTo: [],
					sentAt: 1_100,
				},
			})
		);
		return { documentId, boldsignDocumentId };
	}

	it("records one completed decision and preserves its first timestamp on replay", async () => {
		const fixture = await seed();
		await webhook("bs_evidence", "Completed", 2_000);
		await webhook("bs_evidence", "Completed", 3_000);

		const { quote, document, activities, events } = await t.run(async (ctx) => ({
			quote: await ctx.db.get(fixture.quoteId),
			document: await ctx.db.get(fixture.documentId),
			activities: (await ctx.db.query("activities").collect()).filter(
				(row) => row.activityType === "quote_approved"
			),
			events: (await ctx.db.query("domainEvents").collect()).filter(
				(row) =>
					row.eventSource === "boldsign.handleWebhook" &&
					row.payload.entityId === fixture.quoteId
			),
		}));
		const rows = await evidence(fixture.quoteId);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ action: "approved", decidedAt: 2_000 });
		expect(document?.boldsign?.completedAt).toBe(2_000);
		expect(quote).toMatchObject({ status: "approved", approvedAt: 2_000 });
		expect(activities).toHaveLength(1);
		expect(events).toHaveLength(1);
		expect(enqueue).toHaveBeenCalledTimes(1);
	});

	it("keeps the first terminal outcome when conflicting terminal events arrive", async () => {
		const fixture = await seed();
		await webhook("bs_evidence", "Declined", 2_000);
		await webhook("bs_evidence", "Completed", 3_000);

		const { quote, document } = await t.run(async (ctx) => ({
			quote: await ctx.db.get(fixture.quoteId),
			document: await ctx.db.get(fixture.documentId),
		}));
		expect(document?.boldsign).toMatchObject({ status: "Declined", declinedAt: 2_000 });
		expect(document?.boldsign?.completedAt).toBeUndefined();
		expect(quote).toMatchObject({ status: "declined", declinedAt: 2_000 });
		expect((await evidence(fixture.quoteId)).map((row) => row.action)).toEqual([
			"declined",
		]);
		expect(enqueue).not.toHaveBeenCalled();
	});

	it("does not approve for an individual Signed event", async () => {
		const fixture = await seed();
		await webhook("bs_evidence", "Signed", 2_000);
		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote?.status).toBe("sent");
		expect(await evidence(fixture.quoteId)).toEqual([]);
	});

	it("records a superseded completed document without mutating the current quote", async () => {
		const fixture = await seed();
		await t.run(async (ctx) => {
			const storageId = await ctx.storage.store(new Blob(["new pdf"]));
			const currentId = await ctx.db.insert("documents", {
				orgId: fixture.orgId,
				documentType: "quote",
				documentId: fixture.quoteId,
				storageId,
				generatedAt: 1_500,
				version: 2,
			});
			await ctx.db.patch(fixture.quoteId, { latestDocumentId: currentId });
		});

		await webhook("bs_evidence", "Completed", 2_000);
		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote?.status).toBe("sent");
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
	});

	it("does not replay approval after the quote is reopened", async () => {
		const fixture = await seed();
		await webhook("bs_evidence", "Completed", 2_000);
		await t.run((ctx) => ctx.db.patch(fixture.quoteId, { status: "draft" }));
		await webhook("bs_evidence", "Completed", 3_000);
		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote?.status).toBe("draft");
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
	});

	it("records bound evidence but does not approve content edited after rendering", async () => {
		const fixture = await seed({ boundSnapshot: true });
		await t.run((ctx) =>
			ctx.db.patch(fixture.quoteId, {
				title: "Edited after render",
				contentUpdatedAt: 1_500,
			})
		);
		await webhook("bs_evidence", "Completed", 2_000);
		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		const rows = await evidence(fixture.quoteId);
		expect(quote?.status).toBe("sent");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ contentBinding: "rendered_document" });
	});

	it("approves a current document through its referenced content snapshot", async () => {
		const fixture = await seed();
		const prepared = await prepareReferencedDocument(fixture);
		await webhook(prepared.boldsignDocumentId, "Completed", 2_000);

		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		const rows = await evidence(fixture.quoteId);
		expect(quote).toMatchObject({ status: "approved", approvedAt: 2_000 });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ contentBinding: "rendered_document" });
	});

	it("reads referenced content and refuses a stale completion", async () => {
		const fixture = await seed();
		const prepared = await prepareReferencedDocument(fixture);
		await t.run((ctx) =>
			ctx.db.patch(fixture.quoteId, {
				title: "Changed after referenced render",
				contentUpdatedAt: 1_500,
			})
		);
		await webhook(prepared.boldsignDocumentId, "Completed", 2_000);

		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote?.status).toBe("sent");
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
	});

	it("does not apply an old request after a same-content approval cycle restart", async () => {
		const fixture = await seed({ boundSnapshot: true });
		await t.run((ctx) =>
			ctx.db.patch(fixture.quoteId, { status: "draft", approvalCycle: 1 })
		);
		await webhook("bs_evidence", "Completed", 2_000);
		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote?.status).toBe("draft");
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
	});

	it("processes a late Sent once without regressing signing progress", async () => {
		const fixture = await seed({ quoteStatus: "draft" });
		await t.run((ctx) =>
			ctx.db.patch(fixture.documentId, {
				boldsign: {
					documentId: "bs_evidence",
					status: "Draft",
					sentTo: [],
				},
			})
		);
		await webhook("bs_evidence", "Viewed", 2_000);
		await webhook("bs_evidence", "Sent", 1_500);
		const { usage, quote, document } = await t.run(async (ctx) => ({
			usage: await ctx.db
				.query("planUsage")
				.withIndex("by_org_meter_period", (q) =>
					q.eq("orgId", fixture.orgId).eq("meter", "esignatures")
				)
				.collect(),
			quote: await ctx.db.get(fixture.quoteId),
			document: await ctx.db.get(fixture.documentId),
		}));
		expect(usage.map((row) => row.used)).toEqual([1]);
		expect(quote?.status).toBe("sent");
		expect(document?.boldsign).toMatchObject({ status: "Viewed", sentAt: 1_500 });
	});

	it("accepts Completed when the Sent event was not delivered", async () => {
		const fixture = await seed({ quoteStatus: "draft" });
		await t.run((ctx) =>
			ctx.db.patch(fixture.documentId, {
				boldsign: {
					documentId: "bs_evidence",
					status: "Draft",
					sentTo: [],
				},
			})
		);
		await webhook("bs_evidence", "Completed", 2_000);
		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote).toMatchObject({ status: "approved", approvedAt: 2_000 });
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
	});

	it("meters a late Sent after Completed without replaying approval side effects", async () => {
		const fixture = await seed({ quoteStatus: "draft" });
		await t.run((ctx) =>
			ctx.db.patch(fixture.documentId, {
				boldsign: {
					documentId: "bs_evidence",
					status: "Draft",
					sentTo: [],
				},
			})
		);

		await webhook("bs_evidence", "Completed", 2_000);
		await webhook("bs_evidence", "Sent", 1_500);
		await webhook("bs_evidence", "Sent", 1_600);

		const { quote, document, usage, activities, events } = await t.run(
			async (ctx) => ({
				quote: await ctx.db.get(fixture.quoteId),
				document: await ctx.db.get(fixture.documentId),
				usage: await ctx.db
					.query("planUsage")
					.withIndex("by_org_meter_period", (q) =>
						q.eq("orgId", fixture.orgId).eq("meter", "esignatures")
					)
					.collect(),
				activities: (await ctx.db.query("activities").collect()).filter(
					(row) => row.entityId === fixture.quoteId
				),
				events: (await ctx.db.query("domainEvents").collect()).filter(
					(row) =>
						row.eventSource === "boldsign.handleWebhook" &&
						row.payload.entityId === fixture.quoteId
				),
			})
		);

		expect(document?.boldsign).toMatchObject({
			status: "Completed",
			completedAt: 2_000,
			sentAt: 1_500,
		});
		expect(quote).toMatchObject({ status: "approved", approvedAt: 2_000 });
		expect(usage.map((row) => row.used)).toEqual([1]);
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
		expect(activities).toHaveLength(1);
		expect(events).toHaveLength(1);
	});

	it("rejects an old completion after an authenticated reopen and resend", async () => {
		const fixture = await seed({ boundSnapshot: true });
		const asUser = t.withIdentity(
			createTestIdentity(fixture.clerkUserId, fixture.clerkOrgId)
		);
		await asUser.mutation(api.quotes.update, {
			id: fixture.quoteId,
			status: "draft",
		});
		await asUser.mutation(api.quotes.update, {
			id: fixture.quoteId,
			status: "sent",
		});

		await webhook("bs_evidence", "Completed", 2_000);

		const quote = await t.run((ctx) => ctx.db.get(fixture.quoteId));
		expect(quote).toMatchObject({ status: "sent", approvalCycle: 1 });
		expect(quote?.approvedAt).toBeUndefined();
		expect(await evidence(fixture.quoteId)).toHaveLength(1);
	});

	it("keeps an attached vendor request idempotent and rejects replacement", async () => {
		const fixture = await seed();
		const args = {
			quoteId: fixture.quoteId,
			documentId: fixture.documentId,
			boldsignDocumentId: "bs_evidence",
			sendUrl: "https://boldsign.test/send",
			sendUrlExpiresAt: 5_000,
			sentTo: [],
		};
		await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, args);
		await expect(
			t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, {
				...args,
				boldsignDocumentId: "bs_replacement",
			})
		).rejects.toThrow(/already has a BoldSign request/i);
		const document = await t.run((ctx) => ctx.db.get(fixture.documentId));
		expect(document?.boldsignDocumentId).toBe("bs_evidence");
	});
});
