import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestClient, createTestIdentity, createTestOrg } from "./test.helpers";

describe("agreement quote deletion", () => {
	let t: ReturnType<typeof setupConvexTest>;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(Date.UTC(2026, 8, 6));
		t = setupConvexTest();
	});
	afterEach(() => vi.useRealTimers());

	async function fixture() {
		const org = await t.run(async (ctx) => {
			const setup = await createTestOrg(ctx);
			return { ...setup, clientId: await createTestClient(ctx, setup.orgId) };
		});
		const user = t.withIdentity(createTestIdentity(org.clerkUserId, org.clerkOrgId));
		const projectId = await user.mutation(api.projects.create, {
			clientId: org.clientId, title: "Weekly service", status: "planned",
			projectType: "recurring", startDate: Date.UTC(2026, 8, 6),
			recurrenceRule: { frequency: "weekly", interval: 1, end: { kind: "count", count: 3 } },
		});
		const quoteId = await user.mutation(api.quotes.create, {
			projectId, clientId: org.clientId, title: "Service agreement", status: "draft", subtotal: 0, total: 0,
		});
		const lineId = await user.mutation(api.quoteLineItems.create, {
			quoteId, description: "Service", quantity: 1, unit: "visit", rate: 100, sortOrder: 0,
		});
		return { ...org, user, projectId, quoteId, lineId };
	}

	it.each(["draft", "pending", "approved", "superseded"] as const)(
		"preserves the source quote and lines referenced by a %s agreement revision",
		async (status) => {
			const f = await fixture();
			const setup = await f.user.query(api.projectSeriesAgreements.getSetup, { quoteId: f.quoteId });
			const prepared = await f.user.mutation(api.projectSeriesAgreements.prepare, {
				quoteId: f.quoteId, expectedSeriesRevision: setup.revision,
				billingMode: "per_visit", paymentRule: { type: "percentage", installments: [{ percentage: 100, dayOffset: 30 }] },
			});
			// Deletion must preserve history regardless of the revision's lifecycle state.
			await t.run((ctx) => ctx.db.patch(prepared.revisionId, { status }));
			await expect(f.user.mutation(api.quotes.remove, { id: f.quoteId })).rejects.toThrow(/agreement history/i);
			const remaining = await t.run(async (ctx) => ({
				quote: await ctx.db.get(f.quoteId), line: await ctx.db.get(f.lineId), revision: await ctx.db.get(prepared.revisionId),
			}));
			expect(remaining.quote).not.toBeNull();
			expect(remaining.line).not.toBeNull();
			expect(remaining.revision?.sourceQuoteId).toBe(f.quoteId);
		},
	);

	it("still removes an ordinary quote and its lines", async () => {
		const f = await fixture();
		await f.user.mutation(api.quotes.remove, { id: f.quoteId });
		expect(await t.run((ctx) => ctx.db.get(f.quoteId))).toBeNull();
		expect(await t.run((ctx) => ctx.db.get(f.lineId))).toBeNull();
	});
});
