import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Activity, Briefcase } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import type { SelectionTab } from "@/lib/selection-context";

// "Select an item" empty state for the landscape detail pane. Intentional product
// copy, NOT a fallback — NEVER auto-select the first list item. Copy is VERBATIM
// and locked (UI-SPEC Copywriting Contract).

const GLYPH: Record<SelectionTab, typeof Activity> = {
	work: Briefcase,
	activity: Activity,
};

export function DetailPlaceholder({ context }: { context: SelectionTab }) {
	const t = useTokens();
	const Glyph = GLYPH[context];

	return (
		<View style={styles.root}>
			<View style={[styles.tile, { backgroundColor: t.secondary }]}>
				<Glyph size={34} color={t.sub} strokeWidth={2} />
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
		gap: 12,
		padding: 40,
	},
	tile: {
		width: 72,
		height: 72,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 2,
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
