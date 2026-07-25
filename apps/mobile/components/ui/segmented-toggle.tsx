import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LayoutDashboard, CalendarDays } from "lucide-react-native";
import { fontFamily, shadow, type, useTokens } from "@/lib/theme";
import type { ViewMode } from "@/lib/useViewMode";

// Re-export the single source of the type so consumers migrate off ViewToggle.tsx.
export type { ViewMode };

interface SegmentedToggleProps {
	value: ViewMode;
	onChange: (mode: ViewMode) => void;
}

const SEGMENTS: { mode: ViewMode; label: string; Icon: typeof LayoutDashboard }[] = [
	{ mode: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
	{ mode: "calendar", label: "Calendar", Icon: CalendarDays },
];

export function SegmentedToggle({ value, onChange }: SegmentedToggleProps) {
	const t = useTokens();
	return (
		<View style={[styles.container, { backgroundColor: t.secondary }]}>
			{SEGMENTS.map(({ mode, label, Icon }) => {
				const active = value === mode;
				return (
					<Pressable
						key={mode}
						onPress={() => onChange(mode)}
						accessibilityRole="button"
						accessibilityState={{ selected: active }}
						style={[
							styles.segment,
							active && {
								backgroundColor: t.card,
								boxShadow: shadow.segmented,
							},
						]}
					>
						<Icon size={16} color={active ? t.primary : t.faint} />
						<Text
							style={[
								styles.label,
								{
									color: active ? t.ink : t.sub,
									fontFamily: active
										? fontFamily.semibold
										: fontFamily.medium,
								},
							]}
						>
							{label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		borderRadius: 9,
		padding: 3,
	},
	segment: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 7,
	},
	label: {
		fontSize: type.sm,
	},
});
