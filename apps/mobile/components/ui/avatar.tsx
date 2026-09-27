import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
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
	const color = tone || t.sub;
	const radius = size * 0.32;
	// Falls back to initials on a failed load (offline, first load, bad URL) rather than a blank tile.
	const [failed, setFailed] = useState(false);
	// Reset during render (not an effect) when the URL changes, per React's
	// "adjusting state when a prop changes" pattern.
	const [prevUrl, setPrevUrl] = useState(imageUrl);
	if (imageUrl !== prevUrl) {
		setPrevUrl(imageUrl);
		setFailed(false);
	}

	if (imageUrl && !failed) {
		return (
			<Image
				source={{ uri: imageUrl }}
				contentFit="cover"
				cachePolicy="disk"
				transition={150}
				onError={() => setFailed(true)}
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
		fontFamily: fontFamily.semibold,
		letterSpacing: 0.3,
	},
});
