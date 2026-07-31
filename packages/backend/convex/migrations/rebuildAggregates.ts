import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { internalMutation } from "../lib/triggers";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
	invoiceCountsAggregate,
} from "../aggregates";

/**
 * Rebuild every aggregate from the documents table.
 *
 * lib/triggers.ts keeps aggregates correct going forward, but rows written
 * before the trigger registry can be wrong three ways: missing (never
 * inserted), phantom (row deleted, entry left behind), or stale-keyed (status
 * or paidAt patched without a matching aggregate replace). Only the first is
 * repairable by re-inserting, so each step CLEARS its aggregate before
 * reseeding — a pure insert pass would leave the other two untouched.
 *
 * The rebuild runs as a chain of self-scheduling batches (BATCH_SIZE rows,
 * BATCH_DELAY_MS apart) driven by a `backfillState` row, so it survives
 * transaction limits and can be stopped mid-flight.
 *
 * Ops (all internal — run from the dashboard's Functions tab):
 *   1. migrations/rebuildAggregates:startAggregateRebuild   — clears + rebuilds
 *   2. migrations/rebuildAggregates:aggregateRebuildStatus  — poll progress
 *   3. migrations/rebuildAggregates:pauseAggregateRebuild   — stop after the
 *      current batch; resumeAggregateRebuild picks up at the same cursor
 *
 * WARNING: aggregates read low/empty while a rebuild is in flight. Anything
 * aggregate-backed (homeStats.getHomeStats) shows depressed numbers until the
 * job reports "done"; run it during a quiet window.
 */

const JOB_NAME = "aggregates";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;
const MAX_RECORDED_ERRORS = 20;

/** Ordered rebuild steps; `step` in backfillState indexes into this. */
const STEPS = ["clients", "projects", "quotes", "invoices"] as const;
type Step = (typeof STEPS)[number];

type PageResult = {
	count: number;
	isDone: boolean;
	continueCursor: string;
};

function loadState(ctx: QueryCtx) {
	return ctx.db
		.query("backfillState")
		.withIndex("by_name", (q) => q.eq("name", JOB_NAME))
		.unique();
}

/** Drop every namespace of the step's aggregate(s) before reseeding. */
async function clearStep(ctx: MutationCtx, step: Step): Promise<void> {
	switch (step) {
		case "clients":
			await clientCountsAggregate.clearAll(ctx);
			return;
		case "projects":
			await projectCountsAggregate.clearAll(ctx);
			return;
		case "quotes":
			await quoteCountsAggregate.clearAll(ctx);
			return;
		case "invoices":
			await invoiceRevenueAggregate.clearAll(ctx);
			await invoiceCountsAggregate.clearAll(ctx);
			return;
	}
}

/**
 * Seed one page. insertIfDoesNotExist (not insert) because live writes keep
 * firing triggers during the rebuild — a row the trigger already seeded must
 * not double-count.
 */
async function seedPage(
	ctx: MutationCtx,
	step: Step,
	cursor: string | null,
	errors: string[]
): Promise<PageResult> {
	const paginateOpts = { numItems: BATCH_SIZE, cursor };

	const record = async (id: string, work: () => Promise<void>) => {
		try {
			await work();
		} catch (error) {
			const message = `Failed to seed ${step} ${id}: ${error}`;
			console.error(message);
			if (errors.length < MAX_RECORDED_ERRORS) errors.push(message);
		}
	};

	switch (step) {
		case "clients": {
			const page = await ctx.db.query("clients").paginate(paginateOpts);
			for (const doc of page.page) {
				await record(doc._id, () =>
					clientCountsAggregate.insertIfDoesNotExist(ctx, doc)
				);
			}
			return {
				count: page.page.length,
				isDone: page.isDone,
				continueCursor: page.continueCursor,
			};
		}
		case "projects": {
			const page = await ctx.db.query("projects").paginate(paginateOpts);
			for (const doc of page.page) {
				await record(doc._id, () =>
					projectCountsAggregate.insertIfDoesNotExist(ctx, doc)
				);
			}
			return {
				count: page.page.length,
				isDone: page.isDone,
				continueCursor: page.continueCursor,
			};
		}
		case "quotes": {
			const page = await ctx.db.query("quotes").paginate(paginateOpts);
			for (const doc of page.page) {
				await record(doc._id, () =>
					quoteCountsAggregate.insertIfDoesNotExist(ctx, doc)
				);
			}
			return {
				count: page.page.length,
				isDone: page.isDone,
				continueCursor: page.continueCursor,
			};
		}
		case "invoices": {
			const page = await ctx.db.query("invoices").paginate(paginateOpts);
			for (const doc of page.page) {
				await record(doc._id, async () => {
					await invoiceRevenueAggregate.insertIfDoesNotExist(ctx, doc);
					await invoiceCountsAggregate.insertIfDoesNotExist(ctx, doc);
				});
			}
			return {
				count: page.page.length,
				isDone: page.isDone,
				continueCursor: page.continueCursor,
			};
		}
	}
}

