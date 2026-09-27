import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { Badge } from "@/components/ui";
import { ParentLinks, type ParentLink } from "@/components/canvas";
import { MoneyAmount } from "./money-amount";

// Identity block for quote/invoice details (frame 1d + 2d's large total):
// number eyebrow + status badge, the document-grade amount, the title, then
// the client and project as links. Extra rows (stepper, signature
// card, tray actions in pane mode) compose in as children.
export function DocumentHeaderCard({
	eyebrow,
	status,
	title,
	amount,
	clientName,
	onClientPress,
	project,
	subline,
	menu,
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
	/** The linked project, shown after the client. */
	project?: { title: string; onPress?: () => void };
	/** Small line under the client link (e.g. overdue notice, valid-until). */
	subline?: ReactNode;
	/** Overflow menu, placed after the status badge. */
	menu?: ReactNode;
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
				{menu ? <View style={styles.menu}>{menu}</View> : null}
			</View>
			<View style={styles.amountWrap}>
				<MoneyAmount amount={amount} size={40} />
			</View>
			{title ? (
				<Text style={[styles.title, { color: t.ink }]} numberOfLines={2}>
					{title}
				</Text>
			) : null}
			<View style={styles.parents}>
				<ParentLinks
					links={[
						{ kind: "client", label: clientName, onPress: onClientPress },
						...(project
							? [{ kind: "project", label: project.title, onPress: project.onPress } satisfies ParentLink]
							: []),
					]}
				/>
			</View>
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
	// Keeps the 44pt target from pushing the amount down past the badge row.
	menu: { marginVertical: -8 },
	amountWrap: {
		marginTop: 10,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginTop: 8,
	},
	parents: {
		marginTop: 8,
	},
});
