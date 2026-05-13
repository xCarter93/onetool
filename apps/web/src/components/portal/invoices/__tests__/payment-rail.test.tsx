// @vitest-environment jsdom
// Implements: INV-03 (revised) frontend. Filled by Plan 15-04.
// SCAFFOLDING ONLY — not behavioral coverage. Plans 02-05 fill these in with real bodies.
import { describe, it } from "vitest";

describe("PaymentRail", () => {
	it.todo(
		"PI is NOT minted on rail mount — only on explicit user intent (Pay-click on desktop, sheet-open on mobile)",
	);
	it.todo(
		"Elements provider receives stripeAccount via loadStripe(pk, { stripeAccount }), NOT via <Elements options> (Pitfall 3)",
	);
	it.todo(
		"calls stripe.confirmPayment with redirect: 'if_required' (stay-on-page semantics)",
	);
	it.todo(
		"calls stripe.confirmPayment with confirmParams.return_url containing ?pi={Stripe PI id} (not Convex payment row id)",
	);
	it.todo(
		"renders ExpressCheckoutElement above PaymentElement with 'or pay with card' divider in between",
	);
	it.todo(
		"Pay button label is 'Pay {amount}' (matches 15-UI-SPEC copywriting contract); shows spinner while submitting",
	);
	it.todo(
		"does NOT mark payment row paid client-side — only sets transient 'Processing...' hint until Convex subscription flips the row",
	);
	it.todo(
		"Stripe Appearance API receives concrete hex/rgb values resolved from theme tokens (no var(--...) and no oklch() strings)",
	);
});