/**
 * Clear every aggregate and rebuild from scratch. Restarting mid-run is safe:
 * the new generation fences the old scheduler chain.
 */
export const startAggregateRebuild = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ generation: number; steps: number }> => {
		const now = Date.now();
		const existing = await loadState(ctx);
		const generation = (existing?.generation ?? 0) + 1;
		const fields = {
			name: JOB_NAME,
			status: "running" as const,
			generation,
			step: 0,
			cursor: null,
			prepared: false,
			processed: 0,
			errors: [],
			startedAt: now,
			updatedAt: now,
		};

		if (existing) {
			await ctx.db.patch(existing._id, fields);
		} else {
			await ctx.db.insert("backfillState", fields);
		}

		await ctx.scheduler.runAfter(
			0,
			internal.migrations.rebuildAggregates.rebuildAggregatesBatch,
			{ generation }
		);

		return { generation, steps: STEPS.length };
	},
});

/** One batch of the chain. Re-arms itself until every step is done. */
export const rebuildAggregatesBatch = internalMutation({
	args: { generation: v.number() },
	handler: async (ctx, { generation }): Promise<void> => {
		const state = await loadState(ctx);
		// Fenced (restarted) or stopped (paused/done) — let the chain die.
		if (
			!state ||
			state.generation !== generation ||
			state.status !== "running"
		) {
			return;
		}

		const step = STEPS[state.step];
		if (!step) {
			await ctx.db.patch(state._id, {
				status: "done",
				updatedAt: Date.now(),
			});
			return;
		}

		// Clear lands in its own transaction so a large tree can't blow the
		// batch that follows it.
		if (!state.prepared) {
			await clearStep(ctx, step);
			await ctx.db.patch(state._id, { prepared: true, updatedAt: Date.now() });
			await ctx.scheduler.runAfter(
				0,
				internal.migrations.rebuildAggregates.rebuildAggregatesBatch,
				{ generation }
			);
			return;
		}

		const errors = [...state.errors];
		const page = await seedPage(ctx, step, state.cursor, errors);

		const nextStep = page.isDone ? state.step + 1 : state.step;
		const finished = nextStep >= STEPS.length;

		await ctx.db.patch(state._id, {
			step: nextStep,
			cursor: page.isDone ? null : page.continueCursor,
			prepared: !page.isDone,
			processed: state.processed + page.count,
			errors,
			status: finished ? "done" : "running",
			updatedAt: Date.now(),
		});

		if (finished) {
			console.log(
				`Aggregate rebuild complete: ${state.processed + page.count} rows, ${errors.length} errors`
			);
			return;
		}

		await ctx.scheduler.runAfter(
			BATCH_DELAY_MS,
			internal.migrations.rebuildAggregates.rebuildAggregatesBatch,
			{ generation }
		);
	},
});

/** Stop the chain after the in-flight batch; state keeps its cursor. */
export const pauseAggregateRebuild = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ paused: boolean }> => {
		const state = await loadState(ctx);
		if (!state || state.status !== "running") return { paused: false };
		await ctx.db.patch(state._id, { status: "paused", updatedAt: Date.now() });
		return { paused: true };
	},
});

/** Re-arm a paused chain at the cursor it stopped on. */
export const resumeAggregateRebuild = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ resumed: boolean; generation: number }> => {
		const state = await loadState(ctx);
		if (!state || state.status !== "paused") {
			return { resumed: false, generation: state?.generation ?? 0 };
		}

		// New generation so any batch still queued from the old chain no-ops.
		const generation = state.generation + 1;
		await ctx.db.patch(state._id, {
			status: "running",
			generation,
			updatedAt: Date.now(),
		});
		await ctx.scheduler.runAfter(
			0,
			internal.migrations.rebuildAggregates.rebuildAggregatesBatch,
			{ generation }
		);

		return { resumed: true, generation };
	},
});

export const aggregateRebuildStatus = internalQuery({
	args: {},
	handler: async (ctx) => {
		const state = await loadState(ctx);
		if (!state) return null;
		return {
			status: state.status,
			generation: state.generation,
			currentStep: STEPS[state.step] ?? null,
			stepIndex: state.step,
			totalSteps: STEPS.length,
			processed: state.processed,
			errors: state.errors,
			startedAt: state.startedAt,
			updatedAt: state.updatedAt,
		};
	},
});
