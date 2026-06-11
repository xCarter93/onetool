import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { icons } from "lucide-react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { Card } from "./card";
import { Eyebrow } from "./eyebrow";

interface StatCardProps {
	label: string;
	value: string | number;
	foot?: string;
	icon?: keyof typeof icons;
	tone?: string;
	onPress?: () => void;
	style?: ViewStyle | ViewStyle[];
	// Large faded glyph bleeding off the bottom-right corner (Fi-style). Defaults
	// on whenever an icon is set; pass false to suppress it.
	watermark?: boolean;
}

export function StatCard({
	label,
	value,
	foot,
	icon,
	tone,
	onPress,
	style,
	watermark = true,
}: StatCardProps) {
	const t = useTokens();
	// Local alias: computed access directly on the imported namespace trips
	// eslint import/namespace.
	const iconMap = icons;
	const Glyph = icon ? iconMap[icon] : null;
	const tint = tone || t.accent;

	return (
		<Card onPress={onPress} style={style}>
			{Glyph && watermark ? (
				<View style={styles.watermarkClip} pointerEvents="none">
					<View style={styles.watermark}>
						<Glyph size={132} color={tint} strokeWidth={2} />
					</View>
				</View>
			) : null}
			<View style={styles.label}>
				<Eyebrow>{label}</Eyebrow>
			</View>
			<Text style={[styles.value, { color: t.ink }]} numberOfLines={1}>
				{value}
			</Text>
			{foot ? (
				<Text style={[styles.foot, { color: t.sub }]} numberOfLines={1}>
					{foot}
				</Text>
			) : null}
		</Card>
	);
}

const styles = StyleSheet.create({
	// Fills the card inside its border so the oversized glyph clips at the corner.
	watermarkClip: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		borderRadius: radii.rLg,
		overflow: "hidden",
	},
	watermark: {
		position: "absolute",
		right: -26,
		bottom: -32,
		opacity: 0.16,
	},
	label: {
		marginBottom: 10,
	},
	value: {
		fontFamily: fontFamily.bold,
		fontSize: 24,
	},
	foot: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
		marginTop: 4,
	},
});
