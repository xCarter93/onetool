// Shared mark-paid cascade. Single canonical writer for both
// markPaidByPublicTokenInternal (confirm path) and
// markPaidFromPaymentIntentWebhookInternal (webhook path). NOT a mutation —
// plain async helper that runs inside the caller's mutation context, so no
// nested ctx.runMutation between internal mutations.
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { grantMeterBonus } from "./entitlements";
// Deliberate cycle with lib/invoiceTransitions.ts — see the note there.
import { transitionInvoice } from "./invoiceTransitions";
import { centsToDollars, formatCurrency, roundCents } from "./money";
import { refundedAmountOf, remainingBalance } from "./paymentInsights";
import {
	kickQboSyncWorker,
	maybeEnqueueQboSync,
	retractQboRefund,
} from "./quickbooksEnqueue";

type ReceiptMetadata = {
	cardBrand?: string;
	cardLast4?: string;
	stripeReceiptUrl?: string;
};

type ApplyMarkPaidCascadeArgs = {
	paymentId: Id<"payments">;
	stripePaymentIntentId: string;
	source: "confirm" | "webhook" | "webhook-pi";
	stripeSessionId?: string;
	receiptMetadata?: ReceiptMetadata;
	/** Dollars Stripe actually collected, when the caller knows. */
	amountReceived?: number;
};

export async function findPaymentAttempt(
	ctx: MutationCtx,
	orgId: Id<"organizations">,
	paymentIntentId: string,
): Promise<Doc<"stripePaymentAttempts"> | null> {
	return await ctx.db
		.query("stripePaymentAttempts")
		.withIndex("by_org_payment_intent", (q) =>
			q.eq("orgId", orgId).eq("paymentIntentId", paymentIntentId),
		)
		.unique();
}

/** True when deleting the row would orphan a Stripe money reference. */
export async function hasStripeReference(
	ctx: MutationCtx,
	payment: Doc<"payments">,
): Promise<boolean> {
	if (
		payment.pendingPaymentIntentId ||
		payment.stripePaymentIntentId ||
		(payment.unappliedStripePaymentIntentIds?.length ?? 0) > 0
	) {
		return true;
	}
	const attempt = await ctx.db
		.query("stripePaymentAttempts")
		.withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
		.first();
	return attempt !== null;
}

/**
 * Drop the row's live PaymentIntent and retire it on Stripe. Clearing the
 * local cache alone leaves the client secret chargeable, so every edit that
 * changes what the installment is worth, or settles it another way, calls this.
 */
export async function releasePendingPaymentIntent(
	ctx: MutationCtx,
	payment: Doc<"payments">,
): Promise<void> {
	const paymentIntentId = payment.pendingPaymentIntentId;
	if (!paymentIntentId) return;
	await ctx.db.patch(payment._id, {
		pendingPaymentIntentId: undefined,
		pendingPaymentIntentClientSecret: undefined,
		pendingPaymentIntentExpiresAt: undefined,
	});
	const attempt = await findPaymentAttempt(ctx, payment.orgId, paymentIntentId);
	if (attempt?.status === "open") {
		await ctx.db.patch(attempt._id, {
			status: "canceled",
			resolvedAt: Date.now(),
		});
	}
	const stripeAccountId =
		attempt?.stripeAccountId ??
		(await ctx.db.get(payment.orgId))?.stripeConnectAccountId;
	if (!stripeAccountId) return;
	await ctx.scheduler.runAfter(
		0,
		internal.stripePaymentIntentActions.cancelPaymentIntent,
		{ stripeAccountId, paymentIntentId },
	);
}

/**
 * Stripe collected money this row cannot absorb: it was already paid (by
 * another intent or by hand), cancelled, or its amount changed after the
 * intent was minted. Keep the evidence instead of acking it away.
 */
