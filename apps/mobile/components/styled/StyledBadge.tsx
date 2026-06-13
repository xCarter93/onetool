import { View, Text, ViewStyle, TextStyle, StyleSheet } from "react-native";
import { colors, spacing, radius, fontFamily } from "@/lib/theme";

/**
 * StyledBadge - A general-purpose badge component matching the web app's badge variants
 * More flexible than StatusBadge which is specific to status types
 * Aligns with the web app's styled-badge.tsx design language
 */

export interface StyledBadgeProps {
	variant?:
		| "default"
		| "secondary"
		| "destructive"
		| "success"
		| "warning"
		| "outline"
		| "primary";
	children: React.ReactNode;
	style?: ViewStyle;
	textStyle?: TextStyle;
}

export function StyledBadge({
	variant = "default",
	children,
	style,
	textStyle,
}: StyledBadgeProps) {
	const variantStyles = getVariantStyles(variant);

	return (
		<View style={[styles.base, variantStyles.container, style]}>
			<Text style={[styles.text, variantStyles.text, textStyle]}>
				{children}
			</Text>
		</View>
	);
}

// Base styles
const styles = StyleSheet.create({
	base: {
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radius.full,
		alignSelf: "flex-start",
		borderWidth: 1,
	},
	text: {
		fontSize: 11,
		fontFamily: fontFamily.semibold,
		textAlign: "center",
	},
});

// Variant styles matching web app's badge variants
function getVariantStyles(variant: StyledBadgeProps["variant"]) {
	const variants = {
		default: {
			container: {
				backgroundColor: colors.muted,
				borderColor: colors.border,
			},
			text: {
				color: colors.foreground,
			},
		},
		secondary: {
			container: {
				backgroundColor: "#f9fafb", // gray-50
				borderColor: "#e5e7eb", // gray-200
			},
			text: {
				color: "#4b5563", // gray-600
			},
		},
		destructive: {
			container: {
				backgroundColor: "rgba(239, 68, 68, 0.1)", // red-50 equivalent
				borderColor: "rgba(239, 68, 68, 0.3)",
			},
			text: {
				color: "#dc2626", // red-600
			},
		},
		success: {
			container: {
				backgroundColor: "rgba(34, 197, 94, 0.1)", // green-50 equivalent
				borderColor: "rgba(34, 197, 94, 0.3)",
			},
			text: {
				color: "#16a34a", // green-600
			},
		},
		warning: {
			container: {
				backgroundColor: "rgba(245, 158, 11, 0.1)", // amber-50 equivalent
				borderColor: "rgba(245, 158, 11, 0.3)",
			},
			text: {
				color: "#d97706", // amber-600
			},
		},
		outline: {
			container: {
				backgroundColor: "transparent",
				borderColor: colors.border,
			},
			text: {
				color: colors.foreground,
			},
		},
		primary: {
			container: {
				backgroundColor: "rgba(0, 166, 244, 0.1)", // primary/10
				borderColor: "rgba(0, 166, 244, 0.3)", // primary/30
			},
			text: {
				color: colors.primary,
			},
		},
	};

	return StyleSheet.create(variants[variant || "default"]);
}

