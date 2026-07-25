import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import {
	fontFamily,
	radii,
	touch,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { formatClockLabel } from "@/lib/agenda";

interface TomorrowPeekProps {
	count: number;
	/** "HH:MM" of tomorrow's earliest timed job, if any. */
	firstStart?: string;
	onPress: () => void;
}

/**
 * One line of forward visibility at the end of Today. Always renders — "nothing
 * scheduled" is the answer a field owner most wants at 5pm, so an empty
 * tomorrow is information, not chrome.
 */
export function TomorrowPeek({
	count,
	firstStart,
	onPress,
}: TomorrowPeekProps) {
	const t = useTokens();
	const first = formatClockLabel(firstStart);
	const summary =
		count === 0
			? "Nothing scheduled"
			: [`${count} ${count === 1 ? "job" : "jobs"}`, first && `first at ${first}`]
					.filter(Boolean)
					.join(" · ");

	return (
		<Pressable
			onPress={onPress}
			style={[styles.row, { backgroundColor: t.card, borderColor: t.line }]}
			accessibilityRole="button"
			accessibilityLabel={`Tomorrow: ${summary}`}
		>
			<View style={styles.text}>
				<Text style={[styles.eyebrow, { color: t.faint }]}>TOMORROW</Text>
				<Text style={[styles.summary, { color: t.ink }]} numberOfLines={1}>
					{summary}
				</Text>
			</View>
			<ChevronRight size={17} color={t.faintDecor} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: touch.min,
		borderWidth: 1,
		borderRadius: radii.card,
		paddingVertical: 11,
		paddingHorizontal: 14,
	},
	text: {
		flex: 1,
		minWidth: 0,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
		marginBottom: 2,
	},
	summary: {
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
});
