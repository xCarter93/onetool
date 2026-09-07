import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { buildQuoteContentSnapshot, loadQuoteDocumentSnapshot } from "./lib/quoteContentSnapshot";
import { setupConvexTest } from "./test.setup";
import { createTestClient, createTestIdentity, createTestOrg, createTestQuote } from "./test.helpers";

describe("quote PDF content snapshots", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => {
		vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
		t = setupConvexTest();
	});

	async function fixture() {
		const seeded = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx);
			const clientId = await createTestClient(ctx, org.orgId);
			const quoteId = await createTestQuote(ctx, org.orgId, clientId, {
				title: "Bound quote", quoteNumber: "Q-900001", subtotal: 0, total: 0,
			});
			await ctx.db.patch(quoteId, {
				terms: "Net 30", discountEnabled: true, discountType: "fixed",
				discountAmount: 1, taxEnabled: true, taxRate: 10,
			});
			await ctx.db.insert("quoteLineItems", {
				orgId: org.orgId, quoteId, description: "Service", quantity: 2,
				unit: "item", rate: 10.005, amount: 0, cost: 7, sortOrder: 0,
			});
			return { ...org, clientId, quoteId };
		});
		const snapshot = await t.run(async (ctx) => {
			const quote = (await ctx.db.get(seeded.quoteId))!;
			const lines = await ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", seeded.quoteId)).collect();
			return buildQuoteContentSnapshot(quote, lines);
		});
		const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["pdf"])));
		return { ...seeded, snapshot, storageId, user: t.withIdentity(createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId)) };
	}

	it("stores the server-normalized snapshot and accepts unchanged regeneration", async () => {
		const f = await fixture();
		expect(f.snapshot).toMatchObject({ subtotal: 20.01, taxAmount: 1.9, total: 20.91 });
		const first = await f.user.mutation(api.documents.create, {
			documentType: "quote", documentId: f.quoteId, storageId: f.storageId,
			quoteContentSnapshot: f.snapshot,
		});
		await expect(f.user.mutation(api.documents.create, {
			documentType: "quote", documentId: f.quoteId, storageId: f.storageId,
			quoteContentSnapshot: f.snapshot,
		})).resolves.toBeTruthy();
		const stored = await t.run((ctx) => ctx.db.get(first));
		expect(stored?.quoteContentSnapshot).toBeUndefined();
		expect(stored?.quoteSnapshotSource).toBe("workspace");
		expect(stored?.quoteContentSnapshotId).toBeTruthy();
		const loaded = await t.run((ctx) => loadQuoteDocumentSnapshot(ctx, stored!));
		expect(loaded).toEqual(f.snapshot);
		expect(loaded?.lineItems[0]).not.toHaveProperty("cost");
	});

	it("distinguishes server-rendered content from workspace uploads", async () => {
		const f = await fixture();
		const result = await t.mutation(internal.pdfData._insertGeneratedDocument, {
			orgId: f.orgId, documentType: "quote", documentId: f.quoteId,
			storageId: f.storageId, quoteContentSnapshot: f.snapshot,
		});
		const doc = await t.run((ctx) => ctx.db.get(result.documentId));
		expect(doc?.quoteSnapshotSource).toBe("server");
		expect(doc?.quoteContentSnapshotId).toBeTruthy();
		expect(doc?.quoteContentSnapshot).toBeUndefined();
	});

	it("rejects a stale server render even when the change has the same timestamp", async () => {
		const f = await fixture();
		await t.run(async (ctx) => {
			const line = await ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", f.quoteId)).unique();
			await ctx.db.patch(line!._id, { description: "Changed at same timestamp" });
		});
		await expect(t.mutation(internal.pdfData._insertGeneratedDocument, {
			orgId: f.orgId, documentType: "quote", documentId: f.quoteId,
			storageId: f.storageId, quoteContentSnapshot: f.snapshot,
		})).rejects.toThrow(/changed while the PDF was generated/i);
	});

	it("keeps the snapshot optional for legacy callers and invoice documents", async () => {
		const f = await fixture();
		const id = await f.user.mutation(api.documents.create, {
			documentType: "quote", documentId: f.quoteId, storageId: f.storageId,
		});
		expect((await t.run((ctx) => ctx.db.get(id)))?.quoteContentSnapshot).toBeUndefined();
	});

	it("fails closed when a referenced content row is missing", async () => {
		const f = await fixture();
		const id = await f.user.mutation(api.documents.create, {
			documentType: "quote", documentId: f.quoteId, storageId: f.storageId,
			quoteContentSnapshot: f.snapshot,
		});
		const document = await t.run((ctx) => ctx.db.get(id));
		await t.run((ctx) => ctx.db.delete(document!.quoteContentSnapshotId!));
		await expect(t.run((ctx) => loadQuoteDocumentSnapshot(ctx, document!)))
			.rejects.toThrow(/missing or invalid/i);
	});
});
