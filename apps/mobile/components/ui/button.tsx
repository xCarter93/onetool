import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

type ButtonVariant = "primary" | "solid" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

interface ButtonProps {
	title: string;
	onPress?: () => void;
	/**
	 * `primary` (default) and `solid` are the same opaque-blue fill — web parity
	 * moved the default button to solid, so this is the main CTA per screen.
	 * `secondary` is the outline treatment, `ghost`/`destructive` are borderless.
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
			case "solid":
				return {
					backgroundColor: pressed ? t.primarySolidPressed : t.primarySolid,
				};
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
		variant === "primary" || variant === "solid"
			? "#ffffff"
			: variant === "secondary"
				? t.ink
				: variant === "destructive"
					? t.destructive
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
