// The single invoice status-transition seam. Every writer that flips
// `invoices.status` goes through `transitionInvoice` so the side effects —
// send metering, settlement, activity, celebration, QuickBooks, the
// status_changed event — happen the same way regardless of who moved it
// (workspace mutation, Stripe webhook, portal cascade, automation node).
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ActivityHelpers } from "./activities";
import { celebrateInvoicePaid } from "./celebrations";
import type { FieldChange } from "./changeTracking";
import { emitStatusChangeEvent, type CascadeContext } from "../eventBus";
import {
	consumeMeter,
	entitlementsFromDocs,
	entitlementsFromIdentity,
	requireMeter,
} from "./entitlements";
import { maybeEnqueueQboSync } from "./quickbooksEnqueue";
// Deliberate import cycle with lib/payments.ts: settlement is the paid
// transition's side effect, while the mark-paid cascade is one of this seam's
// callers. Both sides are hoisted function declarations, so the cycle resolves
// at call time.
import { settleOutstandingPaymentsForInvoice } from "./payments";

type InvoiceStatus = Doc<"invoices">["status"];

/** MutationCtx as the builders hand it over: trigger-wrapped db, maybe a user. */
type TransitionCtx = MutationCtx & { user?: { _id: Id<"users"> } };

export type InvoiceTransitionOpts = {
	/**
	 * Who moved the invoice. Explicit rather than resolved from auth, so the
	 * unauthenticated paths (Stripe webhook, portal cascade, automation runs)
	 * write a real activity row instead of silently failing.
	 * "system" attributes the activity to the org owner.
	 */
	actor: { userId: Id<"users"> } | "system";
	/** eventSource on the emitted status_changed event. */
	source: string;
	/** Default true. False moves the invoice without waking automations. */
	emit?: boolean;
	/**
	 * Default "debit". "skip" moves the invoice without touching the send meter
	 * or stamping firstSentAt — for a cron that ages sent invoices to overdue.
	 */
	meter?: "debit" | "skip";
	/** Automation executor's chain, for the event bus recursion guard. */
	cascade?: CascadeContext;
	/** Default true. */
	celebrate?: boolean;
	correlationId?: string;
	/** Field-level diff carried into the activity row's metadata. */
	changes?: FieldChange[];
};

/** Timestamps the transition stamped alongside the status. */
export type InvoiceTransitionStamps = {
	firstSentAt?: number;
	paidAt?: number;
};

/**
 * Move an invoice to `newStatus` and run every side effect that belongs to
 * that move. `invoice` must already be loaded and org-checked by the caller;
 * `ctx.db` must be the trigger-wrapped one every mutation builder provides, so
 * aggregates and search digests stay correct.
 *
 * Throws when a send transition hits an exhausted clientSends meter
 * (PLAN_LIMIT_REACHED). Callers that must record a failure rather than crash
 * catch it — see the automation executor.
 */
export async function transitionInvoice(
	ctx: TransitionCtx,
	invoice: Doc<"invoices">,
	newStatus: InvoiceStatus,
	opts: InvoiceTransitionOpts
): Promise<InvoiceTransitionStamps> {
	const oldStatus = invoice.status;
	if (newStatus === oldStatus) return {};

	const now = Date.now();
	const stamps: InvoiceTransitionStamps = {};

	// ANY flip to sent or overdue IS a send (both are portal-visible and
	// payable), keyed on the immutable firstSentAt so a revert to draft can
	// never re-arm the debit.
	if (
		(newStatus === "sent" || newStatus === "overdue") &&
		opts.meter !== "skip" &&
		!invoice.firstSentAt
	) {
		const plan = ctx.user
			? (await entitlementsFromIdentity(ctx)).plan
			: entitlementsFromDocs(await ctx.db.get(invoice.orgId)).plan;
		// One timestamp so the check and the debit share a billing period.
		await requireMeter(ctx, invoice.orgId, "clientSends", plan, { now });
		await consumeMeter(ctx, invoice.orgId, "clientSends", { now });
		stamps.firstSentAt = now;
	}

	if (newStatus === "paid") {
		stamps.paidAt = now;
	}

	await ctx.db.patch(invoice._id, { status: newStatus, ...stamps });

	const updated = await ctx.db.get(invoice._id);
	if (!updated) {
		throw new Error(
			`transitionInvoice: invoice ${invoice._id} disappeared mid-transition`
		);
	}

	if (newStatus === "paid") {
		// Settle outstanding installments so the portal never offers a Pay
		// button on an invoice that is already paid.
		await settleOutstandingPaymentsForInvoice(ctx, updated._id);
	}

	const activityActor =
		opts.actor === "system"
			? await resolveSystemActor(ctx, updated.orgId)
			: { userId: opts.actor.userId, orgId: updated.orgId };

	// No actor means the org row vanished; skip rather than let createActivity
	// fall back to auth and throw out of an unauthenticated transition.
	if (activityActor && (newStatus === "paid" || newStatus === "sent")) {
		const client = await ctx.db.get(updated.clientId);
		const clientName = client?.companyName || "Unknown Client";
		if (newStatus === "paid") {
			await ActivityHelpers.invoicePaid(
				ctx,
				updated,
				clientName,
				opts.changes,
				activityActor
			);
		} else {
			await ActivityHelpers.invoiceSent(
				ctx,
				updated,
				clientName,
				opts.changes,
				activityActor
			);
		}
	}

	if (newStatus === "paid" && opts.celebrate !== false) {
		await celebrateInvoicePaid(
			ctx,
			updated,
			opts.actor === "system" ? undefined : opts.actor.userId
		);
	}

	await maybeEnqueueQboSync(ctx, updated.orgId, "invoice", updated._id);

	if (opts.emit !== false) {
		await emitStatusChangeEvent(
			ctx,
			updated.orgId,
			"invoice",
			updated._id,
			oldStatus,
			newStatus,
			opts.source,
			opts.correlationId,
			opts.cascade
		);
	}

	return stamps;
}

/** Activity attribution for the unauthenticated paths: the org owner. */
async function resolveSystemActor(
	ctx: MutationCtx,
	orgId: Id<"organizations">
): Promise<{ userId: Id<"users">; orgId: Id<"organizations"> } | undefined> {
	const org = await ctx.db.get(orgId);
	return org ? { userId: org.ownerUserId, orgId } : undefined;
}
