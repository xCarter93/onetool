import React from "react";
import { StyleSheet, View } from "react-native";
import { radii, touch, useTokens } from "@/lib/theme";

/**
 * Shaped like the real schedule: a group label bar, a card of rows with a
 * checkbox square and two text lines, then a shorter second group. Static —
 * a pulse at this frequency (every Today open) is noise, not feedback.
 */
export function ScheduleSkeleton() {
	const t = useTokens();

	const group = (rows: number, labelWidth: number) => (
		<View style={styles.group}>
			<View
				style={[styles.label, { width: labelWidth, backgroundColor: t.lineSoft }]}
			/>
			<View
				style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}
			>
				{Array.from({ length: rows }, (_, i) => (
					<View
						key={i}
						style={[
							styles.row,
							i < rows - 1 && {
								borderBottomWidth: 1,
								borderBottomColor: t.lineSoft,
							},
						]}
					>
						<View style={[styles.box, { backgroundColor: t.lineSoft }]} />
						<View style={styles.body}>
							<View
								style={[
									styles.line,
									{ width: "58%", height: 12, backgroundColor: t.lineSoft },
								]}
							/>
							<View
								style={[
									styles.line,
									{ width: "34%", height: 10, backgroundColor: t.lineSoft },
								]}
							/>
						</View>
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
			{group(2, 58)}
			{group(3, 76)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		gap: 18,
	},
	group: {
		gap: 7,
	},
	label: {
		height: 9,
		borderRadius: radii.xs,
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
		paddingHorizontal: 14,
		gap: 12,
	},
	box: {
		width: 22,
		height: 22,
		borderRadius: radii.xs,
	},
	body: {
		flex: 1,
		gap: 6,
		paddingVertical: 11,
	},
	line: {
		borderRadius: radii.xs,
	},
});
