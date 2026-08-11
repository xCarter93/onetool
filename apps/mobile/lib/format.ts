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

// Year-less date — "Jun 9". For metadata that sits in a narrow column next to a
// money figure (Money hub attention/payment rows), where the year is noise.
export function formatShortDate(ts: number): string {
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/**
 * "Today" / "Yesterday" / "4d ago" inside the last week, short date beyond it.
 * `now` is passed in, never read here — react-hooks/purity forbids Date.now()
 * during render, so screens seed it once with a lazy useState.
 */
export function formatRelativeDay(ts: number, now: number): string {
	const startOfDay = (ms: number) => {
		const d = new Date(ms);
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	};
	const days = Math.round(
		(startOfDay(now) - startOfDay(ts)) / (24 * 60 * 60 * 1000),
	);
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days}d ago`;
	return formatShortDate(ts);
}
