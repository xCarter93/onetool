// Implements: INV-01, INV-02, INV-03 (revised). Filled by Plans 15-02 + 15-03.
// SCAFFOLDING ONLY — not behavioral coverage. Plans 02-05 fill these in with real bodies.
import { describe, it } from "vitest";

describe("portal.invoices", () => {
	it.todo(
		"list: returns invoices for the session's clientContact filtered to non-draft non-cancelled status",
	);
	it.todo(
		"list: excludes invoices whose orgId does not match the session.orgId (cross-tenant lockdown)",
	);
	it.todo(
		"list: each row includes paymentSummary with totalPaid, totalRemaining, displayStatus derivations",
	);
	it.todo(
		"list: displayStatus = overdue when Date.now() > invoice.dueDate AND totalRemaining > 0 AND status !== cancelled",
	);
	it.todo(
		"list: returns PortalInvoiceListItemPublic DTO — never raw payment rows with pendingPaymentIntentClientSecret or stripePaymentIntentId",
	);
	it.todo(
		"get: returns invoice + line items + all payments rows (PortalPaymentPublic DTOs) in sortOrder + paymentSummary",
	);
	it.todo(
		"get: rejects with FORBIDDEN when clientContact does not own the invoice",
	);
	it.todo(
		"get: masquerades draft and cancelled invoices as NOT_FOUND (existence-leak prevention)",
	);
	it.todo(
		"get: legacy single-token invoice (zero payments rows) returns isLegacy: true at response top level, payments: [], activePaymentPublic: null — NO synthetic payment row",
	);
	it.todo(
		"getDownloadUrl: returns null when no document exists; never throws on missing PDF",
	);
	it.todo(
		"getDownloadUrl: rejects a document whose orgId matches another tenant even if entityId/documentType match (cross-org pinned-doc guard)",
	);
	it.todo(
		"createPaymentIntent: mints PI on connected account with idempotency key acct-pi-{paymentId}-{attemptId}",
	);
	it.todo(
		"createPaymentIntent: increments checkoutAttemptCounter ONLY on successful mint (Pitfall 7) — transient failure leaves counter unchanged",
	);
	it.todo(
		"createPaymentIntent: reuses cached PI when status === requires_payment_method AND now < pendingExpiresAt - 60s buffer",
	);
	it.todo(
		"createPaymentIntent: mints fresh PI when cached pi.status !== requires_payment_method (covers processing/succeeded/canceled/requires_action — Pitfall 5)",
	);
	it.todo(
		"createPaymentIntent: throws PAYMENTS_NOT_ENABLED when org.stripeChargesEnabled !== true",
	);
	it.todo(
		"createPaymentIntent: legacy invoice (zero payments rows) throws LEGACY_INVOICE_NOT_PAYABLE — server backstop only; UI must never reach this state",
	);
});
