import { ReactNode } from "react";
import { Pressable, Text, View, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { colors, spacing, radius, fontFamily } from "@/lib/theme";

/**
 * StyledButton - A consistent button component matching the web app's intent variants
 * Aligns with the web app's styled-button.tsx design language
 */

export interface StyledButtonProps {
	label?: string;
	onPress?: () => void | Promise<void>;
	intent?:
		| "primary"
		| "outline"
		| "secondary"
		| "warning"
		| "success"
		| "destructive"
		| "plain";
	size?: "sm" | "md" | "lg";
	icon?: ReactNode;
	isLoading?: boolean;
	disabled?: boolean;
	style?: ViewStyle;
	textStyle?: TextStyle;
	showArrow?: boolean;
	children?: ReactNode;
}

export function StyledButton({
	label,
	onPress,
	intent = "outline",
	size = "md",
	icon,
	isLoading = false,
	disabled = false,
	style,
	textStyle,
	showArrow = true,
	children,
}: StyledButtonProps) {
	const isDisabled = disabled || isLoading;
	const displayText = isLoading ? "Loading..." : label || children;

	// Get styles based on intent
	const intentStyles = getIntentStyles(intent);
	const sizeStyles = getSizeStyles(size);

	return (
		<Pressable
			onPress={!isDisabled ? onPress : undefined}
			disabled={isDisabled}
			style={({ pressed }) => [
				styles.base,
				intentStyles.container,
				sizeStyles.container,
				pressed && !isDisabled && styles.pressed,
				isDisabled && styles.disabled,
				style,
			]}
		>
			<View style={styles.content}>
				{isLoading && (
					<ActivityIndicator
						size="small"
						color={intentStyles.text.color}
						style={{ marginRight: spacing.xs }}
					/>
				)}
				{!isLoading && icon && (
					<View style={{ marginRight: spacing.xs }}>{icon}</View>
				)}
				<Text
					style={[
						styles.text,
						intentStyles.text,
						sizeStyles.text,
						textStyle,
					]}
				>
					{displayText}
				</Text>
				{!isLoading && showArrow && (
					<Text style={[intentStyles.text, { marginLeft: spacing.xs }]}>
						→
					</Text>
				)}
			</View>
		</Pressable>
	);
}

// Base styles
const styles = StyleSheet.create({
	base: {
		borderRadius: radius.md,
		borderWidth: 1,
		// React Native doesn't support shadows quite like web, but we can add basic shadow
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1, // Android shadow
	},
	content: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	text: {
		fontFamily: fontFamily.semibold,
		textAlign: "center",
	},
	pressed: {
		opacity: 0.8,
		// Increase shadow on press
		shadowOpacity: 0.1,
		shadowRadius: 3,
		elevation: 2,
	},
	disabled: {
		opacity: 0.5,
	},
});

// Size variants matching web app
function getSizeStyles(size: "sm" | "md" | "lg") {
	switch (size) {
		case "sm":
			return StyleSheet.create({
				container: {
					paddingHorizontal: spacing.sm + 4,
					paddingVertical: spacing.xs + 2,
				},
				text: {
					fontSize: 11,
				},
			});
		case "lg":
			return StyleSheet.create({
				container: {
					paddingHorizontal: spacing.md + 4,
					paddingVertical: spacing.sm + 2,
				},
				text: {
					fontSize: 14,
				},
			});
		case "md":
		default:
			return StyleSheet.create({
				container: {
					paddingHorizontal: spacing.md,
					paddingVertical: spacing.sm,
				},
				text: {
					fontSize: 13,
				},
			});
	}
}

// Intent variants matching web app's design language
function getIntentStyles(intent: StyledButtonProps["intent"]) {
	// Define colors matching the web app's Tailwind classes
	const intentColors = {
		primary: {
			bg: "rgba(0, 166, 244, 0.1)", // primary/10
			bgHover: "rgba(0, 166, 244, 0.15)", // primary/15
			text: colors.primary,
			border: "rgba(0, 166, 244, 0.3)", // primary/30
		},
		success: {
			bg: "rgba(34, 197, 94, 0.1)", // green-50 equivalent
			bgHover: "rgba(34, 197, 94, 0.15)",
			text: "#16a34a", // green-600
			border: "rgba(34, 197, 94, 0.3)",
		},
		destructive: {
			bg: "rgba(239, 68, 68, 0.1)", // red-50 equivalent
			bgHover: "rgba(239, 68, 68, 0.15)",
			text: "#dc2626", // red-600
			border: "rgba(239, 68, 68, 0.3)",
		},
		warning: {
			bg: "rgba(245, 158, 11, 0.1)", // amber-50 equivalent
			bgHover: "rgba(245, 158, 11, 0.15)",
			text: "#d97706", // amber-600
			border: "rgba(245, 158, 11, 0.3)",
		},
		secondary: {
			bg: "#f9fafb", // gray-50
			bgHover: "#f3f4f6", // gray-100
			text: "#4b5563", // gray-600
			border: "#e5e7eb", // gray-200
		},
		outline: {
			bg: "#ffffff",
			bgHover: "#f9fafb",
			text: "#4b5563", // gray-600
			border: "#e5e7eb", // gray-200
		},
		plain: {
			bg: "transparent",
			bgHover: "#f9fafb",
			text: "#4b5563", // gray-600
			border: "transparent",
		},
	};

	const colorScheme = intentColors[intent || "outline"];

	return StyleSheet.create({
		container: {
			backgroundColor: colorScheme.bg,
			borderColor: colorScheme.border,
		},
		text: {
			color: colorScheme.text,
		},
	});
}

