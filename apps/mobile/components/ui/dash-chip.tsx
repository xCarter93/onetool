import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, useTokens } from "@/lib/theme";

interface DashChipProps {
	children: React.ReactNode;
	soft?: boolean;
}

// The OneTool signature flourish — a 1.5px dashed brand chip.
export function DashChip({ children, soft }: DashChipProps) {
	const t = useTokens();

	return (
		<View
			style={[
				styles.chip,
				{
					borderColor: t.accent,
					backgroundColor: soft ? t.accentSoft : "transparent",
				},
			]}
		>
			<Text style={[styles.text, { color: t.accent }]} numberOfLines={1}>
				{children}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	chip: {
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderStyle: "dashed",
		borderRadius: 11,
		paddingVertical: 1,
		paddingHorizontal: 9,
	},
	text: {
		fontFamily: fontFamily.bold,
	},
});
