import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestClient, createTestIdentity } from "./test.helpers";
import { triggers } from "./lib/triggers";

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 6);
const NOW = START + 16 * 3_600_000;

describe("recurring project quote copy-forward", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		t = setupConvexTest();
	});
	afterEach(() => vi.useRealTimers());

	async function fixture(count = 5, interval = 1) {
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx);
			await ctx.db.patch(setup.orgId, { timezone: "America/New_York" });
			return { ...setup, clientId: await createTestClient(ctx, setup.orgId) };
		});
		const user = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const projectId = await user.mutation(api.projects.create, {
			clientId: org.clientId, title: "Weekly cleaning", status: "planned", projectType: "recurring", startDate: START,
			recurrenceRule: { frequency: "weekly", interval, end: { kind: "count", count } },
		});
		const project = await t.run((ctx) => ctx.db.get(projectId));
		const quoteId = await user.mutation(api.quotes.create, {
			projectId, clientId: org.clientId, title: "Cleaning scope", status: "draft", subtotal: 0, total: 0,
			terms: "Access required before 9 AM", clientMessage: "Weekly service", validUntil: NOW + 30 * DAY,
			discountEnabled: true, discountType: "fixed", discountAmount: 5.5, taxEnabled: true, taxRate: 8.25,
		});
		const firstLineId = await user.mutation(api.quoteLineItems.create, {
			quoteId, description: "Window cleaning", quantity: 3, unit: "window", rate: 19.99, cost: 8, sortOrder: 0,
		});
		await user.mutation(api.quoteLineItems.create, {
			quoteId, description: "Supplies", quantity: 2.5, unit: "item", rate: 4, sortOrder: 1,
		});
		return { ...org, user, projectId, seriesId: project!.recurringSeriesId!, quoteId, firstLineId };
	}
	type Fixture = Awaited<ReturnType<typeof fixture>>;
	const visits = (f: Fixture) => t.run((ctx) => ctx.db.query("projects").withIndex("by_series_start", (q) => q.eq("recurringSeriesId", f.seriesId)).collect());
	const quotes = (projectId: Id<"projects">) => t.run((ctx) => ctx.db.query("quotes").withIndex("by_project", (q) => q.eq("projectId", projectId)).collect());
	const lines = (quoteId: Id<"quotes">) => t.run((ctx) => ctx.db.query("quoteLineItems").withIndex("by_quote", (q) => q.eq("quoteId", quoteId)).collect());
	async function copy(f: Fixture, quoteId = f.quoteId) {
		const preview = await f.user.query(api.projectSeriesQuotes.previewCopy, { quoteId });
		const result = await f.user.mutation(api.projectSeriesQuotes.copy, { quoteId, expectedRevision: preview.revision });
		expect(result.createCount).toBe(preview.createCount);
		expect(result.updateCount).toBe(preview.updateCount);
		return preview;
	}
	const setup = (f: Fixture) => f.user.query(api.projectSeriesQuotes.getSetup, { projectId: f.projectId });

	it("creates independent drafts with exact amounts, fresh numbers and fresh line items", async () => {
		const f = await fixture();
		await f.user.mutation(api.quotes.update, { id: f.quoteId, pdfSettings: {
			showQuantities: true, showUnitPrices: false, showLineItemTotals: true, showTotals: true,
		} });
		expect((await copy(f)).createCount).toBe(4);
		const numbers = new Set<string | undefined>();
		const sourceLines = await lines(f.quoteId);
		for (const visit of (await visits(f)).slice(1)) {
			const rows = await quotes(visit._id);
			expect(rows).toHaveLength(1);
			const copied = rows[0];
			expect(copied).toMatchObject({ status: "draft", title: "Cleaning scope", clientId: f.clientId,
				terms: "Access required before 9 AM", clientMessage: "Weekly service", subtotal: 69.97,
				taxAmount: 5.32, total: 69.79, discountType: "fixed", discountAmount: 5.5,
				pdfSettings: { showQuantities: true, showUnitPrices: false, showLineItemTotals: true, showTotals: true } });
			numbers.add(copied.quoteNumber);
			expect(copied._id).not.toBe(f.quoteId);
			expect(copied.validUntil).toBeUndefined();
			const copiedLines = (await lines(copied._id)).sort((a, b) => a.sortOrder - b.sortOrder);
			expect(copiedLines).toHaveLength(2);
			expect(copiedLines[0]).toMatchObject({ description: "Window cleaning", quantity: 3, rate: 19.99, cost: 8, amount: 59.97 });
			expect(copiedLines[1].amount).toBe(10);
			expect(copiedLines.every((line) => !sourceLines.some((source) => source._id === line._id))).toBe(true);
		}
		expect(numbers.size).toBe(4);
		expect(numbers.has((await quotes(f.projectId))[0].quoteNumber)).toBe(false);
	});

	it("updates only the same source's draft copy while preserving manual and other-source quotes", async () => {
		const f = await fixture(3);
		await copy(f);
		const target = (await visits(f))[1];
		const first = (await quotes(target._id))[0];
		const manualId = await f.user.mutation(api.quotes.create, { clientId: f.clientId, projectId: target._id, title: "Manual extra", status: "draft", subtotal: 0, total: 0 });
		const secondId = await f.user.mutation(api.quotes.create, { clientId: f.clientId, projectId: f.projectId, title: "Separate offer", status: "draft", subtotal: 0, total: 0 });
		await copy(f, secondId);
		await f.user.mutation(api.quotes.update, { id: first._id, title: "Ordinary draft edit" });
		await f.user.mutation(api.quoteLineItems.update, { id: (await lines(first._id))[0]._id, quantity: 10 });
		await f.user.mutation(api.quotes.update, { id: f.quoteId, title: "Updated scope", discountAmount: 0 });
		await f.user.mutation(api.quoteLineItems.update, { id: f.firstLineId, quantity: 4 });
		await copy(f);
		await copy(f);
		const after = await quotes(target._id);
		expect(after).toHaveLength(3);
		expect(after.find((quote) => quote._id === first._id)).toMatchObject({ title: "Updated scope", quoteNumber: first.quoteNumber, subtotal: 89.96 });
		expect((await lines(first._id)).find((line) => line.sortOrder === 0)?.quantity).toBe(4);
		expect(after.find((quote) => quote._id === manualId)?.title).toBe("Manual extra");
		expect(after.filter((quote) => quote.title === "Separate offer")).toHaveLength(1);
	});

	it("retains the last published source version for later generation after source edits and deletion", async () => {
		const f = await fixture(4, 8);
		await copy(f);
		await f.user.mutation(api.quotes.update, { id: f.quoteId, title: "Unpublished change" });
		await f.user.mutation(api.quoteLineItems.update, { id: f.firstLineId, quantity: 99 });
		await f.user.mutation(api.quotes.remove, { id: f.quoteId });
		vi.setSystemTime(NOW + 60 * DAY);
		await t.mutation(internal.projectSeries.generate, { orgId: f.orgId, seriesId: f.seriesId });
		const later = (await visits(f)).find((visit) => visit.startDate === START + 112 * DAY)!;
		expect((await quotes(later._id))[0]).toMatchObject({ title: "Cleaning scope", subtotal: 69.97, total: 69.79, status: "draft" });
		expect((await setup(f))!.templates[0]).toMatchObject({ sourceAvailable: false, active: true });
	});

	it("stops future generation while leaving all existing quotes and line items unchanged", async () => {
		const f = await fixture(4, 8);
		await copy(f);
		const existing = (await quotes((await visits(f))[1]._id))[0];
		const originalLines = await lines(existing._id);
		const current = (await setup(f))!;
		await f.user.mutation(api.projectSeriesQuotes.stop, { templateId: current.templates[0]._id, expectedRevision: current.revision });
		expect((await quotes(existing.projectId!))[0]).toEqual(existing);
		expect(await lines(existing._id)).toEqual(originalLines);
		vi.setSystemTime(NOW + 60 * DAY);
		await t.mutation(internal.projectSeries.generate, { orgId: f.orgId, seriesId: f.seriesId });
		const later = (await visits(f)).find((visit) => visit.startDate === START + 112 * DAY)!;
		expect(await quotes(later._id)).toHaveLength(0);
	});

	it("rejects stale previews after source line edits, target edits, or quote status changes", async () => {
		const f = await fixture(3);
		let preview = await f.user.query(api.projectSeriesQuotes.previewCopy, { quoteId: f.quoteId });
		await f.user.mutation(api.quoteLineItems.update, { id: f.firstLineId, description: "Changed at same timestamp" });
		await expect(f.user.mutation(api.projectSeriesQuotes.copy, { quoteId: f.quoteId, expectedRevision: preview.revision })).rejects.toThrow(/stale|preview/i);
		await copy(f);
		const target = (await quotes((await visits(f))[1]._id))[0];
		preview = await f.user.query(api.projectSeriesQuotes.previewCopy, { quoteId: f.quoteId });
		await f.user.mutation(api.quoteLineItems.update, { id: (await lines(target._id))[0]._id, description: "Target draft change" });
		await expect(f.user.mutation(api.projectSeriesQuotes.copy, { quoteId: f.quoteId, expectedRevision: preview.revision })).rejects.toThrow(/stale|preview/i);
		preview = await f.user.query(api.projectSeriesQuotes.previewCopy, { quoteId: f.quoteId });
		await f.user.mutation(api.quotes.update, { id: target._id, status: "approved" });
		await expect(f.user.mutation(api.projectSeriesQuotes.copy, { quoteId: f.quoteId, expectedRevision: preview.revision })).rejects.toThrow(/stale|preview/i);
	});

	it("keeps sent or approved copies protected even after they are reopened as drafts", async () => {
		const f = await fixture(4);
		await copy(f);
		const targets = await Promise.all((await visits(f)).slice(1).map(async (project) => (await quotes(project._id))[0]));
		await f.user.mutation(api.quotes.update, { id: targets[0]._id, status: "sent" });
		await f.user.mutation(api.quotes.update, { id: targets[0]._id, status: "draft" });
		await f.user.mutation(api.quotes.update, { id: targets[1]._id, status: "approved" });
		await f.user.mutation(api.quotes.update, { id: targets[1]._id, status: "draft" });
		await f.user.mutation(api.quotes.update, { id: f.quoteId, title: "Published change" });
		await copy(f);
		expect((await quotes(targets[0].projectId!))[0].title).toBe("Cleaning scope");
		expect((await quotes(targets[1].projectId!))[0].title).toBe("Cleaning scope");
		expect((await quotes(targets[2].projectId!))[0].title).toBe("Published change");
	});

	it("excludes suppressed, started, billed and past visits from propagation", async () => {
		const f = await fixture(6);
		const rows = await visits(f);
		await f.user.mutation(api.projectSeries.skip, { projectId: rows[1]._id });
		await f.user.mutation(api.tasks.create, { clientId: f.clientId, projectId: rows[2]._id, title: "Work started", status: "in-progress", date: rows[2].startDate! });
		await f.user.mutation(api.invoices.create, { clientId: f.clientId, projectId: rows[3]._id, invoiceNumber: "COPY-1", status: "draft", subtotal: 10, total: 10, issuedDate: NOW, dueDate: NOW + DAY });
		vi.setSystemTime(NOW + 30 * DAY);
		await copy(f);
		for (const row of rows.slice(1, 5)) expect(await quotes(row._id)).toHaveLength(0);
		expect(await quotes(rows[5]._id)).toHaveLength(1);
	});

	it("never emits inherited approval events or creates approval audit records", async () => {
		const f = await fixture(3);
		await f.user.mutation(api.quotes.update, { id: f.quoteId, status: "approved" });
		await copy(f);
		for (const row of (await visits(f)).slice(1)) {
			const quote = (await quotes(row._id))[0];
			expect(quote.status).toBe("draft");
			expect(quote.approvedAt).toBeUndefined();
			expect(await t.run((ctx) => ctx.db.query("quoteApprovals").withIndex("by_quote", (q) => q.eq("quoteId", quote._id)).collect())).toHaveLength(0);
		}
		const events = await t.run(async (ctx) => (await ctx.db.query("domainEvents").collect()).filter((event) => event.eventSource === "projectSeriesQuotes.copy"));
		expect(events).toHaveLength(2);
		expect(events.every((event) => event.eventType === "entity.record_created")).toBe(true);
		await copy(f);
		const updates = await t.run(async (ctx) => (await ctx.db.query("domainEvents").collect()).filter((event) => event.eventSource === "projectSeriesQuotes.copy" && event.eventType === "entity.record_updated"));
		expect(updates).toHaveLength(0);
		await f.user.mutation(api.quotes.update, { id: f.quoteId, status: "draft" });
		await f.user.mutation(api.quotes.update, { id: f.quoteId, title: "Updated service title" });
		await copy(f);
		const changed = await t.run(async (ctx) => (await ctx.db.query("domainEvents").collect()).filter((event) => event.eventSource === "projectSeriesQuotes.copy" && event.eventType === "entity.record_updated"));
		expect(changed).toHaveLength(2);
		expect(changed.every((event) => JSON.stringify(event.payload.metadata?.changedFields) === JSON.stringify(["title"]))).toBe(true);
	});

	it("blocks ordinary draft-copy propagation once a recurring agreement is designated", async () => {
		const f = await fixture(3);
		await t.run(async (ctx) => {
			await triggers.wrapDB(ctx).db.patch(f.seriesId, { agreementQuoteId: f.quoteId });
		});
		expect((await setup(f))!.canCopy).toBe(false);
		await expect(f.user.query(api.projectSeriesQuotes.previewCopy, { quoteId: f.quoteId })).rejects.toThrow(/agreement/i);
		await expect(f.user.mutation(api.projectSeriesQuotes.copy, { quoteId: f.quoteId, expectedRevision: 0 })).rejects.toThrow(/agreement/i);
		expect(await quotes((await visits(f))[1]._id)).toHaveLength(0);
	});

	it("requires stopping saved quote setup before moving the series to a different client", async () => {
		const f = await fixture(3);
		await copy(f);
		const nextClient = await t.run((ctx) => createTestClient(ctx, f.orgId, { companyName: "Different customer" }));
		await expect(f.user.mutation(api.projectSeries.updateFuture, {
			projectId: f.projectId, updates: { clientId: nextClient },
		})).rejects.toThrow(/stop.*quote|quote.*stop/i);
		expect((await t.run((ctx) => ctx.db.get(f.seriesId)))!.clientId).toBe(f.clientId);
		await f.user.mutation(api.projectSeries.updateFuture, { projectId: f.projectId, updates: { title: "Weekly window care" } });
		const current = (await setup(f))!;
		await f.user.mutation(api.projectSeriesQuotes.stop, { templateId: current.templates[0]._id, expectedRevision: current.revision });
		await f.user.mutation(api.projectSeries.updateFuture, { projectId: f.projectId, updates: { clientId: nextClient } });
		expect((await t.run((ctx) => ctx.db.get(f.seriesId)))!.clientId).toBe(nextClient);
	});
});
