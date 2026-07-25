import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";

interface DashChipProps {
	children: React.ReactNode;
	soft?: boolean;
}

// Neutral outline chip — retired the dashed brand flourish, tightened radius.
export function DashChip({ children, soft }: DashChipProps) {
	const t = useTokens();

	return (
		<View
			style={[
				styles.chip,
				{
					borderColor: t.line,
					backgroundColor: soft ? t.bg : "transparent",
					borderRadius: radii.ctrl,
				},
			]}
		>
			<Text style={[styles.text, { color: t.ink }]} numberOfLines={1}>
				{children}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	chip: {
		alignSelf: "flex-start",
		borderWidth: 1,
		paddingVertical: 1,
		paddingHorizontal: 9,
	},
	text: {
		fontFamily: fontFamily.semibold,
	},
});
