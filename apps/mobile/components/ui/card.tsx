import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { radii, useTokens } from "@/lib/theme";

interface CardProps {
	children: React.ReactNode;
	style?: ViewStyle | ViewStyle[];
	onPress?: () => void;
	/** Drop the inner padding — for cards that host their own padded rows. */
	flush?: boolean;
}

/**
 * Flat card: 12px radius, hairline border, no shadow. Elevation is reserved for
 * things that genuinely float (FAB, sheets) — see `shadow` in lib/theme.
 */
export function Card({ children, style, onPress, flush }: CardProps) {
	const t = useTokens();
	const baseStyle: ViewStyle = {
		backgroundColor: t.card,
		borderRadius: radii.card,
		borderWidth: 1,
		borderColor: t.line,
		padding: flush ? 0 : 14,
		overflow: flush ? "hidden" : "visible",
	};

	if (onPress) {
		return (
			<Pressable
				accessibilityRole="button"
				onPress={onPress}
				style={({ pressed }) => [baseStyle, pressed && styles.pressed, style]}
			>
				{children}
			</Pressable>
		);
	}

	return <View style={[baseStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
	pressed: {
		opacity: 0.9,
	},
});
