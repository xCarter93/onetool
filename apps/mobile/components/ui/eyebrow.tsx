import React from "react";
import { StyleSheet, Text } from "react-native";
import { fontFamily, useTokens } from "@/lib/theme";

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
	// Web's uppercase group label: 11/600, 0.08em.
	text: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.9,
		textTransform: "uppercase",
	},
});
