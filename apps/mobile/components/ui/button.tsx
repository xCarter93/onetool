import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { fontFamily, radii, shadow, touch, type, useTokens } from "@/lib/theme";

type ButtonVariant = "primary" | "solid" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

interface ButtonProps {
	title: string;
	onPress?: () => void;
	/**
	 * `primary` is the frosted-blue treatment shared with web (pre-composited
	 * sky tint + soft blue ring). `solid` is the opaque blue fill — reserve it for the
	 * one element per screen that must out-shout everything, or for buttons on a
	 * dark/photographic ground where a tint would vanish.
	 */
	variant?: ButtonVariant;
	/** `sm` is for inline row actions; it gets hitSlop to stay tappable. */
	size?: ButtonSize;
	icon?: React.ReactNode;
	disabled?: boolean;
	style?: ViewStyle | ViewStyle[];
}

export function Button({
	title,
	onPress,
	variant = "primary",
	size = "md",
	icon,
	disabled,
	style,
}: ButtonProps) {
	const t = useTokens();

	const fill = (pressed: boolean): ViewStyle => {
		switch (variant) {
			case "primary":
				// The tint step alone is a 1.05:1 delta — imperceptible. The border
				// does the perceptible work on press. Frosted is ALWAYS the opaque
				// pre-composited tint: alpha fills over scrolling content ghost
				// through on device (the old `blurred` glass path).
				return {
					backgroundColor: pressed ? t.frostedBgPressed : t.frostedBg,
					borderWidth: 1,
					borderColor: pressed ? t.primaryInk : t.frostedBorder,
					boxShadow: shadow.xs,
				};
			case "solid":
				return { backgroundColor: t.primarySolid };
			case "secondary":
				return {
					backgroundColor: t.card,
					borderWidth: 1,
					borderColor: t.line,
				};
			default:
				return { backgroundColor: "transparent" };
		}
	};

	const textColor =
		variant === "solid"
			? "#ffffff"
			: variant === "secondary"
				? t.ink
				: t.frostedInk;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: !!disabled }}
			onPress={disabled ? undefined : onPress}
			disabled={disabled}
			hitSlop={size === "sm" ? 8 : undefined}
			style={({ pressed }) => [
				styles.base,
				size === "sm" ? styles.sm : styles.md,
				fill(pressed && !disabled),
				disabled && styles.disabled,
				style,
			]}
		>
			<View style={styles.content}>
				{icon}
				<Text
					style={[
						styles.title,
						{
							color: textColor,
							fontSize: size === "sm" ? type.rowTitle : type.body,
						},
					]}
					numberOfLines={1}
				>
					{title}
				</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	base: {
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	md: {
		minHeight: touch.min,
		paddingVertical: 12,
		paddingHorizontal: 16,
	},
	sm: {
		paddingVertical: 8,
		paddingHorizontal: 14,
	},
	content: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	title: {
		fontFamily: fontFamily.semibold,
	},
	disabled: {
		opacity: 0.5,
	},
});
