import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LayoutDashboard, CalendarDays } from "lucide-react-native";
import { fontFamily, radii, shadow, useTokens } from "@/lib/theme";
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
		<View style={[styles.container, { backgroundColor: t.muted }]}>
			{SEGMENTS.map(({ mode, label, Icon }) => {
				const active = value === mode;
				return (
					<Pressable
						key={mode}
						onPress={() => onChange(mode)}
						style={[
							styles.segment,
							active && {
								backgroundColor: t.card,
								boxShadow: shadow.sm,
							},
						]}
					>
						<Icon size={16} color={active ? t.accent : t.faint} />
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
		borderRadius: radii.xl,
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
		borderRadius: radii.xl,
	},
	label: {
		fontSize: 13,
	},
});
