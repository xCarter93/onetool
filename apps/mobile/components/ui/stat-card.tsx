import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { icons } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import { Card } from "./card";
import { Eyebrow } from "./eyebrow";

interface StatCardProps {
	label: string;
	value: string | number;
	foot?: string;
	icon?: keyof typeof icons;
	tone?: string;
	onPress?: () => void;
}

export function StatCard({
	label,
	value,
	foot,
	icon,
	tone,
	onPress,
}: StatCardProps) {
	const t = useTokens();
	const Glyph = icon ? icons[icon] : null;
	const tint = tone || t.accent;

	return (
		<Card onPress={onPress}>
			<View style={styles.header}>
				{Glyph ? (
					<View style={[styles.tile, { backgroundColor: tint + "14" }]}>
						<Glyph size={18} color={tint} />
					</View>
				) : null}
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
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 10,
	},
	tile: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	value: {
		fontFamily: fontFamily.bold,
		fontSize: 28,
	},
	foot: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 4,
	},
});
