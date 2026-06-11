import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Folder, Receipt, Users } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";

// "Select an item" empty state for the landscape detail pane. Intentional product
// copy, NOT a fallback — NEVER auto-select the first list item. Copy is VERBATIM
// and locked (UI-SPEC Copywriting Contract).

interface DetailPlaceholderProps {
	tab: "clients" | "projects" | "money";
}

const GLYPH = {
	clients: Users,
	projects: Folder,
	money: Receipt,
} as const;

export function DetailPlaceholder({ tab }: DetailPlaceholderProps) {
	const t = useTokens();
	const Glyph = GLYPH[tab];

	return (
		<View style={styles.root}>
			<View style={[styles.tile, { backgroundColor: t.accentSoft }]}>
				<Glyph size={38} color={t.accent} />
			</View>
			<Text style={[styles.heading, { color: t.ink }]}>Select an item</Text>
			<Text style={[styles.body, { color: t.sub }]}>
				Choose from the list to see full details here.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		padding: 40,
	},
	tile: {
		width: 84,
		height: 84,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
	},
	heading: {
		fontFamily: fontFamily.semibold,
		fontSize: 18,
	},
	body: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
		textAlign: "center",
		maxWidth: 280,
	},
});
