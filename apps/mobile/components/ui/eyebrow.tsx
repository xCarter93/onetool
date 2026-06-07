import React from "react";
import { StyleSheet, Text } from "react-native";
import { fontFamily, useTokens } from "@/lib/theme";

interface EyebrowProps {
	children: React.ReactNode;
}

export function Eyebrow({ children }: EyebrowProps) {
	const t = useTokens();
	return <Text style={[styles.text, { color: t.faint }]}>{children}</Text>;
}

const styles = StyleSheet.create({
	text: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.7,
		textTransform: "uppercase",
	},
});
