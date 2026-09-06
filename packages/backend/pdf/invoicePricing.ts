/**
 * Canonical home of the invoice pricing-mode predicate and the display math.
 * Deliberately pure (imports only `convex/lib/money`) so every invoice surface
 * — record page, sidebar, portal paper, mobile, PDF (rendered server-side
 * through pdfActions.ts), and the server roll-up in
 * `convex/lib/invoiceTotals.ts` — reads discount/tax through the same code and
 * lands on the same cents the server stored.
 *
 * LEGACY  — none of discountEnabled/discountType/taxEnabled/taxRate is set.
 *           discountAmount/taxAmount are pre-computed DOLLARS.
 * QUOTE   — any of them is set. discountAmount is a PERCENT when discountType
 *           is "percentage", otherwise dollars; taxAmount is derived and kept
 *           in sync server-side, so it is always dollars.
 */

import { applyDiscount, roundCents } from "../convex/lib/money";

export type InvoicePricingMode = "legacy" | "quote";

/** The pricing-bearing subset of an invoice. Money values are DOLLARS. */
export interface InvoicePricingFields {
	subtotal: number;
	discountEnabled?: boolean | null;
	discountAmount?: number | null;
	discountType?: "percentage" | "fixed" | null;
	taxEnabled?: boolean | null;
	taxRate?: number | null;
	taxAmount?: number | null;
	total: number;
}

export interface InvoiceDisplayPricing {
	mode: InvoicePricingMode;
	/** Discount in dollars, already resolved from percent when applicable. */
	discountDollars: number;
	/** True when the discount row should render at all. */
	showDiscount: boolean;
	/** Row label, e.g. "Discount" or "Discount (10%)". */
	discountLabel: string;
	taxDollars: number;
	showTax: boolean;
	taxLabel: string;
}

/** Any quote-style field present means quote-style pricing; legacy rows have none. */
export function resolveInvoicePricingMode(
	invoice: Pick<
		InvoicePricingFields,
		"discountEnabled" | "discountType" | "taxEnabled" | "taxRate"
	>
): InvoicePricingMode {
	return invoice.discountEnabled != null ||
		invoice.discountType != null ||
		invoice.taxEnabled != null ||
		invoice.taxRate != null
		? "quote"
		: "legacy";
}

/** Percent formatting that keeps whole rates clean ("10%", not "10.00%"). */
function formatRate(rate: number): string {
	return `${Number.parseFloat(rate.toFixed(3))}%`;
}

/**
 * Resolve the discount/tax a surface should print, in dollars, for either mode.
 * Never persists anything — display only.
 */
export function deriveInvoiceDisplayPricing(
	invoice: InvoicePricingFields
): InvoiceDisplayPricing {
	const mode = resolveInvoicePricingMode(invoice);
	const subtotal = invoice.subtotal ?? 0;
	const rawDiscount = invoice.discountAmount ?? 0;
	const taxAmount = invoice.taxAmount ?? 0;

	if (mode === "legacy") {
		return {
			mode,
			discountDollars: rawDiscount,
			showDiscount: rawDiscount > 0,
			discountLabel: "Discount",
			taxDollars: taxAmount,
			showTax: taxAmount > 0,
			taxLabel: "Tax",
		};
	}

	const discountActive = invoice.discountEnabled === true && rawDiscount > 0;
	const isPercent = invoice.discountType === "percentage";
	// A percentage discount must be the cent-rounded gap the server actually
	// applied (applyDiscount rounds the DISCOUNTED subtotal, not the discount),
	// or the printed rows fail to reconcile with the stored total by a cent.
	const discountDollars = discountActive
		? isPercent
			? roundCents(subtotal - applyDiscount(subtotal, rawDiscount, true))
			: rawDiscount
		: 0;

	const taxRate = invoice.taxRate ?? 0;
	const taxActive = invoice.taxEnabled === true && taxAmount > 0;

	return {
		mode,
		discountDollars,
		showDiscount: discountActive && discountDollars > 0,
		discountLabel:
			discountActive && isPercent
				? `Discount (${formatRate(rawDiscount)})`
				: "Discount",
		taxDollars: taxActive ? taxAmount : 0,
		showTax: taxActive,
		taxLabel: taxActive && taxRate > 0 ? `Tax (${formatRate(taxRate)})` : "Tax",
	};
}

/**
 * Seed the inline pricing panel for a legacy invoice: the stored dollar
 * discount as a "fixed" amount, and a tax RATE reverse-computed from the stored
 * dollar taxAmount so the first save reproduces the same numbers under
 * quote-style math. Dev-only convenience — prod has no legacy invoice data.
 */
export function legacyTaxRateFromAmounts(
	subtotal: number,
	discountDollars: number,
	taxAmount: number
): number {
	const afterDiscount = subtotal - discountDollars;
	if (afterDiscount <= 0 || taxAmount <= 0) return 0;
	// 1e-6 percent keeps enough precision to reproduce the stored cents;
	// 3 decimals lost a penny on rates like 6.1725%.
	return Math.round((taxAmount / afterDiscount) * 100 * 1e6) / 1e6;
}
