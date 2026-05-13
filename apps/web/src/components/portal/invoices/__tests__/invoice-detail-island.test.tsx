// @vitest-environment jsdom
// Implements: INV-02 frontend. Filled by Plan 15-04.
// SCAFFOLDING ONLY — not behavioral coverage. Plans 02-05 fill these in with real bodies.
import { describe, it } from "vitest";

describe("InvoiceDetailIsland", () => {
	it.todo(
		"renders InvoicePaper on the left column and PaymentRail on the right at >= 768px",
	);
	it.todo(
		"renders PaymentBottomSheet (docked, z-40, data-sheet-docked) instead of PaymentRail below 768px",
	);
	it.todo(
		"route-suppresses MobileTabBar on /portal/c/{cpid}/invoices/{invoiceId} (mirror Phase 14.08 invariant)",
	);
	it.todo(
		"when totalRemaining === 0, renders PaidStatusPanel in place of PaymentRail / PaymentBottomSheet",
	);
	it.todo(
		"when org.stripeChargesEnabled !== true, hides the payment surface and renders 'Online payment not yet available' copy from 15-UI-SPEC",
	);
	it.todo(
		"when response.isLegacy === true, renders the 'Pay via your invoice email link' notice with anchor to /pay/{invoice.publicToken} — no PaymentRail, no PaymentBottomSheet, no PI mint trigger",
	);
});
