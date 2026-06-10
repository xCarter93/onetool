// Amounts are stored as DOLLARS (CLAUDE.md) — format as-is, no cents conversion.
export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
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
