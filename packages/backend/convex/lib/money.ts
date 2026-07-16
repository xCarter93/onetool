/**
 * Canonical money math for OneTool.
 *
 * UNIT CONVENTION: every stored monetary amount is DOLLARS (numeric, may be
 * fractional). Cents exist ONLY at the Stripe API boundary — convert with
 * dollarsToCents/centsToDollars at the call that talks to Stripe, never
 * earlier. Persisting cents, or dividing a stored amount by 100 for display,
 * is always a bug.
 *
 * All new money computation belongs here. Do not re-implement rounding,
 * summation, tax, or discount math inline.
 */

/**
 * Dollars → integer cents with decimal-safe half-cent handling. `x * 100`
 * carries binary representation error (1.005 * 100 === 100.49999999999999),
 * which would make half-cent values round down or up depending on the value;
 * fixing the representation first makes them all round half-up.
 */
function toCents(dollars: number): number {
	return Math.round(Number((dollars * 100).toFixed(4)));
}

/** Round a dollar amount to the nearest cent (half-cents round up). */
export function roundCents(dollars: number): number {
	return toCents(dollars) / 100;
}

/**
 * Sum dollar amounts in integer cents to avoid IEEE-754 drift on long
 * line-item lists (0.1 + 0.2 style errors never accumulate).
 */
export function sumMoney(values: number[]): number {
	const cents = values.reduce((acc, value) => acc + toCents(value), 0);
	return cents / 100;
}

/** Dollars → integer cents. The ONLY sanctioned Stripe-bound conversion. */
export function dollarsToCents(dollars: number): number {
	return toCents(dollars);
}

/** Integer cents (from Stripe) → dollars. */
export function centsToDollars(cents: number): number {
	return cents / 100;
}

/** Line-item amount: quantity × unit price, rounded to cents. */
export function calculateLineItemAmount(
	quantity: number,
	unitPrice: number
): number {
	return roundCents(quantity * unitPrice);
}

/** Tax on a subtotal. `taxRate` is a percentage (e.g. 8.25 = 8.25%). */
export function calculateTax(subtotal: number, taxRate: number): number {
	return roundCents(subtotal * (taxRate / 100));
}

/**
 * Apply a discount to an amount. `discount` is a percentage (0–100) when
 * `isPercentage`, otherwise dollars. Result is cent-rounded, floored at 0.
 */
export function applyDiscount(
	amount: number,
	discount: number,
	isPercentage: boolean
): number {
	if (isPercentage) {
		return Math.max(0, roundCents(amount * (1 - discount / 100)));
	}
	return Math.max(0, roundCents(amount - discount));
}

export interface QuoteTotalsInput {
	/** Per-line `amount` values (dollars). */
	lineAmounts: number[];
	discountEnabled?: boolean;
	/** Percent (0–100) when discountType is "percentage", else dollars. */
	discountAmount?: number;
	discountType?: "percentage" | "fixed";
	taxEnabled?: boolean;
	/** Percentage, e.g. 8.25. */
	taxRate?: number;
}

/**
 * Quote roll-up: subtotal → discount → tax → total. Pure; the single source
 * of truth for quote totals (workspace get, portal, list views, stored-total
 * sync all delegate here).
 */
export function computeQuoteTotals(input: QuoteTotalsInput): {
	subtotal: number;
	taxAmount: number;
	total: number;
} {
	const subtotal = sumMoney(input.lineAmounts);

	let discountedSubtotal = subtotal;
	if (input.discountEnabled && input.discountAmount) {
		discountedSubtotal = applyDiscount(
			subtotal,
			input.discountAmount,
			input.discountType === "percentage"
		);
	}

	let taxAmount = 0;
	if (input.taxEnabled && input.taxRate) {
		taxAmount = calculateTax(discountedSubtotal, input.taxRate);
	}

	return {
		subtotal,
		taxAmount,
		total: roundCents(discountedSubtotal + taxAmount),
	};
}

export interface InvoiceTotalsInput {
	/** Per-line `total` values (dollars). */
	lineTotals: number[];
	/** Dollars (invoices store the discount pre-converted, unlike quotes). */
	discountAmount?: number;
	/** Dollars (invoices store the tax pre-computed, unlike quotes). */
	taxAmount?: number;
}

/**
 * Invoice roll-up: subtotal − discount + tax, cent-rounded. The single source
 * of truth shared by invoice queries, payment-sum validation, and stored-total
 * sync so the displayed total and the enforced total can never diverge.
 */
export function computeInvoiceTotals(input: InvoiceTotalsInput): {
	subtotal: number;
	total: number;
} {
	const subtotal = sumMoney(input.lineTotals);
	// Floor at 0 like applyDiscount — a stale dollar discount larger than the
	// remaining line items must not persist (and bill) a negative total.
	const discounted = Math.max(0, subtotal - (input.discountAmount ?? 0));
	return { subtotal, total: roundCents(discounted + (input.taxAmount ?? 0)) };
}

/** Format a dollar amount for backend-generated text (notifications, errors). */
export function formatCurrency(dollars: number, currency = "USD"): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(dollars);
}
