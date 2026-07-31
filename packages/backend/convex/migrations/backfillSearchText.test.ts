import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "../test.setup";
import {
	createTestOrg,
	createTestIdentity,
	createTestClient,
	createTestClientContact,
	createTestClientProperty,
	createTestProject,
	createTestQuote,
	createTestInvoice,
	createTestTask,
} from "../test.helpers";

/**
 * Coverage for migrations/backfillSearchText.ts: the walk that fills in
 * `searchText` on rows written before the search indexes existed.
 *
 * The chain schedules itself with runAfter, so every run drains it with the
 * fake-timers + finishAllScheduledFunctions idiom (see rebuildAggregates.test.ts).
 */

describe("backfillSearchText", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function runBackfill() {
		await t.mutation(
			internal.migrations.backfillSearchText.startSearchTextBackfill,
			{}
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		return await t.query(
			internal.migrations.backfillSearchText.searchTextBackfillStatus,
			{}
		);
	}

	/** Seeds one row in every searchable table, then strips their digests. */
	async function seedStripped() {
		const seeded = await t.run(async (ctx) => {
			const { orgId, clerkUserId, clerkOrgId } = await createTestOrg(ctx, {
				clerkUserId: "user_backfill",
				clerkOrgId: "org_backfill",
			});
			const clientId = await createTestClient(ctx, orgId, {
				companyName: "Backfill Roofing",
			});
			const contactId = await createTestClientContact(ctx, orgId, clientId, {
				firstName: "Marta",
				lastName: "Quintero",
				jobTitle: "Backfill Supervisor",
			});
			const propertyId = await createTestClientProperty(ctx, orgId, clientId, {
				streetAddress: "88 Backfill Way",
			});
			const projectId = await createTestProject(ctx, orgId, clientId, {
				title: "Backfill Deck",
			});
			const quoteId = await createTestQuote(ctx, orgId, clientId, {
				title: "Backfill Quote",
				quoteNumber: "Q-6120",
			});
			const invoiceId = await createTestInvoice(ctx, orgId, clientId, {
				invoiceNumber: "INV-6120",
			});
			const taskId = await createTestTask(ctx, orgId, {
				title: "Backfill Punchlist",
			});
			return {
				orgId,
				clerkUserId,
				clerkOrgId,
				clientId,
				contactId,
				propertyId,
				projectId,
				quoteId,
				invoiceId,
				taskId,
			};
		});

		// Raw patches bypass lib/triggers.ts — exactly the pre-index state.
		await t.run(async (ctx) => {
			for (const id of [
				seeded.clientId,
				seeded.contactId,
				seeded.propertyId,
				seeded.projectId,
				seeded.quoteId,
				seeded.invoiceId,
				seeded.taskId,
			] as Id<"clients">[]) {
				await ctx.db.patch(id, { searchText: undefined });
			}
		});

		return seeded;
	}

	it("restores every stripped digest", async () => {
		const seeded = await seedStripped();

		const before = await t.run((ctx) => ctx.db.get(seeded.clientId));
		expect(before?.searchText).toBeUndefined();

		const status = await runBackfill();
		expect(status?.status).toBe("done");
		expect(status?.processed).toBe(7);
		expect(status?.written).toBe(7);
		expect(status?.errors).toEqual([]);

		const digests = await t.run(async (ctx) => ({
			client: (await ctx.db.get(seeded.clientId))?.searchText,
			contact: (await ctx.db.get(seeded.contactId))?.searchText,
			property: (await ctx.db.get(seeded.propertyId))?.searchText,
			project: (await ctx.db.get(seeded.projectId))?.searchText,
			quote: (await ctx.db.get(seeded.quoteId))?.searchText,
			invoice: (await ctx.db.get(seeded.invoiceId))?.searchText,
			task: (await ctx.db.get(seeded.taskId))?.searchText,
		}));

		expect(digests.client).toBe("Backfill Roofing");
		expect(digests.contact).toContain("Marta Quintero");
		expect(digests.property).toContain("88 Backfill Way");
		expect(digests.project).toBe("Backfill Deck");
		expect(digests.quote).toContain("6120");
		expect(digests.invoice).toContain("6120");
		expect(digests.task).toBe("Backfill Punchlist");
	});

	it("makes the repaired rows searchable again", async () => {
		const seeded = await seedStripped();
		await runBackfill();

		const asUser = t.withIdentity(
			createTestIdentity(seeded.clerkUserId, seeded.clerkOrgId)
		);
		const result = await asUser.query(api.search.globalSearch, {
			query: "backfill",
		});

		expect(result.clients.map((c) => c.kind).sort()).toEqual([
			"client",
			"contact",
			"property",
		]);
		expect(result.projects.map((p) => p.label)).toEqual(["Backfill Deck"]);
		expect(result.quotes.map((q) => q.label)).toEqual(["Backfill Quote"]);
		expect(result.tasks.map((task) => task.title)).toEqual([
			"Backfill Punchlist",
		]);
	});

	it("is idempotent — a second run writes nothing", async () => {
		await seedStripped();

		const first = await runBackfill();
		expect(first?.written).toBe(7);

		const second = await runBackfill();
		expect(second?.status).toBe("done");
		expect(second?.processed).toBe(7);
		expect(second?.written).toBe(0);
	});

	it("paginates past the batch size", async () => {
		const { orgId } = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_paged",
				clerkOrgId: "org_paged",
			})
		);
		// Raw inserts: no trigger, so nothing has a digest and the walk has to
		// cover every page. 250 rows = 3 batches at BATCH_SIZE 100.
		await t.run(async (ctx) => {
			for (let i = 0; i < 250; i++) {
				await ctx.db.insert("clients", {
					orgId,
					companyName: `Paged Co ${i}`,
					status: "active",
				});
			}
		});

		const status = await runBackfill();
		expect(status?.status).toBe("done");
		expect(status?.processed).toBe(250);
		expect(status?.written).toBe(250);

		const missing = await t.run(async (ctx) => {
			const rows = await ctx.db.query("clients").collect();
			return rows.filter((row) => row.searchText === undefined).length;
		});
		expect(missing).toBe(0);
	});

	it("pause stops the chain mid-flight; resume finishes it", async () => {
		const seeded = await seedStripped();

		await t.mutation(
			internal.migrations.backfillSearchText.startSearchTextBackfill,
			{}
		);
		await t.mutation(
			internal.migrations.backfillSearchText.pauseSearchTextBackfill,
			{}
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		let status = await t.query(
			internal.migrations.backfillSearchText.searchTextBackfillStatus,
			{}
		);
		expect(status?.status).toBe("paused");
		// t.run round-trips undefined as null, so unwrap through an object.
		expect(
			await t.run(async (ctx) => ({
				digest: (await ctx.db.get(seeded.clientId))?.searchText ?? null,
			}))
		).toEqual({ digest: null });

		await t.mutation(
			internal.migrations.backfillSearchText.resumeSearchTextBackfill,
			{}
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		status = await t.query(
			internal.migrations.backfillSearchText.searchTextBackfillStatus,
			{}
		);
		expect(status?.status).toBe("done");
		expect(status?.written).toBe(7);
	});
});
