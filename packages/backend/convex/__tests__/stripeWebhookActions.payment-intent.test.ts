// Implements: payment_intent.succeeded webhook case. Filled by Plan 15-03.
// SCAFFOLDING ONLY — not behavioral coverage. Plans 02-05 fill these in with real bodies.
import { describe, it } from "vitest";

describe("stripeWebhookActions: payment_intent.succeeded", () => {
	it.todo(
		"payment_intent.succeeded: extracts cardBrand, cardLast4, stripeReceiptUrl from latest_charge and persists onto the payment row",
	);
	it.todo(
		"payment_intent.succeeded: three-assertion gauntlet — publicToken match, amount_received === Math.round(paymentAmount * 100), paymentIntentId non-null",
	);
	it.todo(
		"payment_intent.succeeded: amount-tamper resistance — pi.amount_received !== Math.round(payment.paymentAmount * 100) throws and does NOT mark paid",
	);
	it.todo(
		"payment_intent.succeeded: publicToken-replay resistance — metadata.publicToken mismatch throws and does NOT mark paid",
	);
	it.todo(
		"payment_intent.succeeded: dedupes idempotently — re-firing the same event_id yields { duplicate: true } and does not double-write",
	);
	it.todo(
		"payment_intent.succeeded: clears pendingPaymentIntent* fields on the payment row on success (single canonical writer via applyMarkPaidCascade helper — no nested ctx.runMutation)",
	);
});
