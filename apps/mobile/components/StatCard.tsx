import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, fontFamily, radius, spacing } from "@/lib/theme";
import { TrendingUp, TrendingDown, Minus } from "lucide-react-native";

interface StatCardProps {
	icon: React.ReactNode;
	label: string;
	value: string | number;
	subValue?: string;
	changeType?: "increase" | "decrease" | "neutral";
	changeValue?: number | string;
	onPress?: () => void;
	accentColor?: string;
}

export function StatCard({
	icon,
	label,
	value,
	subValue,
	changeType,
	changeValue,
	onPress,
	accentColor = colors.primary,
}: StatCardProps) {
	const getChangeColor = () => {
		switch (changeType) {
			case "increase":
				return colors.success;
			case "decrease":
				return colors.danger;
			default:
				return colors.mutedForeground;
		}
	};

	const ChangeIcon = () => {
		const iconSize = 12;
		const iconColor = getChangeColor();

		switch (changeType) {
			case "increase":
				return <TrendingUp size={iconSize} color={iconColor} />;
			case "decrease":
				return <TrendingDown size={iconSize} color={iconColor} />;
			default:
				return <Minus size={iconSize} color={iconColor} />;
		}
	};

	const content = (
		<View style={styles.card}>
			{/* Accent bar */}
			<View style={[styles.accentBar, { backgroundColor: accentColor }]} />

			<View style={styles.content}>
				{/* Header with icon and label */}
				<View style={styles.header}>
					<View
						style={[
							styles.iconContainer,
							{ backgroundColor: `${accentColor}15` },
						]}
					>
						{icon}
					</View>
					<Text style={styles.label}>{label}</Text>
				</View>

				{/* Value */}
				<Text style={styles.value}>{value}</Text>

				{/* Footer with change indicator or subvalue */}
				<View style={styles.footer}>
					{changeType && changeValue !== undefined && (
						<View style={styles.changeContainer}>
							<ChangeIcon />
							<Text style={[styles.changeText, { color: getChangeColor() }]}>
								{changeType === "decrease"
									? "-"
									: changeType === "increase"
										? "+"
										: ""}
								{changeValue}
							</Text>
						</View>
					)}
					{subValue && <Text style={styles.subValue}>{subValue}</Text>}
				</View>
			</View>
		</View>
	);

	if (onPress) {
		return (
			<Pressable
				onPress={onPress}
				style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
			>
				{content}
			</Pressable>
		);
	}

	return content;
}

const styles = StyleSheet.create({
	pressable: {
		flex: 1,
	},
	pressed: {
		opacity: 0.7,
	},
	card: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: colors.border,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	accentBar: {
		height: 3,
		width: "100%",
	},
	content: {
		padding: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: spacing.sm,
	},
	iconContainer: {
		width: 32,
		height: 32,
		borderRadius: radius.md,
		alignItems: "center",
		justifyContent: "center",
		marginRight: spacing.sm,
	},
	label: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
		flex: 1,
	},
	value: {
		fontSize: 24,
		fontFamily: fontFamily.bold,
		color: colors.foreground,
		marginBottom: spacing.xs,
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	changeContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	changeText: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
	},
	subValue: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
});
