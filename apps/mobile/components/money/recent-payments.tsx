import { StyleSheet, Text, View } from "react-native";
import { Wallet } from "lucide-react-native";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { Panel, RecordRow } from "@/components/canvas";
import { formatCurrency, formatRelativeDay } from "@/lib/format";

// Shape comes from the query itself — see needs-attention.tsx.
type Payment = FunctionReturnType<
	typeof api.businessHealth.get
>["recentPayments"][number];

function methodLabel(method: string | undefined): string | null {
	if (!method) return null;
	if (method === "card") return "Card";
	return method.charAt(0).toUpperCase() + method.slice(1);
}

/**
 * "Payments" tab of the Money hub — money that actually landed, newest first
 * (backend caps it at five). Rows open the invoice the payment settled.
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
	/** iPad master-detail: marks the row whose invoice the detail pane shows.
	 * Two payments on one invoice both mark. */
	selected?: { kind: "quote" | "invoice"; id: string } | null;
	onOpen: (payment: Payment) => void;
}) {
	const t = useTokens();

	if (payments.length === 0) {
		return (
			<Panel>
				<View style={styles.clear}>
					<Wallet size={17} color={t.sub} />
					<Text style={[styles.clearText, { color: t.sub }]}>
						No payments recorded yet.
					</Text>
				</View>
			</Panel>
		);
	}

	return (
		<Panel>
			{payments.map((payment) => {
				const label = methodLabel(payment.method);
				const subtitle = label
					? `${formatRelativeDay(payment.paidAt, now)} · ${label}`
					: formatRelativeDay(payment.paidAt, now);
				return (
					<RecordRow
						key={payment.id}
						kind="invoice"
						title={payment.clientName}
						subtitle={subtitle}
						chevron={false}
						selected={
							selected?.kind === "invoice" && selected.id === payment.invoiceId
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
		</Panel>
	);
}

const styles = StyleSheet.create({
	amount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},
	clear: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	clearText: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.regular,
		fontSize: type.rowTitle,
	},
});
