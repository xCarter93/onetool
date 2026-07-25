import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ListChecks, Clock, type LucideIcon } from "lucide-react-native";
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";
import type { ViewMode } from "@/lib/useViewMode";

// Re-export the single source of the type.
export type { ViewMode };

interface SegmentedToggleProps {
	value: ViewMode;
	onChange: (mode: ViewMode) => void;
}

const SEGMENTS: { mode: ViewMode; label: string; Icon: LucideIcon }[] = [
	{ mode: "agenda", label: "Agenda", Icon: ListChecks },
	{ mode: "timeline", label: "Timeline", Icon: Clock },
];

export function SegmentedToggle({ value, onChange }: SegmentedToggleProps) {
	const t = useTokens();
	return (
		<View
			style={[styles.container, { backgroundColor: t.secondary }]}
			accessibilityRole="tablist"
		>
			{SEGMENTS.map(({ mode, label, Icon }) => {
				const active = value === mode;
				return (
					<Pressable
						key={mode}
						onPress={() => onChange(mode)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
						style={[
							styles.segment,
							active && {
								backgroundColor: t.card,
								boxShadow: shadow.segmented,
							},
						]}
					>
						<Icon size={16} color={active ? t.frostedInk : t.sub} />
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
		minHeight: 44,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: radii.sm,
	},
	label: {
		fontSize: type.sm,
	},
});
