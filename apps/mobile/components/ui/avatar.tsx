import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, useTokens } from "@/lib/theme";

interface AvatarProps {
	text: string;
	size?: number;
	tone?: string;
}

export function Avatar({ text, size = 44, tone }: AvatarProps) {
	const t = useTokens();
	const color = tone || t.accent;

	return (
		<View
			style={[
				styles.base,
				{
					width: size,
					height: size,
					borderRadius: size * 0.32,
					backgroundColor: color + "14",
					borderColor: color + "22",
				},
			]}
		>
			<Text
				style={[styles.text, { fontSize: size * 0.34, color }]}
				numberOfLines={1}
			>
				{text}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	base: {
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	text: {
		fontFamily: fontFamily.bold,
		letterSpacing: 0.3,
	},
});
