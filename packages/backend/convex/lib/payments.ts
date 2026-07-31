// Shared mark-paid cascade. Single canonical writer for both
// markPaidByPublicTokenInternal (confirm path) and
// markPaidFromPaymentIntentWebhookInternal (webhook path). NOT a mutation —
// plain async helper that runs inside the caller's mutation context, so no
// nested ctx.runMutation between internal mutations.
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

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
	if (invoice && invoice.status !== "paid") {
		await ctx.db.patch(invoiceId, {
			status: "paid",
			paidAt: Date.now(),
		});
	}
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
	return payment._id;
}
