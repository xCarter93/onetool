import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "../test.setup";
import { createTestOrg, createTestIdentity } from "../test.helpers";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
	invoiceCountsAggregate,
} from "../aggregates";

/**
 * Coverage for migrations/rebuildAggregates.ts: the clear-then-reseed chain
 * that repairs aggregate drift lib/triggers.ts can't (rows written before the
 * trigger registry, or via a raw ctx.db call that bypasses it).
 *
 * The chain schedules itself with runAfter, so every run drains it with the
 * fake-timers + finishAllScheduledFunctions idiom (see push.test.ts / boldsign.test.ts).
 */

const DAY = 24 * 60 * 60 * 1000;

describe("rebuildAggregates", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function seedOrg(suffix: string) {
		const { orgId, clerkUserId, clerkOrgId } = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: `user_rebuild_${suffix}`,
				clerkOrgId: `org_rebuild_${suffix}`,
			})
		);
		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));
		return { orgId, asUser };
	}

	async function createClientViaApi(
		asUser: ReturnType<typeof t.withIdentity>,
		companyName: string
	): Promise<Id<"clients">> {
		return await asUser.mutation(api.clients.create, {
			companyName,
			status: "active",
			portalAccessId: crypto.randomUUID(),
		});
	}

	async function createInvoiceViaApi(
		asUser: ReturnType<typeof t.withIdentity>,
		clientId: Id<"clients">,
		opts: { invoiceNumber: string; total: number; status: "draft" | "sent" | "paid" | "overdue" | "cancelled" }
	): Promise<Id<"invoices">> {
		const now = Date.now();
		return await asUser.mutation(api.invoices.create, {
			clientId,
			invoiceNumber: opts.invoiceNumber,
			subtotal: opts.total,
			taxAmount: 0,
			total: opts.total,
			status: opts.status,
			issuedDate: now,
			dueDate: now + 30 * DAY,
		});
	}

	/** Runs startAggregateRebuild and drains the self-scheduling chain to completion. */
	async function runRebuild() {
		await t.mutation(internal.migrations.rebuildAggregates.startAggregateRebuild, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
	}

	it("finishes as failed, not done, when any row errored", async () => {
		await seedOrg("failed");
		await runRebuild();

		// Land the chain on its terminal step with recorded errors, then let the
		// final batch decide the terminal status.
		const generation = await t.run(async (ctx) => {
			const state = await ctx.db.query("backfillState").first();
			await ctx.db.patch(state!._id, {
				status: "running",
				step: 4,
				errors: ["Failed to seed clients abc: boom"],
				errorCount: 37,
			});
			return state!.generation;
		});

		await t.mutation(
			internal.migrations.rebuildAggregates.rebuildAggregatesBatch,
			{ generation }
		);

		const status = await t.query(
			internal.migrations.rebuildAggregates.aggregateRebuildStatus,
			{}
		);
		expect(status?.status).toBe("failed");
		// Recorded messages are capped at 20; the count is not.
		expect(status?.errorCount).toBe(37);
	});

	it("repairs a stale-keyed invoice left behind by a raw db.patch", async () => {
		const { orgId, asUser } = await seedOrg("stale");
		const clientId = await createClientViaApi(asUser, "Stale Co");
		const invoiceId = await createInvoiceViaApi(asUser, clientId, {
			invoiceNumber: "INV-REBUILD-STALE",
			total: 900,
			status: "sent",
		});

		expect(
			await t.run((ctx) =>
				invoiceRevenueAggregate.sum(ctx, { namespace: orgId, bounds: { prefix: ["sent"] } })
			)
		).toBe(900);

		// Raw patch bypasses lib/triggers.ts — the aggregate entry stays under
		// the old "sent" key even though the document is now "paid".
		await t.run((ctx) => ctx.db.patch(invoiceId, { status: "paid", paidAt: Date.now() }));

		expect(
			await t.run((ctx) =>
				invoiceRevenueAggregate.sum(ctx, { namespace: orgId, bounds: { prefix: ["sent"] } })
			)
		).toBe(900); // stale: still under the old key
		expect(
			await t.run((ctx) =>
				invoiceRevenueAggregate.sum(ctx, { namespace: orgId, bounds: { prefix: ["paid"] } })
			)
		).toBe(0);

		await runRebuild();

		expect(
			await t.run((ctx) =>
				invoiceRevenueAggregate.sum(ctx, { namespace: orgId, bounds: { prefix: ["sent"] } })
			)
		).toBe(0);
		expect(
			await t.run((ctx) =>
				invoiceRevenueAggregate.sum(ctx, { namespace: orgId, bounds: { prefix: ["paid"] } })
			)
		).toBe(900);
	});

	it("drops a phantom entry left behind by a raw db.delete", async () => {
		const { orgId, asUser } = await seedOrg("phantom");
		const clientId = await createClientViaApi(asUser, "Phantom Co");
		await createInvoiceViaApi(asUser, clientId, {
			invoiceNumber: "INV-REBUILD-KEEP",
			total: 100,
			status: "sent",
		});
		const deleteId = await createInvoiceViaApi(asUser, clientId, {
			invoiceNumber: "INV-REBUILD-DELETE",
			total: 200,
			status: "sent",
		});

		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(2);

		// Raw delete bypasses the trigger — the aggregate entry survives as a phantom.
		await t.run((ctx) => ctx.db.delete(deleteId));

		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(2);

		await runRebuild();

		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(1);
		expect(
			await t.run((ctx) => invoiceRevenueAggregate.sum(ctx, { namespace: orgId }))
		).toBe(100);
	});

	it("is idempotent — running the chain twice does not double-count", async () => {
		const { orgId, asUser } = await seedOrg("idempotent");
		const clientId = await createClientViaApi(asUser, "Idempotent Co");
		await asUser.mutation(api.projects.create, {
			clientId,
			title: "Idempotent Project",
			status: "planned",
			projectType: "one-off",
		});
		await asUser.mutation(api.quotes.create, {
			clientId,
			title: "Idempotent Quote",
			quoteNumber: "Q-REBUILD-IDEMP",
			status: "sent",
			subtotal: 500,
			taxAmount: 0,
			total: 500,
		});
		await createInvoiceViaApi(asUser, clientId, {
			invoiceNumber: "INV-REBUILD-IDEMP",
			total: 300,
			status: "sent",
		});

		await runRebuild();
		await runRebuild();

		expect(await t.run((ctx) => clientCountsAggregate.count(ctx, { namespace: orgId }))).toBe(1);
		expect(await t.run((ctx) => projectCountsAggregate.count(ctx, { namespace: orgId }))).toBe(1);
		expect(await t.run((ctx) => quoteCountsAggregate.count(ctx, { namespace: orgId }))).toBe(1);
		expect(await t.run((ctx) => quoteCountsAggregate.sum(ctx, { namespace: orgId }))).toBe(500);
		expect(await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }))).toBe(1);
		expect(await t.run((ctx) => invoiceRevenueAggregate.sum(ctx, { namespace: orgId }))).toBe(300);
	});

	it("pause stops the chain mid-flight; resume finishes it", async () => {
		const { orgId, asUser } = await seedOrg("pause");
		const clientId = await createClientViaApi(asUser, "Pause Co");
		await createInvoiceViaApi(asUser, clientId, {
			invoiceNumber: "INV-REBUILD-PAUSE",
			total: 400,
			status: "sent",
		});

		// Pause before the chain's first batch runs (mutations run synchronously;
		// only the scheduler.runAfter callback is deferred).
		await t.mutation(internal.migrations.rebuildAggregates.startAggregateRebuild, {});
		await t.mutation(internal.migrations.rebuildAggregates.pauseAggregateRebuild, {});
		// Draining now only runs the already-queued batch, which no-ops because
		// status is "paused" — it must not re-arm itself.
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		let status = await t.query(internal.migrations.rebuildAggregates.aggregateRebuildStatus, {});
		expect(status?.status).toBe("paused");
		// Pause landed before the chain's first batch (which would clear the
		// invoices step) ran at all, so the trigger-seeded value is untouched.
		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(1);

		await t.mutation(internal.migrations.rebuildAggregates.resumeAggregateRebuild, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		status = await t.query(internal.migrations.rebuildAggregates.aggregateRebuildStatus, {});
		expect(status?.status).toBe("done");
		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(1);
		expect(
			await t.run((ctx) => invoiceRevenueAggregate.sum(ctx, { namespace: orgId }))
		).toBe(400);
	});

	it("paginates past the batch size", async () => {
		const { orgId } = await seedOrg("paged");

		// Raw inserts: no trigger, so nothing is seeded and the rebuild has to
		// walk every page itself. 250 rows = 3 batches at BATCH_SIZE 100.
		await t.run(async (ctx) => {
			for (let i = 0; i < 250; i++) {
				await ctx.db.insert("clients", {
					orgId,
					companyName: `Paged Co ${i}`,
					status: "active",
				});
			}
		});

		expect(
			await t.run((ctx) => clientCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(0);

		await runRebuild();

		expect(
			await t.run((ctx) => clientCountsAggregate.count(ctx, { namespace: orgId }))
		).toBe(250);
		const status = await t.query(
			internal.migrations.rebuildAggregates.aggregateRebuildStatus,
			{}
		);
		expect(status?.status).toBe("done");
		expect(status?.processed).toBe(250);
	});

	it("keeps each org's rebuilt aggregate isolated", async () => {
		const orgA = await seedOrg("tenantA");
		const orgB = await seedOrg("tenantB");

		const clientA = await createClientViaApi(orgA.asUser, "Tenant A Co");
		const clientB = await createClientViaApi(orgB.asUser, "Tenant B Co");

		await createInvoiceViaApi(orgA.asUser, clientA, {
			invoiceNumber: "INV-REBUILD-A",
			total: 111,
			status: "sent",
		});
		await createInvoiceViaApi(orgB.asUser, clientB, {
			invoiceNumber: "INV-REBUILD-B1",
			total: 222,
			status: "sent",
		});
		await createInvoiceViaApi(orgB.asUser, clientB, {
			invoiceNumber: "INV-REBUILD-B2",
			total: 333,
			status: "sent",
		});

		await runRebuild();

		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgA.orgId }))
		).toBe(1);
		expect(
			await t.run((ctx) => invoiceRevenueAggregate.sum(ctx, { namespace: orgA.orgId }))
		).toBe(111);
		expect(
			await t.run((ctx) => invoiceCountsAggregate.count(ctx, { namespace: orgB.orgId }))
		).toBe(2);
		expect(
			await t.run((ctx) => invoiceRevenueAggregate.sum(ctx, { namespace: orgB.orgId }))
		).toBe(555);
		expect(
			await t.run((ctx) => clientCountsAggregate.count(ctx, { namespace: orgA.orgId }))
		).toBe(1);
		expect(
			await t.run((ctx) => clientCountsAggregate.count(ctx, { namespace: orgB.orgId }))
		).toBe(1);
	});
});
