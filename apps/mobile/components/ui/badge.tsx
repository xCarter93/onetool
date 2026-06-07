import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, STATUS } from "@/lib/theme";

interface BadgeProps {
	status: string;
	big?: boolean;
}

export function Badge({ status, big }: BadgeProps) {
	const s = STATUS[status as keyof typeof STATUS] ?? {
		label: status,
		c: "#8a94a3",
	};

	return (
		<View
			style={[
				styles.pill,
				{
					backgroundColor: s.c + "18",
					paddingVertical: big ? 5 : 4,
					paddingHorizontal: big ? 11 : 9,
				},
			]}
		>
			<View style={[styles.dot, { backgroundColor: s.c }]} />
			<Text
				style={[styles.label, { color: s.c, fontSize: big ? 13 : 11.5 }]}
				numberOfLines={1}
			>
				{s.label}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		alignSelf: "flex-start",
	},
	dot: {
		width: 6,
		height: 6,
		borderRadius: 6,
	},
	label: {
		fontFamily: fontFamily.semibold,
	},
});
