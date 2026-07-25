import React from "react";
import {
	type DimensionValue,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { radii, shadow, tokens, useTokens } from "@/lib/theme";

// Reusable iPad scrim + centered card wrapper for overlays (Notifications,
// org-switch, assistant). When `maxHeight` is given it becomes a DEFINITE card
// height so the overlay's flex:1 body resolves (an auto-height parent collapses
// flex:1 to 0); without it the card stays content-sized.

interface CenteredModalProps {
	children: React.ReactNode;
	onScrimPress?: () => void;
	maxHeight?: DimensionValue;
}

export function CenteredModal({
	children,
	onScrimPress,
	maxHeight,
}: CenteredModalProps) {
	const t = useTokens();

	return (
		<View style={styles.root}>
			<Pressable
				style={StyleSheet.absoluteFill}
				onPress={onScrimPress}
				disabled={!onScrimPress}
				accessibilityRole={onScrimPress ? "button" : undefined}
				accessibilityLabel={onScrimPress ? "Dismiss" : undefined}
			/>
			<View
				style={[
					styles.card,
					{ backgroundColor: t.card },
					// Definite height (not just a cap) so flex:1 bodies fill the card.
					maxHeight !== undefined ? { height: maxHeight } : null,
				]}
			>
				{children}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		// Scrim derived from the ink token rather than a one-off navy.
		backgroundColor: `${tokens.ink}6B`,
		padding: 24,
	},
	card: {
		width: "100%",
		maxWidth: 520,
		borderRadius: radii.sheet,
		overflow: "hidden",
		// A modal genuinely floats, so it keeps its shadow while cards went flat.
		boxShadow: shadow.lg,
	},
});
