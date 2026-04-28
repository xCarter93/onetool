// Plan 13-02 Wave 1: portal backfill migration coverage (Review fix #8).
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../test.setup";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

describe("portal migrations backfill", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("assigns portalAccessId to every clients row that lacks one [Review fix #8]", async () => {
		const clientIds: Id<"clients">[] = [];
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Owner",
				email: "owner@example.com",
				image: "https://example.com/u.png",
				externalId: "user_owner_a",
			});
			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "org_acme",
				name: "Acme",
				ownerUserId: userId,
			});
			for (let i = 0; i < 3; i++) {
				const id = await ctx.db.insert("clients", {
					orgId,
					companyName: `Client ${i}`,
					status: "active",
					// no portalAccessId
				});
				clientIds.push(id);
			}
		});

		const result = await t.mutation(
			internal.portal.migrations.backfillPortalAccessIds,
			{}
		);
		expect(result.assigned).toBe(3);
		expect(result.alreadySet).toBe(0);

		const rows = await t.run((ctx) =>
			Promise.all(clientIds.map((id) => ctx.db.get(id)))
		);
		const ids = rows.map((r) => r?.portalAccessId);
		expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
			true
		);
		expect(new Set(ids).size).toBe(3); // all unique
	});

	it("is idempotent — second run re-assigns nothing", async () => {
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Owner",
				email: "owner@example.com",
				image: "https://example.com/u.png",
				externalId: "user_owner_b",
			});
			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "org_x",
				name: "X",
				ownerUserId: userId,
			});
			await ctx.db.insert("clients", {
				orgId,
				companyName: "X",
				status: "active",
				portalAccessId: "preset-uuid",
			});
		});
		const result = await t.mutation(
			internal.portal.migrations.backfillPortalAccessIds,
			{}
		);
		expect(result.assigned).toBe(0);
		expect(result.alreadySet).toBe(1);
	});

	it("[CR-06] cursor-paginates beyond a single batch — every row backfilled", async () => {
		const N = 50; // > batchSize=20 below
		const clientIds: Id<"clients">[] = [];
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Owner",
				email: "owner@example.com",
				image: "https://example.com/u.png",
				externalId: "user_owner_pages",
			});
			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "org_pages",
				name: "PageCorp",
				ownerUserId: userId,
			});
			for (let i = 0; i < N; i++) {
				const id = await ctx.db.insert("clients", {
					orgId,
					companyName: `Client ${i}`,
					status: "active",
				});
				clientIds.push(id);
			}
		});

		// Drive the cursor until isDone.
		let cursor: string | null = null;
		let totalAssigned = 0;
		let safety = 100;
		while (safety-- > 0) {
			const result: {
				assigned: number;
				alreadySet: number;
				examined: number;
				isDone: boolean;
				cursor: string;
			} = await t.mutation(
				internal.portal.migrations.backfillPortalAccessIds,
				{ batchSize: 20, cursor }
			);
			totalAssigned += result.assigned;
			if (result.isDone) break;
			cursor = result.cursor;
		}

		expect(totalAssigned).toBe(N);

		// Every row got a unique id.
		const rows = await t.run((ctx) =>
			Promise.all(clientIds.map((id) => ctx.db.get(id)))
		);
		const ids = rows.map((r) => r?.portalAccessId);
		expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
			true
		);
		expect(new Set(ids).size).toBe(N);
	});

	it("dry-run mode does not patch", async () => {
		await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Owner",
				email: "owner@example.com",
				image: "https://example.com/u.png",
				externalId: "user_owner_c",
			});
			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: "org_dry",
				name: "X",
				ownerUserId: userId,
			});
			await ctx.db.insert("clients", {
				orgId,
				companyName: "X",
				status: "active",
			});
		});
		const result = await t.mutation(
			internal.portal.migrations.backfillPortalAccessIds,
			{ dryRun: true }
		);
		expect(result.assigned).toBe(1); // would have assigned

		const rows = await t.run((ctx) => ctx.db.query("clients").collect());
		expect(rows[0].portalAccessId).toBeUndefined();
	});
});
