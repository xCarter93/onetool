import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, fontFamily, spacing } from "@/lib/theme";
import { ChevronRight } from "lucide-react-native";

interface SectionHeaderProps {
	title: string;
	subtitle?: string;
	count?: number;
	actionLabel?: string;
	onAction?: () => void;
	icon?: React.ReactNode;
}

export function SectionHeader({
	title,
	subtitle,
	count,
	actionLabel,
	onAction,
	icon,
}: SectionHeaderProps) {
	return (
		<View style={styles.container}>
			<View style={styles.left}>
				{icon && <View style={styles.icon}>{icon}</View>}
				<View>
					<View style={styles.titleRow}>
						<Text style={styles.title}>{title}</Text>
						{count !== undefined && (
							<View style={styles.countBadge}>
								<Text style={styles.countText}>{count}</Text>
							</View>
						)}
					</View>
					{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
				</View>
			</View>

			{actionLabel && onAction && (
				<Pressable
					onPress={onAction}
					style={({ pressed }) => [
						styles.actionButton,
						pressed && styles.actionPressed,
					]}
				>
					<Text style={styles.actionLabel}>{actionLabel}</Text>
					<ChevronRight size={16} color={colors.primary} />
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		backgroundColor: colors.muted,
		borderRadius: 8,
		marginBottom: spacing.sm,
	},
	left: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	icon: {
		marginRight: spacing.sm,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	title: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
	},
	countBadge: {
		backgroundColor: colors.primary,
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
	},
	countText: {
		fontSize: 11,
		fontFamily: fontFamily.medium,
		color: "#fff",
	},
	subtitle: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginTop: 2,
	},
	actionButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	actionPressed: {
		opacity: 0.7,
	},
	actionLabel: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.primary,
	},
});
