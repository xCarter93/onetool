import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { setupConvexTest } from "../test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestOrg,
} from "../test.helpers";

describe("backfillQuoteTotals", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("restores drifted stored totals and leaves correct rows untouched", async () => {
		const { org, clientId } = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx);
			return { org: created, clientId: await createTestClient(ctx, created.orgId) };
		});
		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const quoteId = await asOwner.mutation(api.quotes.create, {
			clientId,
			status: "draft",
			subtotal: 0,
			total: 0,
			title: "Legacy",
			taxEnabled: true,
			taxRate: 10,
		});
		await asOwner.mutation(api.quoteLineItems.create, {
			quoteId,
			description: "Mow",
			quantity: 2,
			unit: "hr",
			rate: 100,
			sortOrder: 0,
		});
		const synced = await t.run((ctx) => ctx.db.get(quoteId));
		expect(synced).toMatchObject({ subtotal: 200, taxAmount: 20, total: 220 });

		await t.run((ctx) => ctx.db.patch(quoteId, { subtotal: 0, taxAmount: 0, total: 0 }));

		const result = await t.mutation(
			internal.migrations.backfillQuoteTotals.backfillQuoteTotals,
			{}
		);
		expect(result).toEqual({ scanned: 1, isDone: true });
		const fixed = await t.run((ctx) => ctx.db.get(quoteId));
		expect(fixed).toMatchObject({ subtotal: 200, taxAmount: 20, total: 220 });
	});
});
