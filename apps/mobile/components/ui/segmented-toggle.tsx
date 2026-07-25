import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";

export interface Segment<V extends string> {
	value: V;
	label: string;
	Icon: LucideIcon;
}

interface SegmentedToggleProps<V extends string> {
	segments: readonly Segment<V>[];
	value: V;
	onChange: (value: V) => void;
}

/** Equal-width pill toggle (Today's Me | Team scope, etc.). */
export function SegmentedToggle<V extends string>({
	segments,
	value,
	onChange,
}: SegmentedToggleProps<V>) {
	const t = useTokens();
	return (
		<View
			style={[styles.container, { backgroundColor: t.secondary }]}
			accessibilityRole="tablist"
		>
			{segments.map(({ value: segment, label, Icon }) => {
				const active = value === segment;
				return (
					<Pressable
						key={segment}
						onPress={() => onChange(segment)}
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
