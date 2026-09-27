import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { fontFamily, frame, radii, useTokens } from "@/lib/theme";

export interface Segment<V extends string> {
	value: V;
	label: string;
	Icon?: LucideIcon;
	/** Small count chip after the label. */
	count?: number;
}

interface SegmentedToggleProps<V extends string> {
	segments: readonly Segment<V>[];
	value: V;
	onChange: (value: V) => void;
	/** 32px for tight headers; default is the 40px mobile touch size. */
	compact?: boolean;
}

/** Web's joined segments: square inner edges, selected cell tinted with a 2px underline. */
export function SegmentedToggle<V extends string>({
	segments,
	value,
	onChange,
	compact = false,
}: SegmentedToggleProps<V>) {
	const t = useTokens();
	return (
		<View
			style={[styles.container, { backgroundColor: t.card, borderColor: t.line }]}
			accessibilityRole="tablist"
		>
			{segments.map(({ value: segment, label, Icon, count }, i) => {
				const active = value === segment;
				return (
					<Pressable
						key={segment}
						onPress={() => onChange(segment)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
						hitSlop={compact ? { top: 6, bottom: 6 } : undefined}
						style={[
							styles.segment,
							{ minHeight: compact ? 32 : 40 },
							i < segments.length - 1 && { borderRightWidth: 1, borderRightColor: t.line },
							active && {
								backgroundColor: t.secondary,
								boxShadow: `inset 0 -2px 0 ${frame.indicator}`,
							},
						]}
					>
						{Icon ? <Icon size={15} color={active ? t.ink : t.sub} /> : null}
						<Text
							style={[
								styles.label,
								{
									color: active ? t.ink : t.sub,
									fontFamily: active ? fontFamily.semibold : fontFamily.medium,
								},
							]}
							numberOfLines={1}
						>
							{label}
						</Text>
						{count !== undefined ? (
							<View style={[styles.count, { backgroundColor: active ? t.card : t.secondary, borderColor: t.line }]}>
								<Text style={[styles.countText, { color: t.sub }]}>{count}</Text>
							</View>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		borderRadius: radii.ctrl,
		borderWidth: 1,
		overflow: "hidden",
	},
	// Grow from content width so the control also sizes itself in auto-width slots.
	segment: {
		flexGrow: 1,
		flexBasis: "auto",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingHorizontal: 10,
	},
	label: {
		fontSize: 13,
		flexShrink: 1,
	},
	count: {
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 5,
	},
	countText: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		fontVariant: ["tabular-nums"],
	},
});
