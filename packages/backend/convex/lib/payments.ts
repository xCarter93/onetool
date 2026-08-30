// Shared mark-paid cascade. Single canonical writer for both
// markPaidByPublicTokenInternal (confirm path) and
// markPaidFromPaymentIntentWebhookInternal (webhook path). NOT a mutation —
// plain async helper that runs inside the caller's mutation context, so no
// nested ctx.runMutation between internal mutations.
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { grantMeterBonus } from "./entitlements";
// Deliberate cycle with lib/invoiceTransitions.ts — see the note there.
import { transitionInvoice } from "./invoiceTransitions";
import { kickQboSyncWorker, maybeEnqueueQboSync } from "./quickbooksEnqueue";

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
};

async function checkAllPaymentsPaid(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">,
	currentPaymentId: Id<"payments">,
): Promise<boolean> {
	const all = await ctx.db
		.query("payments")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();
	return all.every(
		(p) => p._id === currentPaymentId || p.status === "paid",
	);
}

/**
 * Mark the invoice paid when every installment row has flipped to paid.
 * Lives here (rather than payments.ts) so the cascade helper has no upward
 * import dependency.
 */
export async function updateInvoiceStatusIfFullyPaid(
	ctx: MutationCtx,
	invoiceId: Id<"invoices">,
	paymentId: Id<"payments">,
): Promise<void> {
	const allPaid = await checkAllPaymentsPaid(ctx, invoiceId, paymentId);
	if (!allPaid) return;
	const invoice = await ctx.db.get(invoiceId);
	if (!invoice) return;
	await transitionInvoice(ctx, invoice, "paid", {
		actor: "system",
		source: "payments.applyMarkPaidCascade",
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
		await ctx.db.patch(p._id, {
			status: "paid",
			paidAt: now,
			recordedOutsidePortal: true,
			// Drop any stale in-flight Stripe cache so the portal can't resume a
			// mint against a now-settled row.
			pendingPaymentIntentId: undefined,
			pendingPaymentIntentClientSecret: undefined,
			pendingPaymentIntentExpiresAt: undefined,
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
	// Idempotent — re-firing on an already-paid row is a webhook replay.
	if (payment.status === "paid") {
		return payment._id;
	}

	// A Stripe collection this month grants +10 document sends, once per
	// period. Runs before the early return above can re-trigger it, and the
	// once guard makes a second collection in the same month a no-op.
	await grantMeterBonus(ctx, payment.orgId, "clientSends", 10, { once: true });

	const patch: Partial<Doc<"payments">> = {
		status: "paid",
		paidAt: Date.now(),
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
	await updateInvoiceStatusIfFullyPaid(ctx, payment.invoiceId, payment._id);
	// QuickBooks: the settled installment becomes a QBO Payment (PRD §6.3).
	await maybeEnqueueQboSync(ctx, payment.orgId, "payment", payment._id);
	return payment._id;
}
