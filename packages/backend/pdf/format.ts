/**
 * Currency formatting for the shared PDF templates. Mirrors the exact-cents
 * default of the web canonical formatter (apps/web/src/lib/money.ts) — the
 * templates only ever render record-level amounts, so the whole/compact
 * variants are deliberately absent. Amounts are DOLLARS.
 */
const centsFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

export function formatCurrency(dollars: number): string {
	return centsFormatter.format(dollars);
}
