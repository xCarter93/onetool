import { StyleSheet, Text, View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, recordTint, type, useTokens } from "@/lib/theme";
import { ListRow } from "@/components/ui";
import { formatCurrency, formatRelativeDay } from "@/lib/format";

// Shape comes from the query itself — see needs-attention.tsx.
type Payment = FunctionReturnType<
	typeof api.businessHealth.get
>["recentPayments"][number];

// Payment method → the glyph the record-payment sheet already uses for it, so
// the same money reads the same way in both places. Unknown manual strings fall
// through to the row's neutral banknote.
const METHOD_ICON = {
	card: "CreditCard",
	cash: "Banknote",
	check: "Landmark",
} as const;

function methodLabel(method: string | undefined): string | null {
	if (!method) return null;
	if (method === "card") return "Card";
	return method.charAt(0).toUpperCase() + method.slice(1);
}

/**
 * "Recent payments" — money that actually landed, newest first (backend caps it
 * at five). Rows open the invoice the payment settled.
 */
export function RecentPayments({
	payments,
	now,
	selected = null,
	onOpen,
}: {
	payments: Payment[];
	/** Seeded once by the screen — Date.now() during render is a lint error. */
	now: number;
	/** iPad master-detail: marks the row whose invoice the detail pane shows,
	 * same contract as NeedsAttention. Two payments on one invoice both mark. */
	selected?: { kind: "quote" | "invoice"; id: string } | null;
	onOpen: (payment: Payment) => void;
}) {
	const t = useTokens();

	return (
		<View>
			{payments.map((payment, i) => {
				const label = methodLabel(payment.method);
				const icon =
					payment.method && payment.method in METHOD_ICON
						? METHOD_ICON[payment.method as keyof typeof METHOD_ICON]
						: "Banknote";
				return (
					<ListRow
						key={payment.id}
						icon={icon}
						iconColor={recordTint.invoice.fg}
						iconBg={recordTint.invoice.bg}
						title={payment.clientName}
						sub={
							label
								? `${formatRelativeDay(payment.paidAt, now)} · ${label}`
								: formatRelativeDay(payment.paidAt, now)
						}
						last={i === payments.length - 1}
						selected={
							selected?.kind === "invoice" &&
							selected.id === payment.invoiceId
						}
						right={
							<Text style={[styles.amount, { color: t.success }]}>
								{formatCurrency(payment.amount, { exact: true })}
							</Text>
						}
						onPress={() => onOpen(payment)}
					/>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	amount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},
});
