import { formatCurrency } from "@/lib/money";

/** Portal-facing alias for the shared formatter — `amount` is dollars. */
export function formatMoney(amount: number): string {
	return formatCurrency(amount);
}

export function formatDate(ts?: number | null): string {
	if (ts == null) return "—";
	return new Date(ts).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
