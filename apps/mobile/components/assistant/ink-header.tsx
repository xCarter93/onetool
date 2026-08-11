import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import { dock, fontFamily, hero, radii, type } from "@/lib/theme";

// Ink-lite band above the assistant chat. Shared by all three surfaces so the
// pushed sheet, the iPad centered modal and the landscape companion panel read
// as one thing: hero.ink ground, a very low-alpha echo of the dock orb's
// gradient, Sparkles + title. Deliberately short — the chat owns the screen.

export function AssistantInkHeader({
	/** Sheet presentations get the drag handle; docked panels don't. */
	grabber,
	/** Trailing slot — the panel's close button. */
	right,
}: {
	grabber?: boolean;
	right?: React.ReactNode;
}) {
	return (
		<View style={styles.band}>
			{/* Orb-gradient glow, barely there — the ink stays the ground. */}
			<LinearGradient
				colors={[`${dock.orbGradient[0]}26`, `${dock.orbGradient[1]}00`]}
				start={{ x: 0.85, y: 0 }}
				end={{ x: 0.15, y: 1 }}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>
			{grabber ? <View style={styles.grabber} /> : null}
			<View style={styles.row}>
				<Sparkles size={18} color={hero.text} strokeWidth={2.2} />
				<Text style={styles.title}>Assistant</Text>
				<View style={styles.spacer} />
				{right}
			</View>
		</View>
	);
}

/** Text tier for a header-slot glyph on the ink band (e.g. the close X). */
export const inkHeaderGlyph = hero.textMid;

const styles = StyleSheet.create({
	band: {
		backgroundColor: hero.ink,
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 12,
		overflow: "hidden",
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: radii.xs,
		backgroundColor: hero.textSub,
		marginBottom: 10,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		minHeight: 28,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		color: hero.text,
	},
	spacer: {
		flex: 1,
	},
});
