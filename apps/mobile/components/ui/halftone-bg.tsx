import React from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";

interface HalftoneBgProps {
	brand?: number;
	children?: React.ReactNode;
}

// MDS-05 brand wash — BG.png halftone composited under a gradient scrim that
// fades into the Field Kit surface (#f5f7f9). Matches direction-a.jsx home header.
// experimental_backgroundImage is RN New Arch only and not in core types — cast.
const SCRIM: ViewStyle = {
	experimental_backgroundImage:
		"linear-gradient(180deg, rgba(245,247,249,0.32) 0%, rgba(245,247,249,0.74) 64%, #f5f7f9 100%)",
} as unknown as ViewStyle;

export function HalftoneBg({ brand = 0.6, children }: HalftoneBgProps) {
	return (
		<View style={StyleSheet.absoluteFill}>
			<Image
				source={require("../../assets/BG.png")}
				style={[StyleSheet.absoluteFill, { opacity: 0.3 + brand * 0.45 }]}
				resizeMode="cover"
			/>
			<View style={[StyleSheet.absoluteFill, SCRIM]} />
			<View style={styles.content}>{children}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		flex: 1,
	},
});
