/**
 * QuickBooks sync enqueue hook (PRD §6.3).
 *
 * Called from the mutations that already own each write path. O(1) no-op when
 * the org has no live QBO connection, so unconnected orgs pay one indexed read.
 *
 * Takes an explicit orgId because some call sites (the Stripe webhook payment
 * cascade) run in a system mutation with no ctx.orgId.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export type QboEntityType = "client" | "invoice" | "payment" | "sku";
export type QboOperation = "upsert" | "void";

type Eligibility =
	| { eligible: false }
	| { eligible: true; operation: QboOperation };

const UPSERT: Eligibility = { eligible: true, operation: "upsert" };
const INELIGIBLE: Eligibility = { eligible: false };

/**
 * Decide whether this entity is currently sync-eligible, and with which
 * operation.
 *
 * The hook has no "what just happened" parameter on purpose: current state is
 * enough. An invoice that already has a QBO link always re-syncs (edits must
 * propagate, and a cancelled one becomes a void); an unlinked draft only syncs
 * when the org opted into `syncInvoicesOn: "created"`. Payments sync once
 * settled, when the toggle is on.
 */
async function isEligible(
	ctx: MutationCtx,
	connection: {
		syncInvoicesOn: "sent" | "created";
		syncPayments: boolean;
	},
	orgId: Id<"organizations">,
	entityType: QboEntityType,
	localId: string
): Promise<Eligibility> {
	if (entityType === "client") return UPSERT;

	// A SKU only syncs once it has a QBO Item; unlinked ones are created lazily
	// by the next invoice that references them.
	if (entityType === "sku") {
		const link = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q.eq("orgId", orgId).eq("entityType", "sku").eq("localId", localId)
			)
			.first();
		return link !== null ? UPSERT : INELIGIBLE;
	}

	if (entityType === "invoice") {
		const invoiceId = ctx.db.normalizeId("invoices", localId);
		if (!invoiceId) return INELIGIBLE;
		const invoice = await ctx.db.get(invoiceId);
		if (!invoice || invoice.orgId !== orgId) return INELIGIBLE;
		const link = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q.eq("orgId", orgId).eq("entityType", "invoice").eq("localId", localId)
			)
			.first();
		// Cancelling voids the QBO invoice; one that never reached QuickBooks
		// has nothing to void, and its last state must never be re-pushed.
		if (invoice.status === "cancelled") {
			return link ? { eligible: true, operation: "void" } : INELIGIBLE;
		}
		if (link) return UPSERT;
		if (invoice.status === "draft" && connection.syncInvoicesOn === "sent") {
			return INELIGIBLE;
		}
		return UPSERT;
	}

	if (!connection.syncPayments) return INELIGIBLE;
	const paymentId = ctx.db.normalizeId("payments", localId);
	if (!paymentId) return INELIGIBLE;
	const payment = await ctx.db.get(paymentId);
	if (!payment || payment.orgId !== orgId) return INELIGIBLE;
	return payment.status === "paid" ? UPSERT : INELIGIBLE;
}

/**
 * Queue an entity for QBO sync and kick the worker. Safe to call
 * unconditionally: duplicate pending jobs collapse on dedupeKey, and jobs are
 * enqueued even when account setup is incomplete (the worker holds them rather
 * than dropping the write). A needs_reauth connection still queues — the write
 * must survive to the reconnect — it just doesn't kick the worker.
 *
 * Returns true when a sync job is pending for the entity (inserted or already
 * queued). Bulk call sites pass `kick: false` and issue one worker kick via
 * `kickQboSyncWorker` after their loop.
 */
export async function maybeEnqueueQboSync(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	entityType: QboEntityType,
	localId: string,
	opts?: { kick?: boolean }
): Promise<boolean> {
	const connection = await ctx.db
		.query("quickbooksConnections")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.first();
	if (!connection || connection.status === "disconnected") return false;

	const eligibility = await isEligible(
		ctx,
		connection,
		orgId,
		entityType,
		localId
	);
	if (!eligibility.eligible) return false;
	const operation = eligibility.operation;

	const dedupeKey = `${entityType}:${localId}`;
	const existing = await ctx.db
		.query("quickbooksSyncJobs")
		.withIndex("by_org_dedupe", (q) =>
			q.eq("orgId", orgId).eq("dedupeKey", dedupeKey).eq("status", "pending")
		)
		.first();
	if (existing) {
		// The latest intent wins rather than stacking: a cancel supersedes a
		// queued upsert, and reactivating supersedes a queued void.
		if (existing.operation !== operation) {
			await ctx.db.patch(existing._id, { operation });
		}
		return true;
	}

	await ctx.db.insert("quickbooksSyncJobs", {
		orgId,
		entityType,
		localId,
		operation,
		status: "pending",
		attempts: 0,
		runAfter: Date.now(),
		dedupeKey,
	});

	if (connection.status === "connected" && (opts?.kick ?? true)) {
		await ctx.scheduler.runAfter(0, internal.quickbooksActions.processOrgJobs, {
			orgId,
		});
	}
	return true;
}

/** One worker kick for a batch of `kick: false` enqueues. No-op unless connected. */
export async function kickQboSyncWorker(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<void> {
	const connection = await ctx.db
		.query("quickbooksConnections")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.first();
	if (!connection || connection.status !== "connected") return;
	await ctx.scheduler.runAfter(0, internal.quickbooksActions.processOrgJobs, {
		orgId,
	});
}
