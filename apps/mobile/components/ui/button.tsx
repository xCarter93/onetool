import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps {
	title: string;
	onPress?: () => void;
	variant?: ButtonVariant;
	icon?: React.ReactNode;
	disabled?: boolean;
	style?: ViewStyle | ViewStyle[];
}

export function Button({
	title,
	onPress,
	variant = "primary",
	icon,
	disabled,
	style,
}: ButtonProps) {
	const t = useTokens();

	const variantStyle: ViewStyle =
		variant === "primary"
			? { backgroundColor: t.accent }
			: variant === "secondary"
				? { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }
				: { backgroundColor: "transparent" };

	const textColor =
		variant === "primary" ? "#ffffff" : variant === "secondary" ? t.ink : t.accent;

	return (
		<Pressable
			onPress={disabled ? undefined : onPress}
			disabled={disabled}
			style={({ pressed }) => [
				styles.base,
				variantStyle,
				pressed && !disabled && styles.pressed,
				disabled && styles.disabled,
				style,
			]}
		>
			<View style={styles.content}>
				{icon}
				<Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
					{title}
				</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	base: {
		borderRadius: radii.r,
		paddingVertical: 12,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	pressed: {
		opacity: 0.85,
	},
	disabled: {
		opacity: 0.5,
	},
});
