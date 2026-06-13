import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { fontFamily, useTokens } from "@/lib/theme";

interface AvatarProps {
	text: string;
	size?: number;
	tone?: string;
	// Profile photo URI; renders the image when set, initials otherwise.
	imageUrl?: string | null;
}

export function Avatar({ text, size = 44, tone, imageUrl }: AvatarProps) {
	const t = useTokens();
	const color = tone || t.accent;
	const radius = size * 0.32;

	if (imageUrl) {
		return (
			<Image
				source={{ uri: imageUrl }}
				style={[
					styles.base,
					{
						width: size,
						height: size,
						borderRadius: radius,
						borderColor: color + "22",
					},
				]}
			/>
		);
	}

	return (
		<View
			style={[
				styles.base,
				{
					width: size,
					height: size,
					borderRadius: radius,
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
