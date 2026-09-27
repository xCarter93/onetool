import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { Badge } from "@/components/ui";
import { TypeTile } from "@/components/canvas";
import { MoneyAmount } from "./money-amount";

// Identity block for quote/invoice details (frame 1d + 2d's large total):
// number eyebrow + status badge, the document-grade amount, the title, then
// the client as a link with its tile icon. Extra rows (stepper, signature
// card, tray actions in pane mode) compose in as children.
export function DocumentHeaderCard({
	eyebrow,
	status,
	title,
	amount,
	clientName,
	onClientPress,
	subline,
	children,
}: {
	/** Record number, e.g. "Q-000128" / "INV-000456". */
	eyebrow?: string;
	status: string;
	title?: string;
	amount: number;
	clientName: string;
	/** Absent = plain text (no navigation target available). */
	onClientPress?: () => void;
	/** Small line under the client link (e.g. overdue notice, valid-until). */
	subline?: ReactNode;
	children?: ReactNode;
}) {
	const t = useTokens();
	return (
		<View style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}>
			<View style={styles.topRow}>
				{eyebrow ? (
					<Text style={[styles.eyebrow, { color: t.sub }]}>{eyebrow}</Text>
				) : null}
				<View style={styles.spacer} />
				<Badge status={status} big />
			</View>
			<View style={styles.amountWrap}>
				<MoneyAmount amount={amount} size={40} />
			</View>
			{title ? (
				<Text style={[styles.title, { color: t.ink }]} numberOfLines={2}>
					{title}
				</Text>
			) : null}
			<Pressable
				onPress={onClientPress}
				disabled={!onClientPress}
				accessibilityRole={onClientPress ? "button" : undefined}
				accessibilityLabel={onClientPress ? `Open ${clientName}` : undefined}
				style={({ pressed }) => [
					styles.clientRow,
					pressed && onClientPress && { opacity: 0.7 },
				]}
			>
				<TypeTile kind="client" size={20} />
				<Text
					style={[
						styles.client,
						{ color: onClientPress ? t.frostedInk : t.sub },
					]}
					numberOfLines={1}
				>
					{clientName}
				</Text>
			</Pressable>
			{subline}
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: 18,
		borderWidth: 1,
		borderRadius: 8,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
		letterSpacing: 0.96,
	},
	spacer: { flex: 1 },
	amountWrap: {
		marginTop: 10,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginTop: 8,
	},
	clientRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 8,
		alignSelf: "flex-start",
	},
	client: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
});
