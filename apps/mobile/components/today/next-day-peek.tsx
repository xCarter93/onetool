import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { fontFamily, touch, tracking, type, useTokens } from "@/lib/theme";
import { Panel } from "@/components/canvas";
import { formatClockLabel } from "@/lib/agenda";

interface NextDayPeekProps {
	/** "TOMORROW" or the day's name; the day after whichever day is on screen. */
	label: string;
	count: number;
	/** "HH:MM" of the day's earliest timed job, if any. */
	firstStart?: string;
	onPress: () => void;
}

/**
 * One line of forward visibility at the end of Today. Always renders — "nothing
 * scheduled" is the answer a field owner most wants at 5pm, so an empty
 * next day is information, not chrome.
 */
export function NextDayPeek({
	label,
	count,
	firstStart,
	onPress,
}: NextDayPeekProps) {
	const t = useTokens();
	const first = formatClockLabel(firstStart);
	const summary =
		count === 0
			? "Nothing scheduled"
			: [`${count} ${count === 1 ? "job" : "jobs"}`, first && `first at ${first}`]
					.filter(Boolean)
					.join(" · ");

	return (
		<Panel>
			<Pressable
				onPress={onPress}
				style={styles.row}
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${summary}`}
			>
				<View style={styles.text}>
					<Text style={[styles.eyebrow, { color: t.sub }]}>{label.toUpperCase()}</Text>
					<Text style={[styles.summary, { color: t.ink }]} numberOfLines={1}>
						{summary}
					</Text>
				</View>
				<ChevronRight size={17} color={t.faintDecor} />
			</Pressable>
		</Panel>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: touch.min,
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
