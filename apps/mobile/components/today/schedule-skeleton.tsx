import React from "react";
import { StyleSheet, View } from "react-native";
import { radii, touch, useTokens } from "@/lib/theme";

/**
 * Shaped like the real body: the "Next up" lead card, then ONE bordered panel —
 * a group-label bar, a few timeline rows (time rail, two text lines),
 * another group-label bar, a couple more rows — matching the merged panel
 * `DayPlanView` renders. Static — a pulse at this frequency (every Today open)
 * is noise, not feedback.
 */
export function ScheduleSkeleton() {
	const t = useTokens();

	const bar = (width: number | `${number}%`, height: number) => (
		<View style={[styles.line, { width, height, backgroundColor: t.lineSoft }]} />
	);

	const groupLabel = (width: number) => (
		<View style={[styles.groupLabel, { backgroundColor: t.muted }]}>
			{bar(width, 9)}
		</View>
	);

	const row = (last: boolean) => (
		<View
			style={[
				styles.row,
				!last && { borderBottomWidth: 1, borderBottomColor: t.lineSoft },
			]}
		>
			<View style={styles.rail}>{bar(40, 11)}</View>
			<View style={styles.body}>
				{bar("58%", 12)}
				{bar("34%", 10)}
			</View>
			<View style={[styles.box, { backgroundColor: t.lineSoft }]} />
		</View>
	);

	return (
		<View
			style={styles.wrap}
			accessibilityLabel="Loading schedule"
			accessibilityRole="progressbar"
		>
			<View
				style={[
					styles.lead,
					{
						backgroundColor: t.card,
						borderColor: t.line,
					},
				]}
			>
				{bar(52, 9)}
				{bar(112, 22)}
				{bar("62%", 13)}
				{bar("38%", 10)}
			</View>
			<View style={[styles.panel, { backgroundColor: t.card, borderColor: t.line }]}>
				{groupLabel(76)}
				{row(false)}
				{row(false)}
				{row(false)}
				{groupLabel(58)}
				{row(false)}
				{row(true)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		gap: 18,
	},
	lead: {
		gap: 7,
		borderWidth: 1,
		borderRadius: radii.card,
		paddingVertical: 15,
		paddingHorizontal: 14,
	},
	panel: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	groupLabel: {
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: touch.min,
		paddingLeft: 14,
		paddingRight: 14,
		gap: 10,
	},
	rail: {
		width: 58,
	},
	body: {
		flex: 1,
		gap: 6,
		paddingVertical: 11,
	},
	box: {
		width: 22,
		height: 22,
		borderRadius: radii.xs,
	},
	line: {
		borderRadius: radii.xs,
	},
});
