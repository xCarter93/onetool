import React from "react";
import {
	type DimensionValue,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { useTokens } from "@/lib/theme";

// Reusable iPad scrim + centered card wrapper for overlays (Create / Search /
// Notifications / day-sheet / org-switch on iPad). Plan 26-05 wraps each overlay
// body in this. `maxHeight` (DEFAULT unbounded) bounds the card so long content
// scrolls within it and never clips on iPad — 26-05 depends on it; shipped here.

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
				accessibilityRole="button"
				accessibilityLabel="Dismiss"
			/>
			<View
				style={[
					styles.card,
					{ backgroundColor: t.card },
					maxHeight !== undefined ? { maxHeight } : null,
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
		backgroundColor: "rgba(11,18,32,0.42)",
		padding: 24,
	},
	card: {
		width: "100%",
		maxWidth: 520,
		borderRadius: 28,
		overflow: "hidden",
	},
});
