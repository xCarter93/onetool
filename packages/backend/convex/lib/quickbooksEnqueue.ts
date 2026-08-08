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

export type QboEntityType = "client" | "invoice" | "payment";

/**
 * Decide whether this entity is currently sync-eligible.
 *
 * The hook has no "what just happened" parameter on purpose: current state is
 * enough. An invoice that already has a QBO link always re-syncs (edits must
 * propagate); an unlinked draft only syncs when the org opted into
 * `syncInvoicesOn: "created"`. Payments sync once settled, when the toggle is on.
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
): Promise<boolean> {
	if (entityType === "client") return true;

	if (entityType === "invoice") {
		const invoiceId = ctx.db.normalizeId("invoices", localId);
		if (!invoiceId) return false;
		const invoice = await ctx.db.get(invoiceId);
		if (!invoice || invoice.orgId !== orgId) return false;
		const link = await ctx.db
			.query("quickbooksEntityLinks")
			.withIndex("by_org_entity", (q) =>
				q.eq("orgId", orgId).eq("entityType", "invoice").eq("localId", localId)
			)
			.first();
		if (link) return true;
		if (invoice.status === "draft" && connection.syncInvoicesOn === "sent") {
			return false;
		}
		return true;
	}

	if (!connection.syncPayments) return false;
	const paymentId = ctx.db.normalizeId("payments", localId);
	if (!paymentId) return false;
	const payment = await ctx.db.get(paymentId);
	if (!payment || payment.orgId !== orgId) return false;
	return payment.status === "paid";
}

/**
 * Queue an entity for QBO sync and kick the worker. Safe to call
 * unconditionally: duplicate pending jobs collapse on dedupeKey, and jobs are
 * enqueued even when account setup is incomplete (the worker holds them rather
 * than dropping the write).
 */
export async function maybeEnqueueQboSync(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	entityType: QboEntityType,
	localId: string
): Promise<void> {
	const connection = await ctx.db
		.query("quickbooksConnections")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.first();
	if (!connection || connection.status !== "connected") return;

	if (!(await isEligible(ctx, connection, orgId, entityType, localId))) {
		return;
	}

	const dedupeKey = `${entityType}:${localId}`;
	const existing = await ctx.db
		.query("quickbooksSyncJobs")
		.withIndex("by_org_dedupe", (q) =>
			q.eq("orgId", orgId).eq("dedupeKey", dedupeKey).eq("status", "pending")
		)
		.first();
	if (existing) return;

	await ctx.db.insert("quickbooksSyncJobs", {
		orgId,
		entityType,
		localId,
		operation: "upsert",
		status: "pending",
		attempts: 0,
		runAfter: Date.now(),
		dedupeKey,
	});

	await ctx.scheduler.runAfter(0, internal.quickbooksActions.processOrgJobs, {
		orgId,
	});
}
