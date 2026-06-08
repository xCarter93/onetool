import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { fontFamily, radii, shadow, useTokens } from "@/lib/theme";
import {
	buildMonthCells,
	isMultiDayProject,
	projectsOnDay,
	sameLocalDay,
	startOfLocalDay,
	tasksOnDay,
	weekRowSpans,
	type ProjectEvent,
	type SpanSegment,
	type TaskEvent,
} from "./dateUtils";

const MNAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const PROJECT_GREEN = "#1f9d57"; // STATUS green — span bars + single-day dots

// Decorative constants (UI-SPEC Primitive Component Contracts — do NOT round).
const TODAY_PILL = 30; // filled blue today pill (30x30)
const MARKER_DOT = 5; // task/project marker dot (5x5)
const SPAN_BAR_H = 3; // multi-day project span bar height
const CELL_MIN_H = 50; // cell render height (>=44 touch target)
const MAX_LANES = 2; // max stacked span bars per week-row before +N

type MonthGridProps = {
	projects: ProjectEvent[];
	tasks: TaskEvent[];
	year: number;
	month: number;
	onMonthChange: (year: number, month: number) => void;
	onDayPress: (dayTs: number) => void;
};

export function MonthGrid({
	projects,
	tasks,
	year,
	month,
	onMonthChange,
	onDayPress,
}: MonthGridProps) {
	const t = useTokens();
	const today = new Date();

	const cells = buildMonthCells(year, month);
	const spans = weekRowSpans(projects, cells);

	const shiftMonth = (delta: number) => {
		const d = new Date(year, month + delta, 1);
		onMonthChange(d.getFullYear(), d.getMonth());
	};
	const goToday = () =>
		onMonthChange(today.getFullYear(), today.getMonth());

	// Greedy lane assignment per week-row (sort by startCol); cap at MAX_LANES.
	const spansByRow: SpanSegment[][] = Array.from({ length: 6 }, () => []);
	for (const s of spans) spansByRow[s.row].push(s);

	const cardStyle: ViewStyle = {
		backgroundColor: t.card,
		borderRadius: radii.r,
		borderWidth: 1,
		borderColor: t.line,
		boxShadow: shadow.card,
		padding: 14,
	};

	return (
		<View style={cardStyle}>
			{/* Header: month/year + Today + prev/next nav */}
			<View style={styles.header}>
				<Text style={[styles.monthName, { color: t.ink }]}>
					{MNAMES[month]}{" "}
					<Text style={[styles.year, { color: t.faint }]}>{year}</Text>
				</Text>
				<View style={styles.navRow}>
					<Pressable
						onPress={goToday}
						style={[styles.todayBtn, { borderColor: t.line }]}
						hitSlop={6}
					>
						<Text style={[styles.todayText, { color: t.accent }]}>Today</Text>
					</Pressable>
					<Pressable
						onPress={() => shiftMonth(-1)}
						style={[styles.navBtn, { borderColor: t.line }]}
						hitSlop={6}
						accessibilityLabel="Previous month"
					>
						<ChevronLeft size={18} color={t.ink} />
					</Pressable>
					<Pressable
						onPress={() => shiftMonth(1)}
						style={[styles.navBtn, { borderColor: t.line }]}
						hitSlop={6}
						accessibilityLabel="Next month"
					>
						<ChevronRight size={18} color={t.ink} />
					</Pressable>
				</View>
			</View>

			{/* Weekday row */}
			<View style={styles.weekdayRow}>
				{DOW.map((d, i) => (
					<Text key={i} style={[styles.weekday, { color: t.faint }]}>
						{d}
					</Text>
				))}
			</View>

			{/* Grid — 6 week-row containers (per-row span overlays). */}
			{Array.from({ length: 6 }).map((_, row) => {
				const rowSpans = spansByRow[row]
					.slice()
					.sort((a, b) => a.startCol - b.startCol);
				const visibleSpans = rowSpans.slice(0, MAX_LANES);
				const overflow = rowSpans.length - visibleSpans.length;

				return (
					<View key={row} style={styles.weekRow}>
						{/* Cells */}
						{Array.from({ length: 7 }).map((__, col) => {
							const cell = cells[row * 7 + col];
							const inMonth = cell.getMonth() === month;
							const isToday = sameLocalDay(cell, today);
							const dayTasks = tasksOnDay(tasks, cell);
							const taskDots = Math.min(dayTasks.length, 2);
							const hasSingleDayProject = projectsOnDay(projects, cell).some(
								(p) => !isMultiDayProject(p)
							);

							return (
								<Pressable
									key={col}
									style={styles.cell}
									onPress={() => onDayPress(startOfLocalDay(cell.getTime()))}
								>
									<View
										style={[
											styles.dayPill,
											isToday && { backgroundColor: t.accent },
										]}
									>
										<Text
											style={[
												styles.dayNum,
												{
													color: isToday
														? "#ffffff"
														: inMonth
															? t.ink
															: t.faint,
													opacity: inMonth ? 1 : 0.45,
													fontFamily: isToday
														? fontFamily.bold
														: fontFamily.medium,
												},
											]}
										>
											{cell.getDate()}
										</Text>
									</View>
									{/* Marker dots (tasks blue, single-day project green) */}
									<View style={styles.markerRow}>
										{Array.from({ length: taskDots }).map((___, j) => (
											<View
												key={j}
												style={[styles.dot, { backgroundColor: t.accent }]}
											/>
										))}
										{hasSingleDayProject && (
											<View
												style={[styles.dot, { backgroundColor: PROJECT_GREEN }]}
											/>
										)}
									</View>
								</Pressable>
							);
						})}

						{/* Span bar overlay — below the number band; taps fall through. */}
						<View style={styles.spanOverlay} pointerEvents="none">
							{visibleSpans.map((s, lane) => {
								const leftPct = (s.startCol / 7) * 100;
								const widthPct = ((s.endCol - s.startCol + 1) / 7) * 100;
								return (
									<View
										key={`${s.project.id}-${lane}`}
										pointerEvents="none"
										style={{
											position: "absolute",
											top: TODAY_PILL + lane * (SPAN_BAR_H + 2),
											left: `${leftPct}%`,
											width: `${widthPct}%`,
											paddingHorizontal: 2,
										}}
									>
										<View
											pointerEvents="none"
											style={{
												height: SPAN_BAR_H,
												borderRadius: SPAN_BAR_H,
												backgroundColor: PROJECT_GREEN,
											}}
										/>
									</View>
								);
							})}
							{overflow > 0 && (
								<Text
									style={[
										styles.overflowText,
										{ color: t.faint, top: TODAY_PILL },
									]}
								>
									+{overflow}
								</Text>
							)}
						</View>
					</View>
				);
			})}

			{/* Legend */}
			<View style={[styles.legend, { borderTopColor: t.line }]}>
				<View style={styles.legendItem}>
					<View style={[styles.dot, { backgroundColor: t.accent }]} />
					<Text style={[styles.legendText, { color: t.sub }]}>Tasks</Text>
				</View>
				<View style={styles.legendItem}>
					<View style={[styles.legendBar, { backgroundColor: PROJECT_GREEN }]} />
					<Text style={[styles.legendText, { color: t.sub }]}>Projects</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	monthName: { fontSize: 17, fontFamily: fontFamily.bold, letterSpacing: -0.2 },
	year: { fontFamily: fontFamily.semibold },
	navRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	todayBtn: {
		borderWidth: 1,
		borderRadius: 999,
		paddingVertical: 5,
		paddingHorizontal: 12,
	},
	todayText: { fontSize: 12.5, fontFamily: fontFamily.semibold },
	navBtn: {
		width: 30,
		height: 30,
		borderRadius: 9,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	weekdayRow: { flexDirection: "row", marginBottom: 4 },
	weekday: {
		flex: 1,
		textAlign: "center",
		fontSize: 11,
		fontFamily: fontFamily.semibold,
	},
	weekRow: {
		flexDirection: "row",
		minHeight: CELL_MIN_H,
		position: "relative",
	},
	cell: {
		flex: 1,
		minHeight: CELL_MIN_H,
		alignItems: "center",
		justifyContent: "flex-start",
		paddingTop: 5,
	},
	dayPill: {
		width: TODAY_PILL,
		height: TODAY_PILL,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	dayNum: { fontSize: 14 },
	markerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		marginTop: 4,
		height: 6,
	},
	dot: {
		width: MARKER_DOT,
		height: MARKER_DOT,
		borderRadius: MARKER_DOT,
	},
	spanOverlay: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
	},
	overflowText: {
		position: "absolute",
		right: 2,
		fontSize: 9,
		fontFamily: fontFamily.semibold,
	},
	legend: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginTop: 12,
		paddingTop: 11,
		borderTopWidth: 1,
	},
	legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
	legendBar: { width: 14, height: SPAN_BAR_H, borderRadius: SPAN_BAR_H },
	legendText: { fontSize: 12, fontFamily: fontFamily.regular },
});
