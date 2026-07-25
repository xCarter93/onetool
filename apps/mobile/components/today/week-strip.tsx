import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontFamily, radii, touch, tracking, useTokens } from "@/lib/theme";
import { MAX_WORKLOAD_DOTS, workloadDots } from "@/lib/agenda";
import { utcDayStartMs } from "@/lib/date";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekStripProps {
	/** The 7 UTC-midnight timestamps to render (see `weekDaysFor`). */
	days: number[];
	selectedDayMs: number;
	todayMs: number;
	/** Open-task counts keyed by UTC-midnight ms (see `countTasksByDay`). */
	counts: Map<number, number>;
	/** Tapping a day scopes the agenda to it. */
	onSelectDay: (dayMs: number) => void;
}

/**
 * The persistent week strip under Today's greeting. It is the agenda's date
 * lens (it replaced the retired `Today | All tasks` segmented control) and a
 * passive weekly-workload read via the per-day dots.
 *
 * It picks the DATE only. The Agenda/Timeline toggle beneath it picks the
 * representation — deliberately orthogonal, so neither control hides the other.
 */
export function WeekStrip({
	days,
	selectedDayMs,
	todayMs,
	counts,
	onSelectDay,
}: WeekStripProps) {
	const t = useTokens();
	const selected = utcDayStartMs(selectedDayMs);
	const today = utcDayStartMs(todayMs);

	return (
		<View style={styles.strip} accessibilityRole="tablist">
			{days.map((dayMs) => {
				const isSelected = dayMs === selected;
				const isToday = dayMs === today;
				const d = new Date(dayMs);
				const dots = workloadDots(counts.get(dayMs) ?? 0);
				const label = `${DOW[d.getUTCDay()]} ${d.getUTCDate()}`;

				return (
					<Pressable
						key={dayMs}
						accessibilityRole="tab"
						accessibilityState={{ selected: isSelected }}
						accessibilityLabel={
							isToday ? `Today, ${label}` : label
						}
						accessibilityHint="Shows this day's work"
						onPress={() => onSelectDay(dayMs)}
						style={[
							styles.cell,
							isSelected && { backgroundColor: t.primarySolid },
						]}
					>
						<Text
							style={[
								styles.dow,
								// Full white, not 85% — 0.85 alpha composites to ~#d9eaf4 on
									// primarySolid, which is 4.18:1 and fails AA at 10px.
									{ color: isSelected ? "#ffffff" : t.faint },
							]}
						>
							{DOW[d.getUTCDay()].toUpperCase()}
						</Text>
						<Text
							style={[
								styles.num,
								{
									color: isSelected ? "#ffffff" : t.ink,
									fontFamily:
										isToday && !isSelected
											? fontFamily.bold
											: fontFamily.semibold,
								},
							]}
						>
							{d.getUTCDate()}
						</Text>
						<View style={styles.dots}>
							{Array.from({ length: MAX_WORKLOAD_DOTS }, (_, i) =>
								i < dots ? (
									<View
										key={i}
										style={[
											styles.dot,
											{
												backgroundColor: isSelected
													? "rgba(255,255,255,0.8)"
													: t.dot,
											},
										]}
									/>
								) : (
									<View key={i} style={styles.dotSpacer} />
								),
							)}
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	strip: {
		flexDirection: "row",
		gap: 4,
		paddingTop: 4,
		paddingBottom: 14,
	},
	cell: {
		flex: 1,
		alignItems: "center",
		borderRadius: radii.xl,
		// 7 cells across a 375pt screen are ~47pt wide; height keeps the 44pt
		// minimum without needing hitSlop.
		minHeight: touch.min,
		paddingTop: 7,
		paddingBottom: 8,
	},
	dow: {
		fontFamily: fontFamily.semibold,
		fontSize: 10,
		letterSpacing: tracking.groupLabel,
	},
	num: {
		fontSize: 15,
		marginTop: 2,
	},
	dots: {
		height: 5,
		flexDirection: "row",
		justifyContent: "center",
		gap: 2,
		marginTop: 3,
	},
	dot: {
		width: 4,
		height: 4,
		borderRadius: 2,
	},
	// Reserve the slot so cells with fewer dots don't shift their neighbours.
	dotSpacer: {
		width: 4,
		height: 4,
	},
});
