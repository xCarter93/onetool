import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { internalMutation } from "../lib/triggers";
import {
	clientSearchText,
	contactSearchText,
	propertySearchText,
	projectSearchText,
	quoteSearchText,
	invoiceSearchText,
	taskSearchText,
} from "../lib/searchText";

/**
 * Populate `searchText` on every row that predates the search indexes.
 *
 * lib/triggers.ts keeps the digest correct going forward; rows written before
 * it simply have no digest and are invisible to search.ts. Unlike the
 * aggregate rebuild there is nothing to clear or fence beyond stale scheduler
 * chains — recomputing a digest is idempotent, and rows already correct are
 * skipped without a write.
 *
 * The walk runs as a chain of self-scheduling batches (BATCH_SIZE rows,
 * BATCH_DELAY_MS apart) driven by a `backfillState` row, so it survives
 * transaction limits and can be stopped mid-flight.
 *
 * Ops (all internal — run from the dashboard's Functions tab):
 *   1. migrations/backfillSearchText:startSearchTextBackfill
 *   2. migrations/backfillSearchText:searchTextBackfillStatus  — poll progress
 *   3. migrations/backfillSearchText:pauseSearchTextBackfill / resume…
 */

const JOB_NAME = "searchText";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;
const MAX_RECORDED_ERRORS = 20;

/** Ordered steps; `step` in backfillState indexes into this. */
const STEPS = [
	"clients",
	"clientContacts",
	"clientProperties",
	"projects",
	"quotes",
	"invoices",
	"tasks",
] as const;
type Step = (typeof STEPS)[number];

type PageResult = {
	count: number;
	written: number;
	isDone: boolean;
	continueCursor: string;
};

function loadState(ctx: QueryCtx) {
	return ctx.db
		.query("backfillState")
		.withIndex("by_name", (q) => q.eq("name", JOB_NAME))
		.unique();
}

/** Per-step digest builder, keyed so the switch below stays exhaustive. */
const DIGEST_BUILDERS = {
	clients: clientSearchText,
	clientContacts: contactSearchText,
	clientProperties: propertySearchText,
	projects: projectSearchText,
	quotes: quoteSearchText,
	invoices: invoiceSearchText,
	tasks: taskSearchText,
} satisfies {
	[K in Step]: (doc: Doc<K>) => string;
};

/** Recompute one page's digests, writing only the rows that actually differ. */
async function backfillPage<K extends Step>(
	ctx: MutationCtx,
	step: K,
	cursor: string | null,
	errors: string[]
): Promise<PageResult> {
	let written = 0;
	const build = DIGEST_BUILDERS[step] as (doc: Doc<K>) => string;
	// db.patch is typed per concrete table; this walk is generic over Step, so
	// the one write site needs a widened signature.
	const patchDigest = ctx.db.patch as unknown as (
		id: Id<Step>,
		value: { searchText: string }
	) => Promise<void>;

	const page = await ctx.db
		.query(step)
		.paginate({ numItems: BATCH_SIZE, cursor });

	for (const doc of page.page as Doc<K>[]) {
		try {
			const searchText = build(doc);
			// House rule: never spend a write on a row that is already correct.
			if (doc.searchText === searchText) continue;
			await patchDigest(doc._id, { searchText });
			written++;
		} catch (error) {
			const message = `Failed to backfill ${step} ${doc._id}: ${error}`;
			console.error(message);
			if (errors.length < MAX_RECORDED_ERRORS) errors.push(message);
		}
	}

	return {
		count: page.page.length,
		written,
		isDone: page.isDone,
		continueCursor: page.continueCursor,
	};
}

/** Walk every searchable table and fill in missing/stale digests. */
export const startSearchTextBackfill = internalMutation({
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
			prepared: true, // no per-step prep work for this job
			processed: 0,
			written: 0,
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
			internal.migrations.backfillSearchText.searchTextBackfillBatch,
			{ generation }
		);

		return { generation, steps: STEPS.length };
	},
});

/** One batch of the chain. Re-arms itself until every step is done. */
export const searchTextBackfillBatch = internalMutation({
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

		const errors = [...state.errors];
		const page = await backfillPage(ctx, step, state.cursor, errors);

		const nextStep = page.isDone ? state.step + 1 : state.step;
		const finished = nextStep >= STEPS.length;

		await ctx.db.patch(state._id, {
			step: nextStep,
			cursor: page.isDone ? null : page.continueCursor,
			processed: state.processed + page.count,
			written: (state.written ?? 0) + page.written,
			errors,
			status: finished ? "done" : "running",
			updatedAt: Date.now(),
		});

		if (finished) {
			console.log(
				`searchText backfill complete: ${state.processed + page.count} rows read, ` +
					`${(state.written ?? 0) + page.written} written, ${errors.length} errors`
			);
			return;
		}

		await ctx.scheduler.runAfter(
			BATCH_DELAY_MS,
			internal.migrations.backfillSearchText.searchTextBackfillBatch,
			{ generation }
		);
	},
});

/** Stop the chain after the in-flight batch; state keeps its cursor. */
export const pauseSearchTextBackfill = internalMutation({
	args: {},
	handler: async (ctx): Promise<{ paused: boolean }> => {
		const state = await loadState(ctx);
		if (!state || state.status !== "running") return { paused: false };
		await ctx.db.patch(state._id, {
			status: "paused",
			updatedAt: Date.now(),
		});
		return { paused: true };
	},
});

/** Re-arm a paused chain at the cursor it stopped on. */
export const resumeSearchTextBackfill = internalMutation({
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
			internal.migrations.backfillSearchText.searchTextBackfillBatch,
			{ generation }
		);

		return { resumed: true, generation };
	},
});

export const searchTextBackfillStatus = internalQuery({
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
			written: state.written ?? 0,
			errors: state.errors,
			startedAt: state.startedAt,
			updatedAt: state.updatedAt,
		};
	},
});
