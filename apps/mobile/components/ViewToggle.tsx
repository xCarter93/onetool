import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, fontFamily, radius, spacing } from "@/lib/theme";
import { LayoutDashboard, CalendarDays } from "lucide-react-native";

export type ViewMode = "dashboard" | "calendar";

interface ViewToggleProps {
	value: ViewMode;
	onChange: (mode: ViewMode) => void;
}

export const ViewToggle = memo(function ViewToggle({
	value,
	onChange,
}: ViewToggleProps) {
	return (
		<View style={styles.container}>
			<Pressable
				onPress={() => onChange("dashboard")}
				style={[
					styles.button,
					styles.buttonLeft,
					value === "dashboard" && styles.buttonActive,
				]}
			>
				<LayoutDashboard
					size={16}
					color={value === "dashboard" ? colors.primary : colors.mutedForeground}
				/>
				<Text
					style={[
						styles.buttonText,
						value === "dashboard" && styles.buttonTextActive,
					]}
				>
					Dashboard
				</Text>
			</Pressable>

			<Pressable
				onPress={() => onChange("calendar")}
				style={[
					styles.button,
					styles.buttonRight,
					value === "calendar" && styles.buttonActive,
				]}
			>
				<CalendarDays
					size={16}
					color={value === "calendar" ? colors.primary : colors.mutedForeground}
				/>
				<Text
					style={[
						styles.buttonText,
						value === "calendar" && styles.buttonTextActive,
					]}
				>
					Calendar
				</Text>
			</Pressable>
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		backgroundColor: colors.muted,
		borderRadius: radius.lg,
		padding: 3,
	},
	button: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		borderRadius: radius.md,
	},
	buttonLeft: {
		borderTopRightRadius: 0,
		borderBottomRightRadius: 0,
	},
	buttonRight: {
		borderTopLeftRadius: 0,
		borderBottomLeftRadius: 0,
	},
	buttonActive: {
		backgroundColor: colors.card,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	buttonText: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
		color: colors.mutedForeground,
	},
	buttonTextActive: {
		color: colors.primary,
		fontFamily: fontFamily.semibold,
	},
});

