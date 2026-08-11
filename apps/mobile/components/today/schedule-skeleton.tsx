import React from "react";
import { StyleSheet, View } from "react-native";
import { radii, touch, useTokens } from "@/lib/theme";
import { SPINE } from "@/components/today/agenda-row";

/**
 * Shaped like the real body: the "Next up" lead card, then a group label bar and
 * a card of timeline rows (spine, time rail, two text lines), then a shorter
 * second group. Static — a pulse at this frequency (every Today open) is noise,
 * not feedback.
 */
export function ScheduleSkeleton() {
	const t = useTokens();

	const bar = (width: number | `${number}%`, height: number) => (
		<View style={[styles.line, { width, height, backgroundColor: t.lineSoft }]} />
	);

	const group = (rows: number, labelWidth: number) => (
		<View style={styles.group}>
			{bar(labelWidth, 9)}
			<View
				style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}
			>
				{Array.from({ length: rows }, (_, i) => (
					<View
						key={i}
						style={[
							styles.row,
							{ borderLeftColor: t.lineSoft },
							i < rows - 1 && {
								borderBottomWidth: 1,
								borderBottomColor: t.lineSoft,
							},
						]}
					>
						<View style={styles.rail}>{bar(40, 11)}</View>
						<View style={styles.body}>
							{bar("58%", 12)}
							{bar("34%", 10)}
						</View>
						<View style={[styles.box, { backgroundColor: t.lineSoft }]} />
					</View>
				))}
			</View>
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
						borderLeftColor: t.lineSoft,
					},
				]}
			>
				{bar(52, 9)}
				{bar(112, 22)}
				{bar("62%", 13)}
				{bar("38%", 10)}
			</View>
			{group(3, 76)}
			{group(2, 58)}
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
		borderLeftWidth: SPINE,
		borderRadius: radii.card,
		paddingVertical: 15,
		paddingHorizontal: 14,
	},
	group: {
		gap: 7,
	},
	card: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: touch.min,
		borderLeftWidth: SPINE,
		paddingLeft: 11,
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