export async function recordUnappliedPaymentIntent(
	ctx: MutationCtx,
	payment: Doc<"payments">,
	paymentIntentId: string,
	amountReceived: number | undefined,
): Promise<void> {
	const ids = payment.unappliedStripePaymentIntentIds ?? [];
	if (ids.includes(paymentIntentId)) return;
	const now = Date.now();
	await ctx.db.patch(payment._id, {
		unappliedStripePaymentIntentIds: [...ids, paymentIntentId],
		// A cache still pointing at this intent would report "succeeded" to the
		// portal forever; drop it so a correct intent can be minted.
		...(payment.pendingPaymentIntentId === paymentIntentId
			? {
					pendingPaymentIntentId: undefined,
					pendingPaymentIntentClientSecret: undefined,
					pendingPaymentIntentExpiresAt: undefined,
				}
			: {}),
	});
	const attempt = await findPaymentAttempt(ctx, payment.orgId, paymentIntentId);
	if (attempt) {
		await ctx.db.patch(attempt._id, {
			status: "succeeded",
			outcome: "unapplied",
			amountReceived,
			resolvedAt: now,
		});
	} else {
		const org = await ctx.db.get(payment.orgId);
		await ctx.db.insert("stripePaymentAttempts", {
			orgId: payment.orgId,
			paymentId: payment._id,
			invoiceId: payment.invoiceId,
			stripeAccountId: org?.stripeConnectAccountId,
			paymentIntentId,
			amount: amountReceived ?? payment.paymentAmount,
			status: "succeeded",
			outcome: "unapplied",
			amountReceived,
			createdAt: now,
			resolvedAt: now,
		});
	}
	console.error(
		`Stripe PaymentIntent ${paymentIntentId} succeeded for payment ${payment._id} ` +
			`(status=${payment.status}) but could not be applied` +
			(amountReceived !== undefined ? ` (${formatCurrency(amountReceived)} received)` : "") +
			`. Refund or re-bill; see stripePaymentAttempts.`,
	);
	const invoice = await ctx.db.get(payment.invoiceId);
	await ctx.runMutation(
		internal.notifications.createWebhookNotificationInternal,
		{
			orgId: payment.orgId,
			type: "payment_unapplied",
			paymentId: payment._id,
			priority: "high",
			message:
				`A Stripe payment of ${formatCurrency(amountReceived ?? payment.paymentAmount)} ` +
				`for invoice ${invoice?.invoiceNumber ?? "(unknown)"} (${paymentIntentId}) ` +
				`arrived after the invoice was already settled and needs review.`,
		},
	);
}

export type ChargeRefundSnapshot = {
	refundedAt: number;
	/** Every refund Stripe knows on the charge, in cents. */
	refunds: { id: string; amountCents: number; status: string }[];
};

/**
 * Record a charge's refunds on its settled payment row. Totals are derived
 * per refund id — failed, canceled, and already-reverted refunds never count —
 * so an out-of-date charge.refunded cannot re-add money a later event undid.
 * Only ever raises the recorded refund; reversals go through the failure path.
 */
export async function applyChargeRefund(
	ctx: MutationCtx,
	paymentId: Id<"payments">,
	snapshot: ChargeRefundSnapshot,
): Promise<void> {
	const payment = await ctx.db.get(paymentId);
	if (!payment) return;
	await recordStripeRefunds(ctx, payment, snapshot.refunds);
	const reverted = new Set(payment.revertedRefundIds ?? []);
	const standingCents = snapshot.refunds
		.filter(
			(r) =>
				r.status !== "failed" && r.status !== "canceled" && !reverted.has(r.id),
		)
		.reduce((sum, r) => sum + r.amountCents, 0);
	const alreadyRefunded = refundedAmountOf(payment);
	const refundedAmount = roundCents(centsToDollars(standingCents));
	if (refundedAmount <= alreadyRefunded) return;

	const fully = refundedAmount >= roundCents(payment.paymentAmount);
	await ctx.db.patch(payment._id, {
		refundedAmount,
		refundedAt: snapshot.refundedAt,
		...(fully ? { status: "refunded" as const } : {}),
	});

	// An invoice is paid iff its balance is zero, so a refund that reopens a
	// balance sends it back to sent — and emits, so dunning can pick it up.
	await reconcileInvoiceSettlement(
		ctx,
		payment.invoiceId,
		"stripeWebhookActions.charge.refunded",
	);

	const invoice = await ctx.db.get(payment.invoiceId);
	const thisRefund = roundCents(refundedAmount - alreadyRefunded);
	const stillCollected = roundCents(payment.paymentAmount - refundedAmount);
	await ctx.runMutation(
		internal.notifications.createWebhookNotificationInternal,
		{
			orgId: payment.orgId,
			type: "charge_refunded",
			paymentId: payment._id,
			priority: "normal",
			message:
				`${formatCurrency(thisRefund)} was refunded on invoice ` +
				`${invoice?.invoiceNumber ?? "(unknown)"}. ` +
				(fully
					? "That payment no longer counts as collected."
					: `${formatCurrency(stillCollected)} of that payment still counts as collected.`),
		},
	);
}

export type StripeRefundState = { id: string; amountCents: number; status: string };

