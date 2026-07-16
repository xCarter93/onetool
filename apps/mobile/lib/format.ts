// Amounts are stored as DOLLARS (CLAUDE.md) — format as-is, never /100.
const wholeCurrency = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

const exactCurrency = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

// Default = whole dollars (stat tiles); { exact: true } = cents ("$1,234.50")
// for record-level amounts (line items, totals, payments).
export function formatCurrency(
	amount: number,
	options?: { exact?: boolean },
): string {
	return (options?.exact ? exactCurrency : wholeCurrency).format(amount);
}

// Shared document date — "Jun 9, 2026". Matches projects/[projectId] formatDate
// verbatim so list rows + both detail screens (23-03/23-04) render dates identically.
export function formatDocumentDate(ts: number): string {
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
