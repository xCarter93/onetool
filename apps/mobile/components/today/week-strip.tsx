import React, { useMemo, useRef, useState } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	type LayoutChangeEvent,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
} from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
	fontFamily,
	radii,
	touch,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { weekDaysFor, workloadBar } from "@/lib/agenda";
import { DAY_MS } from "@/components/calendar/dateUtils";
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
	/**
	 * Shift the week by `direction` (-1 back, +1 forward). Without this the strip
	 * is a one-way trip: it is derived from the selection, so jumping to a day in
	 * an adjacent week rolls the whole strip there with no way back.
	 */
	onPageWeek?: (direction: -1 | 1) => void;
}

/**
 * The persistent week strip under Today's greeting. It is the agenda's date
 * lens and a passive weekly-workload read via the per-day bars.
 *
 * Paging is a real 3-page horizontal pager (prev | current | next) so a swipe
 * tracks the finger. After a page settles, `onPageWeek` moves the selection and
 * the `key` remount snaps the pager back to the center page showing the same
 * week the user just landed on — visually continuous, no repositioning flash.
 */
export function WeekStrip({
	days,
	selectedDayMs,
	todayMs,
	counts,
	onSelectDay,
	onPageWeek,
}: WeekStripProps) {
	const t = useTokens();
	const scrollRef = useRef<ScrollView>(null);
	const [pageWidth, setPageWidth] = useState(0);
	const selected = utcDayStartMs(selectedDayMs);
	const today = utcDayStartMs(todayMs);
	// Busiest day IN VIEW sets the scale, so the bars are a shape for the week.
	const maxCount = useMemo(
		() => days.reduce((m, d) => Math.max(m, counts.get(d) ?? 0), 0),
		[days, counts],
	);

	const onDaysLayout = (e: LayoutChangeEvent) => {
		const { width } = e.nativeEvent.layout;
		setPageWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
	};

	const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		if (!onPageWeek || pageWidth <= 0) return;
		const page = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
		if (page === 1) return;
		onPageWeek(page > 1 ? 1 : -1);
	};

	// Chevrons drive the same pager animation as a swipe; the commit happens in
	// onMomentumScrollEnd, which iOS fires for animated scrollTo (this app ships
	// iOS-only — revisit if Android lands, where that event is unreliable).
	const pageBy = (direction: -1 | 1) => {
		if (pageWidth <= 0) {
			onPageWeek?.(direction);
			return;
		}
		scrollRef.current?.scrollTo({
			x: pageWidth * (1 + direction),
			animated: true,
		});
	};

	const arrow = (direction: -1 | 1) => (
		<Pressable
			onPress={() => pageBy(direction)}
			style={styles.arrow}
			accessibilityRole="button"
			accessibilityLabel={direction === -1 ? "Previous week" : "Next week"}
		>
			{direction === -1 ? (
				<ChevronLeft size={18} color={t.sub} />
			) : (
				<ChevronRight size={18} color={t.sub} />
			)}
		</Pressable>
	);

	const renderWeek = (weekDays: number[], isCenter: boolean) => (
		<View
			style={[styles.week, { width: pageWidth }]}
			// tablist wraps only the interactive center page — the flanking pages
			// are a visual preview until they settle.
			accessibilityRole={isCenter ? "tablist" : undefined}
		>
			{weekDays.map((dayMs) => {
				const isSelected = isCenter && dayMs === selected;
				const isToday = dayMs === today;
				const d = new Date(dayMs);
				const count = counts.get(dayMs) ?? 0;
				const bar = workloadBar(count, maxCount);
				const label = `${DOW[d.getUTCDay()]} ${d.getUTCDate()}`;

				return (
					<Pressable
						key={dayMs}
						accessibilityRole="tab"
						accessibilityState={{ selected: isSelected }}
						accessibilityLabel={[
							isToday ? `Today, ${label}` : label,
							// The bar encodes workload but is invisible to a screen reader.
							count > 0 ? `${count} ${count === 1 ? "task" : "tasks"}` : "no tasks",
						].join(", ")}
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
						{/* Slot height is reserved whether or not a bar draws, so cells
						    never shift. */}
						<View style={styles.barTrack}>
							{bar > 0 ? (
								<View
									style={[
										styles.bar,
										{
											width: `${bar * 100}%`,
											backgroundColor: isSelected ? "#ffffff" : t.dot,
										},
									]}
								/>
							) : null}
						</View>
					</Pressable>
				);
			})}
		</View>
	);

	// Adjacent weeks are derived from the current one; their workload bars fill
	// in once the task subscription follows the settled selection.
	const pages: { key: string; days: number[]; center: boolean }[] = [
		{ key: "prev", days: weekDaysFor(days[0] - 7 * DAY_MS), center: false },
		{ key: "center", days, center: true },
		{ key: "next", days: weekDaysFor(days[0] + 7 * DAY_MS), center: false },
	];

	return (
		<View style={styles.strip}>
			{onPageWeek ? arrow(-1) : null}
			<View style={styles.days} onLayout={onDaysLayout}>
				{pageWidth > 0 ? (
					onPageWeek ? (
						<ScrollView
							ref={scrollRef}
							// Remount when the week changes: the pager reappears centered on
							// the new week with zero offset math or repositioning flicker.
							key={days[0]}
							horizontal
							pagingEnabled
							showsHorizontalScrollIndicator={false}
							contentOffset={{ x: pageWidth, y: 0 }}
							onMomentumScrollEnd={onMomentumEnd}
						>
							{pages.map((p) => (
								<React.Fragment key={p.key}>
									{renderWeek(p.days, p.center)}
								</React.Fragment>
							))}
						</ScrollView>
					) : (
						renderWeek(days, true)
					)
				) : null}
			</View>
			{onPageWeek ? arrow(1) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	strip: {
		flexDirection: "row",
		alignItems: "center",
		paddingTop: 4,
		paddingBottom: 14,
	},
	days: {
		flex: 1,
		// Reserve the strip's height before the pager mounts (it waits on layout),
		// so the controls block doesn't jump on first paint.
		minHeight: touch.min,
	},
	week: {
		flexDirection: "row",
		gap: 4,
	},
	// Narrow on purpose: the 7 day cells own the width. Painted height carries
	// the 44pt target (RN will not hit-test slop outside the parent).
	arrow: {
		width: 26,
		minHeight: touch.min,
		alignItems: "center",
		justifyContent: "center",
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
		fontSize: type.micro,
		letterSpacing: tracking.groupLabel,
	},
	num: {
		fontSize: 15,
		marginTop: 2,
	},
	// Reserved slot: a quiet day must not shift its neighbours upward.
	barTrack: {
		height: 3,
		alignSelf: "stretch",
		marginHorizontal: 7,
		marginTop: 5,
		justifyContent: "center",
	},
	bar: {
		height: 3,
		borderRadius: radii.pill,
		alignSelf: "center",
	},
});