/**
 * Keep the per-refund ledger current. A refund newly reported as succeeded
 * becomes a QuickBooks RefundReceipt job; one that later fails or is cancelled
 * retracts it. Idempotent per refund id and status, so redeliveries are no-ops.
 */
export async function recordStripeRefunds(
	ctx: MutationCtx,
	payment: Doc<"payments">,
	refunds: StripeRefundState[],
): Promise<void> {
	let enqueued = false;
	for (const refund of refunds) {
		const existing = await ctx.db
			.query("stripeRefunds")
			.withIndex("by_org_refund", (q) =>
				q.eq("orgId", payment.orgId).eq("refundId", refund.id),
			)
			.unique();
		if (existing?.status === refund.status) continue;
		const retracted = refund.status === "failed" || refund.status === "canceled";
		// A failure for a refund never recorded here has nothing to retract.
		if (!existing && retracted) continue;
		if (existing) {
			await ctx.db.patch(existing._id, { status: refund.status });
		} else {
			await ctx.db.insert("stripeRefunds", {
				orgId: payment.orgId,
				paymentId: payment._id,
				invoiceId: payment.invoiceId,
				refundId: refund.id,
				amount: roundCents(centsToDollars(refund.amountCents)),
				status: refund.status,
				createdAt: Date.now(),
			});
		}
		if (refund.status === "succeeded") {
			const queued = await maybeEnqueueQboSync(
				ctx,
				payment.orgId,
				"refund",
				refund.id,
				{ kick: false },
			);
			enqueued = enqueued || queued;
		} else if (retracted) {
			await retractQboRefund(ctx, payment.orgId, refund.id);
		}
	}
	if (enqueued) await kickQboSyncWorker(ctx, payment.orgId);
}

/** Refund events that arrived before this intent's success; replay them in order. */
async function replayParkedRefundEvents(
	ctx: MutationCtx,
	paymentId: Id<"payments">,
	paymentIntentId: string,
): Promise<void> {
	const parked = await ctx.db
		.query("stripeWebhookEvents")
		.withIndex("by_payment_intent_status", (q) =>
			q.eq("paymentIntentId", paymentIntentId).eq("status", "unresolved"),
		)
		.collect();
	for (const event of parked) {
		await applyChargeRefund(ctx, paymentId, event.payload as ChargeRefundSnapshot);
		await ctx.db.patch(event._id, {
			status: "processed",
			processedAt: Date.now(),
			paymentIntentId: undefined,
			payload: undefined,
		});
	}
}

/**
 * Guarantee the invoice has something to collect against. The portal pays
 * against payment rows, so an invoice with none is view-only — dragging a draft
 * onto the Sent lane used to produce exactly that. Idempotent: an invoice that
 * already has a schedule is never touched.
 */
export async function ensureFullPaymentRow(
	ctx: MutationCtx,
	invoice: Doc<"invoices">,
): Promise<void> {
	if (invoice.total <= 0) return;
	const existing = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
		.first();
	if (existing) return;
	await ctx.db.insert("payments", {
		orgId: invoice.orgId,
		invoiceId: invoice._id,
		paymentAmount: invoice.total,
		dueDate: invoice.dueDate,
		description: "Full Payment",
		sortOrder: 0,
		status: "pending",
	});
}

/**
 * Bring an invoice's status in line with what it still owes: an invoice is paid
 * if and only if its remaining balance is zero. Both directions matter — a
 * settling installment closes it out, and a refund that reopens a balance drops
 * a paid invoice back to `sent`.
 *
 * The reverse never derives `overdue`; the org-local cron owns that flip, and
 * guessing at it here from a webhook's UTC clock would fight the sweep. Nor does
 * it create a row for a balance a refund reopened (Patrick, 2026-08-31) — the
 * owner schedules that through `configurePayments`.
 *
 * Lives here (rather than payments.ts) so the cascade helper has no upward
 * import dependency.
 */
export async function reconcileInvoiceSettlement(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">,
	source: string,
): Promise<void> {
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) return;
	const rows = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();
	// No rows means nothing has been scheduled to collect against — the invoice's
	// own status is the only signal, so leave it be.
	if (rows.length === 0) return;

	if (remainingBalance(invoice.total, rows) === 0) {
		await transitionInvoice(ctx, invoice, "paid", {
			actor: "system",
			source,
		});
		return;
	}
	if (invoice.status !== "paid") return;
	await transitionInvoice(ctx, invoice, "sent", {
		actor: "system",
		source,
		// Money coming back out is not a client send. Without this a row whose
		// firstSentAt predates metering would debit the meter, and an exhausted
		// one would throw PLAN_LIMIT_REACHED out of a Stripe webhook.
		meter: "skip",
	});
}

