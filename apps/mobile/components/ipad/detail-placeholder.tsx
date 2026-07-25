import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import type { SelectionTab } from "@/lib/selection-context";
import { Illustration } from "@/components/illustrations";

// "Select an item" empty state for the landscape detail pane. Intentional product
// copy, NOT a fallback — NEVER auto-select the first list item. Copy is VERBATIM
// and locked (UI-SPEC Copywriting Contract).

export function DetailPlaceholder({ context: _context }: { context: SelectionTab }) {
	const t = useTokens();

	return (
		<View style={styles.root}>
			{/* Generous width: this pane is ~60% of the screen in landscape. */}
			<Illustration
				name="select-conversation"
				knockout={t.bg}
				width={280}
				style={styles.art}
			/>
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
		gap: 12,
		padding: 40,
	},
	art: {
		marginBottom: 6,
	},
	heading: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h2,
	},
	body: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
		textAlign: "center",
		maxWidth: 280,
	},
});
