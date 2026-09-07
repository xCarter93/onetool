/**
 * QuickBooks sync enqueue hook (PRD §6.3).
 *
 * Called from the mutations that already own each write path. O(1) no-op when
 * the org has no live QBO connection, so unconnected orgs pay one indexed read.
 *
 * Takes an explicit orgId because some call sites (the Stripe webhook payment
 * cascade) run in a system mutation with no ctx.orgId.
 */

import { v } from "convex/values";
import { internalQuery, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export type QboEntityType = "client" | "invoice" | "payment" | "sku" | "refund";

/** Intuit caps requestid at 50 chars; a Convex id is 32, so the token stays short. */
export function mintQboOperationId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Inverse link lookup: which local record already owns this QBO entity, if any. */
export const getEntityLinkByQboId = internalQuery({
	args: {
		orgId: v.id("organizations"),
		entityType: v.union(
			v.literal("client"),
			v.literal("invoice"),
			v.literal("payment"),
			v.literal("sku"),
			v.literal("refund")
		),
		qboId: v.string(),
	},
	handler: async (
		ctx,
		args
	): Promise<{ link: Doc<"quickbooksEntityLinks">; label: string } | null> => {
		const link = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_qbo", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("qboId", args.qboId)
			)
			.first();
		if (!link) return null;
		const clientId =
			args.entityType === "client"
				? ctx.db.normalizeId("clients", link.localId)
				: null;
		const client = clientId ? await ctx.db.get(clientId) : null;
		const label =
			client && client.orgId === args.orgId ? client.companyName : link.localId;
		return { link, label };
	},
});
export type QboOperation = "upsert" | "void";

type Eligibility =
	| { eligible: false; supersedesQueuedCreate?: boolean }
	| { eligible: true; operation: QboOperation };

const UPSERT: Eligibility = { eligible: true, operation: "upsert" };
const VOID: Eligibility = { eligible: true, operation: "void" };
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
			if (link) return VOID;
			// A create still in flight can link the invoice after this commits,
			// so a void queues behind it (the worker no-ops if no link appears).
			const inFlight = await ctx.db
				.query("quickbooksSyncJobs")
				.withIndex("by_org_dedupe", (q) =>
					q
						.eq("orgId", orgId)
						.eq("dedupeKey", `invoice:${localId}`)
						.eq("status", "processing")
				)
				.first();
			return inFlight ? VOID : { eligible: false, supersedesQueuedCreate: true };
		}
		if (link) return UPSERT;
		if (invoice.status === "draft" && connection.syncInvoicesOn === "sent") {
			return INELIGIBLE;
		}
		return UPSERT;
	}

	if (!connection.syncPayments) return INELIGIBLE;
	if (entityType === "refund") {
		const refund = await ctx.db
			.query("stripeRefunds")
			.withIndex("by_org_refund", (q) =>
				q.eq("orgId", orgId).eq("refundId", localId)
			)
			.unique();
		return refund?.status === "succeeded" ? UPSERT : INELIGIBLE;
	}
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
	const dedupeKey = `${entityType}:${localId}`;
	if (!eligibility.eligible) {
		if (eligibility.supersedesQueuedCreate) {
			await ignoreQueuedCreate(ctx, orgId, dedupeKey);
		}
		return false;
	}
	const operation = eligibility.operation;

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
		operationId: mintQboOperationId(),
	});

	if (connection.status === "connected" && (opts?.kick ?? true)) {
		await ctx.scheduler.runAfter(0, internal.quickbooksActions.processOrgJobs, {
			orgId,
		});
	}
	return true;
}

/** A queued first export of an invoice that was cancelled before it ran. */
async function ignoreQueuedCreate(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	dedupeKey: string
): Promise<void> {
	const pending = await ctx.db
		.query("quickbooksSyncJobs")
		.withIndex("by_org_dedupe", (q) =>
			q.eq("orgId", orgId).eq("dedupeKey", dedupeKey).eq("status", "pending")
		)
		.collect();
	for (const job of pending) {
		if (job.operation !== "upsert") continue;
		await ctx.db.patch(job._id, {
			status: "ignored",
			lastError: "Superseded: the invoice was cancelled before it reached QuickBooks",
		});
	}
}

/**
 * A refund Stripe later failed or cancelled: drop its queued receipt. One
 * already posted has no automatic reversal yet — the link is flagged so the
 * error center can show it.
 */
export async function retractQboRefund(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	refundId: string
): Promise<void> {
	const pending = await ctx.db
		.query("quickbooksSyncJobs")
		.withIndex("by_org_dedupe", (q) =>
			q
				.eq("orgId", orgId)
				.eq("dedupeKey", `refund:${refundId}`)
				.eq("status", "pending")
		)
		.collect();
	for (const job of pending) {
		await ctx.db.patch(job._id, {
			status: "ignored",
			lastError: "Superseded: Stripe reported the refund failed",
		});
	}
	const link = await ctx.db
		.query("quickbooksEntityLinks")
		.withIndex("by_org_entity", (q) =>
			q.eq("orgId", orgId).eq("entityType", "refund").eq("localId", refundId)
		)
		.first();
	if (link) {
		await ctx.db.patch(link._id, {
			syncWarning:
				"Stripe reported this refund failed after it was recorded in QuickBooks; delete the refund receipt there",
		});
		console.error(
			`[QuickBooks] refund ${refundId} failed on Stripe after RefundReceipt ${link.qboId} was posted; manual reversal needed`
		);
	}
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
