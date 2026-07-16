/**
 * Canonical money formatting for the web app.
 *
 * UNIT CONVENTION: every monetary value from the Convex backend is DOLLARS
 * (numeric, may be fractional). Never divide or multiply a displayed amount
 * by 100 — cents exist only at the Stripe API boundary (use dollarsToCents
 * there). Do not define local formatCurrency/formatMoney helpers; import from
 * here (enforced by ESLint).
 *
 * Display policy: record-level amounts (quote/invoice/line-item/payment
 * totals, balances) show exact cents. Aggregate stats, tiles, and chart axes
 * may use { whole: true } or { compact: true }.
 */

const centsFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

const wholeFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	notation: "compact",
	maximumFractionDigits: 1,
});

export interface FormatCurrencyOptions {
	/** Round to whole dollars (stat tiles, summaries). */
	whole?: boolean;
	/** Compact notation, e.g. $1.2K (chart axes, dense stats). */
	compact?: boolean;
}

/** Format a dollar amount. Defaults to exact cents ($1,234.50). */
export function formatCurrency(
	dollars: number,
	options?: FormatCurrencyOptions
): string {
	if (options?.compact) return compactFormatter.format(dollars);
	if (options?.whole) return wholeFormatter.format(dollars);
	return centsFormatter.format(dollars);
}

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
 * Parse user-typed currency input ("$1,234.50" → 1234.5). Strips currency
 * symbols/commas, cent-rounds; returns 0 for empty or unparseable input.
 */
export function parseCurrencyInput(raw: string): number {
	const parsed = parseFloat(raw.replace(/[$,\s]/g, ""));
	if (!Number.isFinite(parsed)) return 0;
	return roundCents(parsed);
}

/** Dollars → integer cents. The ONLY sanctioned Stripe-bound conversion. */
export function dollarsToCents(dollars: number): number {
	return toCents(dollars);
}
