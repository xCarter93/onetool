import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";
import { Badge, Card } from "@/components/ui";
import { MoneyAmount } from "./money-amount";

// Identity block for quote/invoice details (frames 1h/1i): record-number
// eyebrow in the record's tint, client name, status chip on the trailing
// edge, then the document-grade amount. Extra rows (status track, CTA row,
// pay-link) compose in as children.
export function DocumentHeaderCard({
	eyebrow,
	eyebrowColor,
	clientName,
	status,
	title,
	amount,
	subline,
	children,
}: {
	/** Record number, e.g. "Q-000128" / "INV-000456". */
	eyebrow?: string;
	/** recordTint fg for the record type. */
	eyebrowColor: string;
	clientName: string;
	status: string;
	title?: string;
	amount: number;
	/** Small line under the amount (e.g. overdue notice, valid-until). */
	subline?: ReactNode;
	children?: ReactNode;
}) {
	const t = useTokens();
	return (
		<Card style={styles.card}>
			<View style={styles.topRow}>
				{eyebrow ? (
					<Text style={[styles.eyebrow, { color: eyebrowColor }]}>
						{eyebrow}
					</Text>
				) : null}
				<Text
					style={[styles.client, { color: t.sub }]}
					numberOfLines={1}
				>
					{clientName}
				</Text>
				<View style={styles.spacer} />
				<Badge status={status} big />
			</View>
			{title ? (
				<Text style={[styles.title, { color: t.ink }]} numberOfLines={2}>
					{title}
				</Text>
			) : null}
			<View style={styles.amountWrap}>
				<MoneyAmount amount={amount} />
			</View>
			{subline}
			{children}
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: 18,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
		textTransform: "uppercase",
	},
	client: {
		flexShrink: 1,
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	spacer: { flex: 1 },
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginTop: 8,
	},
	amountWrap: {
		marginTop: 2,
	},
});
