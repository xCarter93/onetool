import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import { ChevronRight, icons } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Badge } from "./badge";

interface ListRowProps {
	icon?: keyof typeof icons;
	iconColor?: string;
	/** Tile fill; defaults to a 8%-alpha wash of `iconColor`. */
	iconBg?: string;
	avatar?: React.ReactNode;
	title: string;
	sub?: string;
	right?: React.ReactNode;
	status?: string;
	showChevron?: boolean;
	onPress?: () => void;
	last?: boolean;
	// iPad master-detail selected-row highlight (26-02). Defaults off so every
	// existing iPhone call site renders byte-identical.
	selected?: boolean;
	containerStyle?: StyleProp<ViewStyle>;
}

export function ListRow({
	icon,
	iconColor,
	iconBg,
	avatar,
	title,
	sub,
	right,
	status,
	showChevron = true,
	onPress,
	last,
	selected = false,
	containerStyle,
}: ListRowProps) {
	const t = useTokens();
	const Glyph = icon ? icons[icon] : null;
	// Neutral by default — blue is for actions and active states, not list chrome.
	const tileColor = iconColor || t.sub;

	return (
		<Pressable
			accessibilityRole={onPress ? "button" : undefined}
			accessibilityState={selected ? { selected: true } : undefined}
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				{ borderBottomColor: t.lineSoft, borderBottomWidth: last ? 0 : 1 },
				selected && {
					backgroundColor: t.card,
					borderWidth: 1,
					borderColor: t.line,
					borderRadius: radii.xl,
					borderBottomWidth: 1,
				},
				containerStyle,
				pressed && styles.pressed,
			]}
		>
			{avatar}
			{Glyph && !avatar ? (
				<View
					style={[
						styles.tile,
						{ backgroundColor: iconBg ?? tileColor + "14" },
					]}
				>
					<Glyph size={17} color={tileColor} />
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
			{showChevron ? <ChevronRight size={17} color={t.faint} /> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	tile: {
		width: 32,
		height: 32,
		borderRadius: 9,
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
		fontSize: type.rowTitle,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		marginTop: 2,
	},
	pressed: {
		opacity: 0.7,
	},
});
