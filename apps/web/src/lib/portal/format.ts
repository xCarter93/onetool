export function formatMoney(amount: number): string {
	return amount.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

export function formatDate(ts?: number): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
