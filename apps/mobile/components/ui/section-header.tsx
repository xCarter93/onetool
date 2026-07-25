import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";

interface SectionHeaderProps {
	title: string;
	action?: string;
	onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
	const t = useTokens();

	return (
		<View style={styles.row}>
			<Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>
				{title}
			</Text>
			{action ? (
				<Pressable
					onPress={onAction}
					hitSlop={12}
					accessibilityRole="button"
					style={({ pressed }) => [styles.action, pressed && styles.pressed]}
				>
					<Text
						style={[styles.actionText, { color: t.frostedInk }]}
						numberOfLines={1}
					>
						{action}
					</Text>
					<ChevronRight size={15} color={t.frostedInk} />
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	action: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		flexShrink: 0,
	},
	actionText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
	},
	pressed: {
		opacity: 0.6,
	},
});
