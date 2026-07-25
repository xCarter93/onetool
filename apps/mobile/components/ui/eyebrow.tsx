import React from "react";
import { StyleSheet, Text } from "react-native";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";

interface EyebrowProps {
	children: React.ReactNode;
	// Override the default faint tone — e.g. ink for strong contrast over the brand wash.
	color?: string;
}

export function Eyebrow({ children, color }: EyebrowProps) {
	const t = useTokens();
	return (
		<Text style={[styles.text, { color: color ?? t.faint }]}>{children}</Text>
	);
}

const styles = StyleSheet.create({
	text: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
		textTransform: "uppercase",
	},
});
