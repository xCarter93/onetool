import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	type DimensionValue,
} from "react-native";
import { CalendarClock, Check } from "lucide-react-native";
import type { AgendaTask } from "@/lib/agenda";
import { utcDayStartMs } from "@/lib/date";
import {
	BLOCK_META_MIN_HEIGHT,
	CHECKBOX_MIN_HEIGHT,
	HOUR_HEIGHT,
	clockLabel,
	hourLabel,
	initialScrollOffset,
	layoutDay,
	nowLineOffset,
	type TimelineBlock,
} from "@/lib/timeline";
import {
	STATUS,
	badgeTone,
	fontFamily,
	radii,
	recordTint,
	spacing,
	touch,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";

interface DayTimelineProps {
	/** UTC-midnight ms of the day being rendered. */
	dayMs: number;
	/** Tasks already scoped to this day by the caller. */
	tasks: AgendaTask[];
	/** UTC-midnight ms of today — the now-line renders only when dayMs === todayMs. */
	todayMs: number;
	/** Minutes since midnight, for the now-line. Caller owns the clock. */
	nowMinutes: number;
	onPressTask: (id: string) => void;
	onToggleComplete: (id: string) => void;
	completedIds: Set<string>;
	updatingIds: Set<string>;
}

/** Left gutter holding the hour labels. */
const GUTTER = 52;
/** Bottom breathing room under the last hour rule. */
const GRID_TAIL = 28;
const CHECKBOX = 22;
const RAIL = 3;
/** Inset between adjacent columns so overlapping blocks read as separate. */
const COLUMN_GAP = 3;

const DONE_STATUSES = new Set(["completed", "cancelled"]);

// Semantic block color comes from the shared maps only. `pending` is the ABSENCE
// of signal, so it takes the neutral task record tint instead of STATUS's warn
// tone — otherwise a normal day is wall-to-wall amber.
function toneFor(
	status: string | undefined,
	isDone: boolean,
): { fg: string; bg: string } {
	if (isDone) return badgeTone.ok;
	const entry =
		status && status !== "pending"
			? STATUS[status as keyof typeof STATUS]
			: undefined;
	return entry ? badgeTone[entry.tone] : recordTint.task;
}

const columnLeft = (index: number, count: number): DimensionValue =>
	`${(index / count) * 100}%`;
const columnWidth = (count: number): DimensionValue => `${100 / count}%`;

/**
 * The Today tab's Timeline view mode: a proportional hour grid for one day.
 *
 * Timed work is painted as absolutely-positioned blocks (see `lib/timeline.ts`
 * for all the geometry) so gaps and overlaps are visible at a glance; overlapping
 * jobs split the width into columns. Untimed work sits in a labelled strip above
 * the grid rather than being dropped.
 *
 * Owns its own ScrollView so it can anchor on "now" (or the first job) at mount —
 * give it a bounded height (`flex: 1`), never a ScrollView parent.
 */
export function DayTimeline({
	dayMs,
	tasks,
	todayMs,
	nowMinutes,
	onPressTask,
	onToggleComplete,
	completedIds,
	updatingIds,
}: DayTimelineProps) {
	const t = useTokens();
	const scrollRef = useRef<ScrollView>(null);

	const day = utcDayStartMs(dayMs);
	const isToday = day === utcDayStartMs(todayMs);
	// The clock widens the window only for today — browsing Thursday at 21:30
	// must not stretch Thursday's grid for a line that is never drawn.
	const layout = useMemo(
		() => layoutDay(tasks, isToday ? nowMinutes : undefined),
		[tasks, isToday, nowMinutes],
	);
	const nowOffset = isToday ? nowLineOffset(nowMinutes, layout.range) : null;

	// Mount anchor is frozen so a clock tick can never yank the user's scroll
	// position back to "now". `contentOffset` applies it before first paint.
	const [initialOffset] = useState(() => initialScrollOffset(layout, nowOffset));
	const scrolledDayRef = useRef(day);

	// Re-anchor only when the caller swaps in a different day; the guard makes the
	// per-minute `nowOffset` churn a no-op.
	useEffect(() => {
		if (scrolledDayRef.current === day) return;
		scrolledDayRef.current = day;
		scrollRef.current?.scrollTo({
			y: initialScrollOffset(layout, nowOffset),
			animated: false,
		});
	}, [day, layout, nowOffset]);

	const hours: number[] = [];
	for (let h = layout.range.startHour; h <= layout.range.endHour; h++) {
		hours.push(h);
	}

	if (layout.blocks.length === 0 && layout.untimed.length === 0) {
		return (
			<View style={styles.empty}>
				<View style={[styles.emptyTile, { backgroundColor: t.muted }]}>
					<CalendarClock size={26} color={t.faint} />
				</View>
				<Text style={[styles.emptyTitle, { color: t.ink }]}>
					Nothing scheduled
				</Text>
				<Text style={[styles.emptyBody, { color: t.sub }]}>
					No work on this day. Anything you add with a start time shows up here on
					the hour grid.
				</Text>
			</View>
		);
	}

	return (
		<View style={styles.root}>
			{layout.untimed.length > 0 && (
				<View
					style={[
						styles.untimed,
						{ backgroundColor: t.card, borderColor: t.line },
					]}
				>
					<Text style={[styles.eyebrow, { color: t.faint }]}>ANYTIME</Text>
					<View style={styles.chips}>
						{layout.untimed.map((task) => {
							const isDone =
								completedIds.has(task._id) ||
								DONE_STATUSES.has(task.status ?? "");
							return (
								<Pressable
									key={task._id}
									onPress={() => onPressTask(task._id)}
									accessibilityRole="button"
									accessibilityLabel={`Anytime, ${task.title}${
										isDone ? ", completed" : ""
									}`}
									style={[styles.chip, { borderColor: t.line }]}
								>
									<CompleteBox
										size={CHECKBOX}
										isDone={isDone}
										isUpdating={updatingIds.has(task._id)}
										borderColor={t.checkbox}
										fillColor={t.primarySolid}
										spinnerColor={t.sub}
										title={task.title}
										onPress={() => onToggleComplete(task._id)}
									/>
									<Text
										numberOfLines={1}
										style={[
											styles.chipTitle,
											{ color: isDone ? t.sub : t.ink },
											isDone && styles.strike,
										]}
									>
										{task.title}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
			)}

			<ScrollView
				ref={scrollRef}
				style={[styles.grid, { backgroundColor: t.card, borderColor: t.line }]}
				contentContainerStyle={{ height: layout.gridHeight + GRID_TAIL }}
				contentOffset={{ x: 0, y: initialOffset }}
				showsVerticalScrollIndicator={false}
			>
				{/* Hour chrome — neutral by decision; the grid is not the content. */}
				{hours.map((hour) => {
					const y = (hour - layout.range.startHour) * HOUR_HEIGHT;
					return (
						<View key={hour} style={[styles.hourRow, { top: y }]}>
							<Text style={[styles.hourLabel, { color: t.faint }]} numberOfLines={1}>
								{hourLabel(hour)}
							</Text>
							<View style={[styles.rule, { backgroundColor: t.lineSoft }]} />
						</View>
					);
				})}

				<View style={styles.blockLayer}>
					{layout.blocks.map((block) => (
						<Block
							key={block.task._id}
							block={block}
							isDone={
								completedIds.has(block.task._id) ||
								DONE_STATUSES.has(block.task.status ?? "")
							}
							isUpdating={updatingIds.has(block.task._id)}
							onPressTask={onPressTask}
							onToggleComplete={onToggleComplete}
						/>
					))}
				</View>

				{nowOffset !== null && (
					<View
						style={[styles.nowRow, { top: nowOffset }]}
						pointerEvents="none"
						accessible
						accessibilityLabel={`Now, ${clockLabel(nowMinutes)}`}
					>
						<Text
							style={[
								styles.nowLabel,
								{ color: t.danger, backgroundColor: t.card },
							]}
							numberOfLines={1}
						>
							{clockLabel(nowMinutes)}
						</Text>
						<View style={[styles.nowDot, { backgroundColor: t.danger }]} />
						<View style={[styles.nowLine, { backgroundColor: t.danger }]} />
					</View>
				)}
			</ScrollView>
		</View>
	);
}

function Block({
	block,
	isDone,
	isUpdating,
	onPressTask,
	onToggleComplete,
}: {
	block: TimelineBlock;
	isDone: boolean;
	isUpdating: boolean;
	onPressTask: (id: string) => void;
	onToggleComplete: (id: string) => void;
}) {
	const t = useTokens();
	const { task, height } = block;
	const tone = toneFor(task.status, isDone);
	const showMeta = height >= BLOCK_META_MIN_HEIGHT && Boolean(task.context);
	// A block shorter than this cannot host a checkbox at all — tapping it opens
	// the task, and the Agenda view mode carries the full-size checkbox.
	const showBox = height >= CHECKBOX_MIN_HEIGHT;
	const timeText = `${clockLabel(block.startMinutes)} – ${clockLabel(
		block.endMinutes,
	)}`;

	return (
		<Pressable
			onPress={() => onPressTask(task._id)}
			hitSlop={{
				top: block.hitSlopTop,
				bottom: block.hitSlopBottom,
				left: 0,
				right: 0,
			}}
			accessibilityRole="button"
			accessibilityLabel={[
				timeText,
				task.title,
				task.context,
				isDone ? "completed" : undefined,
			]
				.filter(Boolean)
				.join(", ")}
			accessibilityHint="Opens the task"
			style={[
				styles.block,
				{
					top: block.top,
					height,
					left: columnLeft(block.columnIndex, block.columnCount),
					width: columnWidth(block.columnCount),
				},
			]}
		>
			<View style={[styles.blockInner, { backgroundColor: tone.bg }]}>
				<View style={[styles.rail, { backgroundColor: tone.fg }]} />
				<View style={styles.blockBody}>
					<Text
						numberOfLines={1}
						style={[
							styles.blockTitle,
							{ color: isDone ? t.sub : t.ink },
							isDone && styles.strike,
						]}
					>
						{task.title}
					</Text>
					{showMeta && (
						<Text numberOfLines={1} style={[styles.blockMeta, { color: t.sub }]}>
							{task.context}
						</Text>
					)}
				</View>
				{showBox && (
					<CompleteBox
						size={CHECKBOX}
						isDone={isDone}
						isUpdating={isUpdating}
						borderColor={tone.fg}
						fillColor={t.primarySolid}
						spinnerColor={tone.fg}
						title={task.title}
						onPress={() => onToggleComplete(task._id)}
					/>
				)}
			</View>
		</Pressable>
	);
}

/** Shared checkbox — matches AgendaRow's convention (box + white check + strike). */
function CompleteBox({
	size,
	isDone,
	isUpdating,
	borderColor,
	fillColor,
	spinnerColor,
	title,
	onPress,
}: {
	size: number;
	isDone: boolean;
	isUpdating: boolean;
	borderColor: string;
	fillColor: string;
	spinnerColor: string;
	title: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={isUpdating}
			hitSlop={10}
			accessibilityRole="checkbox"
			accessibilityState={{ checked: isDone, disabled: isUpdating }}
			accessibilityLabel={`${isDone ? "Mark not complete" : "Mark complete"}: ${title}`}
			style={[
				styles.box,
				{
					width: size,
					height: size,
					borderColor: isDone ? fillColor : borderColor,
					backgroundColor: isDone ? fillColor : "transparent",
				},
			]}
		>
			{isUpdating ? (
				<ActivityIndicator size="small" color={isDone ? "#ffffff" : spinnerColor} />
			) : isDone ? (
				<Check size={14} color="#ffffff" strokeWidth={3} />
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		gap: 10,
	},

	// --- Anytime strip ---------------------------------------------------------
	untimed: {
		borderWidth: 1,
		borderRadius: radii.card,
		paddingHorizontal: 10,
		paddingTop: 8,
		paddingBottom: 10,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
		marginBottom: 6,
	},
	chips: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: touch.min,
		maxWidth: "100%",
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 10,
	},
	chipTitle: {
		flexShrink: 1,
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},

	// --- Hour grid ------------------------------------------------------------
	grid: {
		flex: 1,
		borderWidth: 1,
		borderRadius: radii.card,
	},
	hourRow: {
		position: "absolute",
		left: 0,
		right: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		// Half the label's line height, so the label straddles its own rule.
		marginTop: -7,
		height: 14,
	},
	hourLabel: {
		width: GUTTER - 10,
		textAlign: "right",
		fontFamily: fontFamily.medium,
		fontSize: type.micro,
		lineHeight: 14,
	},
	rule: {
		flex: 1,
		height: StyleSheet.hairlineWidth,
		marginLeft: 10,
	},
	blockLayer: {
		position: "absolute",
		left: GUTTER,
		right: spacing.sm,
		top: 0,
		bottom: 0,
	},
	block: {
		position: "absolute",
	},
	blockInner: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginRight: COLUMN_GAP,
		borderRadius: radii.sm,
		paddingRight: 6,
		overflow: "hidden",
	},
	rail: {
		alignSelf: "stretch",
		width: RAIL,
	},
	blockBody: {
		flex: 1,
		minWidth: 0,
	},
	blockTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
		lineHeight: 14,
	},
	blockMeta: {
		fontFamily: fontFamily.regular,
		fontSize: type.micro,
		lineHeight: 13,
		marginTop: 1,
	},
	strike: {
		textDecorationLine: "line-through",
	},
	box: {
		borderRadius: radii.sm,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},

	// --- Now indicator --------------------------------------------------------
	nowRow: {
		position: "absolute",
		left: 0,
		right: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		marginTop: -7,
		height: 14,
	},
	nowLabel: {
		width: GUTTER - 10,
		textAlign: "right",
		fontFamily: fontFamily.semibold,
		fontSize: type.micro,
		lineHeight: 14,
	},
	nowDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		marginLeft: 4,
	},
	nowLine: {
		flex: 1,
		height: 1.5,
	},

	// --- Empty ----------------------------------------------------------------
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.lg,
		paddingVertical: 48,
	},
	emptyTile: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
		marginBottom: 4,
	},
	emptyBody: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		lineHeight: 18,
		textAlign: "center",
	},
});
