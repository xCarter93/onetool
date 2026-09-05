import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { periodKeyFor } from "../lib/entitlements";
import { setupConvexTest } from "../test.setup";
import { createTestIdentity, createTestOrg } from "../test.helpers";

describe("backfillEsignatureUsage", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("seeds this month's meter from sent documents, idempotently, keeping bonus", async () => {
		const now = Date.now();
		const d = new Date(now);
		const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
		const periodKey = periodKeyFor("calendarMonth", now);

		const org = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx);
			const storageId = await ctx.storage.store(new Blob(["pdf"]));
			const insertDoc = (sentAt: number | undefined) =>
				ctx.db.insert("documents", {
					orgId: created.orgId,
					documentType: "quote",
					documentId: "quote_1",
					storageId,
					generatedAt: now,
					version: 1,
					boldsign: {
						documentId: `bs_${sentAt ?? "draft"}`,
						status: sentAt === undefined ? "Draft" : "Sent",
						sentTo: [],
						sentAt,
					},
				});
			await insertDoc(monthStart + 1_000);
			await insertDoc(now);
			await insertDoc(monthStart - 1_000);
			await insertDoc(undefined);
			await ctx.db.insert("planUsage", {
				orgId: created.orgId,
				meter: "esignatures",
				periodKey,
				used: 0,
				bonus: 2,
			});
			return created;
		});

		const readRow = (orgId: Id<"organizations">) =>
			t.run((ctx: { db: MutationCtx["db"] }) =>
				ctx.db
					.query("planUsage")
					.withIndex("by_org_meter_period", (q) =>
						q.eq("orgId", orgId).eq("meter", "esignatures").eq("periodKey", periodKey)
					)
					.unique()
			);

		const first = await t.mutation(
			internal.migrations.backfillEsignatureUsage.backfillEsignatureUsage,
			{}
		);
		expect(first).toEqual({ scanned: 1, seeded: 1, isDone: true });
		expect(await readRow(org.orgId)).toMatchObject({ used: 2, bonus: 2 });

		await t.mutation(
			internal.migrations.backfillEsignatureUsage.backfillEsignatureUsage,
			{}
		);
		expect(await readRow(org.orgId)).toMatchObject({ used: 2, bonus: 2 });

		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const mine = await asOwner.query(api.entitlements.getMine, {});
		expect(mine.meters.find((m) => m.key === "esignatures")).toMatchObject({
			used: 2,
			limit: 7,
		});
	});

	it("never lowers a meter the live webhook already advanced past the document count", async () => {
		const now = Date.now();
		const periodKey = periodKeyFor("calendarMonth", now);

		const org = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx);
			const storageId = await ctx.storage.store(new Blob(["pdf"]));
			await ctx.db.insert("documents", {
				orgId: created.orgId,
				documentType: "quote",
				documentId: "quote_1",
				storageId,
				generatedAt: now,
				version: 1,
				boldsign: { documentId: "bs_1", status: "Sent", sentTo: [], sentAt: now },
			});
			await ctx.db.insert("planUsage", {
				orgId: created.orgId,
				meter: "esignatures",
				periodKey,
				used: 3,
			});
			return created;
		});
		const orgWithNoDocs = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx);
			await ctx.db.insert("planUsage", {
				orgId: created.orgId,
				meter: "esignatures",
				periodKey,
				used: 1,
			});
			return created;
		});

		await t.mutation(
			internal.migrations.backfillEsignatureUsage.backfillEsignatureUsage,
			{}
		);
		const readRow = (orgId: Id<"organizations">) =>
			t.run((ctx: { db: MutationCtx["db"] }) =>
				ctx.db
					.query("planUsage")
					.withIndex("by_org_meter_period", (q) =>
						q.eq("orgId", orgId).eq("meter", "esignatures").eq("periodKey", periodKey)
					)
					.unique()
			);
		expect(await readRow(org.orgId)).toMatchObject({ used: 3 });
		expect(await readRow(orgWithNoDocs.orgId)).toMatchObject({ used: 1 });
	});
});
