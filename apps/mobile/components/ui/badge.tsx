import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { badgeTone, fontFamily, radii, STATUS, type, type BadgeTone } from "@/lib/theme";

interface BadgeProps {
	status: string;
	big?: boolean;
	/** Override the derived tone (e.g. a non-status label). */
	tone?: BadgeTone;
	/** Override the derived label. */
	label?: string;
}

/**
 * Quiet status badge: soft-tint fill, 6px radius, no dot. Semantic color is kept
 * (status still reads at a glance) but the pill no longer shouts.
 */
export function Badge({ status, big, tone, label }: BadgeProps) {
	const known = STATUS[status as keyof typeof STATUS];
	const resolvedTone: BadgeTone = tone ?? known?.tone ?? "mute";
	const c = badgeTone[resolvedTone];

	return (
		<View
			style={[
				styles.pill,
				{
					backgroundColor: c.bg,
					paddingVertical: big ? 4 : 3,
					paddingHorizontal: big ? 9 : 7,
				},
			]}
		>
			<Text
				style={[
					styles.label,
					{ color: c.fg, fontSize: big ? type.meta : type.micro },
				]}
				numberOfLines={1}
			>
				{label ?? known?.label ?? status}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		borderRadius: radii.sm,
		alignSelf: "flex-start",
	},
	label: {
		fontFamily: fontFamily.semibold,
		letterSpacing: 0.2,
	},
});
