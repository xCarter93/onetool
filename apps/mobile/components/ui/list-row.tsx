import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, icons } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import { Badge } from "./badge";

interface ListRowProps {
	icon?: keyof typeof icons;
	iconColor?: string;
	avatar?: React.ReactNode;
	title: string;
	sub?: string;
	right?: React.ReactNode;
	status?: string;
	showChevron?: boolean;
	onPress?: () => void;
	last?: boolean;
}

export function ListRow({
	icon,
	iconColor,
	avatar,
	title,
	sub,
	right,
	status,
	showChevron = true,
	onPress,
	last,
}: ListRowProps) {
	const t = useTokens();
	const Glyph = icon ? icons[icon] : null;
	const tileColor = iconColor || t.accent;

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				{ borderBottomColor: t.line, borderBottomWidth: last ? 0 : 1 },
				pressed && styles.pressed,
			]}
		>
			{avatar}
			{Glyph && !avatar ? (
				<View style={[styles.tile, { backgroundColor: tileColor + "14" }]}>
					<Glyph size={20} color={tileColor} />
				</View>
			) : null}
			<View style={styles.body}>
				<Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>
					{title}
				</Text>
				{sub ? (
					<Text style={[styles.sub, { color: t.sub }]} numberOfLines={1}>
						{sub}
					</Text>
				) : null}
			</View>
			{status ? <Badge status={status} /> : null}
			{right}
			{showChevron ? <ChevronRight size={18} color={t.faint} /> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 4,
	},
	tile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	body: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
		marginTop: 2,
	},
	pressed: {
		opacity: 0.7,
	},
});