/**
 * Reverse of the per-payment cascade: when an invoice is marked paid by any
 * means outside the portal (e.g. cash/check via the workspace "Mark as Paid"),
 * settle every still-outstanding installment so the portal reflects it as
 * completed and never offers a Pay button on an already-paid invoice. Rows
 * settled here are tagged recordedOutsidePortal so the portal can label them.
 */
export async function settleOutstandingPaymentsForInvoice(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">,
): Promise<void> {
	const rows = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();
	const now = Date.now();
	// One worker kick for the whole batch rather than one per installment.
	let qboSyncQueued = false;
	for (const p of rows) {
		if (
			p.status === "paid" ||
			p.status === "cancelled" ||
			p.status === "refunded"
		) {
			continue;
		}
		await releasePendingPaymentIntent(ctx, p);
		await ctx.db.patch(p._id, {
			status: "paid",
			paidAt: now,
			recordedOutsidePortal: true,
			pendingCheckoutSessionId: undefined,
			pendingCheckoutSessionUrl: undefined,
			pendingCheckoutSessionExpiresAt: undefined,
		});
		if (
			await maybeEnqueueQboSync(ctx, p.orgId, "payment", p._id, {
				kick: false,
			})
		) {
			qboSyncQueued = true;
		}
	}
	if (qboSyncQueued && rows[0]) {
		await kickQboSyncWorker(ctx, rows[0].orgId);
	}
}

export async function applyMarkPaidCascade(
	ctx: MutationCtx,
	args: ApplyMarkPaidCascadeArgs,
): Promise<Id<"payments">> {
	const payment: Doc<"payments"> | null = await ctx.db.get(args.paymentId);
	if (!payment) {
		throw new Error("Payment not found");
	}
	if (
		payment.status === "paid" ||
		payment.status === "refunded" ||
		payment.status === "cancelled"
	) {
		// The intent that settled this row re-firing is a webhook replay; any
		// other intent is money the row has no room for.
		if (payment.stripePaymentIntentId !== args.stripePaymentIntentId) {
			await recordUnappliedPaymentIntent(
				ctx,
				payment,
				args.stripePaymentIntentId,
				args.amountReceived,
			);
		}
		return payment._id;
	}

	// A Stripe collection this month grants +10 document sends, once per
	// period. Runs before the early return above can re-trigger it, and the
	// once guard makes a second collection in the same month a no-op.
	await grantMeterBonus(ctx, payment.orgId, "clientSends", 10, { once: true });

	const now = Date.now();
	const patch: Partial<Doc<"payments">> = {
		status: "paid",
		paidAt: now,
		stripePaymentIntentId: args.stripePaymentIntentId,
		stripeSessionId: args.stripeSessionId ?? payment.stripeSessionId,
		pendingPaymentIntentId: undefined,
		pendingPaymentIntentClientSecret: undefined,
		pendingPaymentIntentExpiresAt: undefined,
	};
	if (args.source === "webhook-pi" && args.receiptMetadata) {
		if (args.receiptMetadata.cardBrand !== undefined) {
			patch.cardBrand = args.receiptMetadata.cardBrand;
		}
		if (args.receiptMetadata.cardLast4 !== undefined) {
			patch.cardLast4 = args.receiptMetadata.cardLast4;
		}
		if (args.receiptMetadata.stripeReceiptUrl !== undefined) {
			patch.stripeReceiptUrl = args.receiptMetadata.stripeReceiptUrl;
		}
	}

	await ctx.db.patch(payment._id, patch);
	const attempt = await findPaymentAttempt(
		ctx,
		payment.orgId,
		args.stripePaymentIntentId,
	);
	if (attempt) {
		await ctx.db.patch(attempt._id, {
			status: "succeeded",
			outcome: "recorded",
			amountReceived: args.amountReceived,
			resolvedAt: now,
		});
	}
	await reconcileInvoiceSettlement(
		ctx,
		payment.invoiceId,
		"payments.applyMarkPaidCascade",
	);
	// QuickBooks: the settled installment becomes a QBO Payment (PRD §6.3).
	await maybeEnqueueQboSync(ctx, payment.orgId, "payment", payment._id);
	await replayParkedRefundEvents(ctx, payment._id, args.stripePaymentIntentId);
	return payment._id;
}
