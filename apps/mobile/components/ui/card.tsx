import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { radii, shadow, useTokens } from "@/lib/theme";

interface CardProps {
	children: React.ReactNode;
	style?: ViewStyle | ViewStyle[];
	onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
	const t = useTokens();
	const baseStyle: ViewStyle = {
		backgroundColor: t.card,
		borderRadius: radii.rLg,
		borderWidth: 1,
		borderColor: t.line,
		boxShadow: shadow.card,
		padding: 18,
	};

	if (onPress) {
		return (
			<Pressable
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
		opacity: 0.85,
	},
});
