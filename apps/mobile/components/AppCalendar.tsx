import React, { memo, useCallback, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { colors, fontFamily, radius, spacing } from "@/lib/theme";
import { dateIdFromUtcMs, utcMsFromDateId } from "@/lib/date";

// Date <-> YYYY-MM-DD via the shared UTC-safe helpers so the calendar, the task
// form, and the list all share one convention matching the backend's Date.UTC storage.
export function toDateId(date: Date): string {
	return dateIdFromUtcMs(date.getTime());
}

export function fromDateId(dateId: string): Date {
	return new Date(utcMsFromDateId(dateId));
}

// Project colors - frosted glass style
const PROJECT_COLORS = {
	inProgress: "rgba(249, 115, 22, 0.35)", // Frosted orange
	completed: "rgba(34, 197, 94, 0.35)", // Frosted green
};

// Event types for marking
export interface CalendarTask {
	id: string;
	date: string; // YYYY-MM-DD
	title: string;
	color?: string;
}

export interface CalendarProject {
	id: string;
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	title: string;
	status?: "in_progress" | "completed" | "not_started";
	color?: string;
}

interface AppCalendarProps {
	/** The currently selected date */
	selectedDate?: string;
	/** Callback when a date is pressed */
	onDateSelect?: (dateId: string) => void;
	/** Callback when the visible month changes */
	onMonthChange?: (monthDateId: string) => void;
	/** Tasks to show as dots on the calendar */
	tasks?: CalendarTask[];
	/** Projects to show as period markings on the calendar */
	projects?: CalendarProject[];
	/** Minimum selectable date */
	minDate?: string;
	/** Maximum selectable date */
	maxDate?: string;
	/** Whether to hide navigation arrows */
	hideArrows?: boolean;
	/** Initial month to display (YYYY-MM-DD format) */
	initialMonth?: string;
}

// Calendar theme matching app design - with circle outline for selected date
const calendarTheme = {
	backgroundColor: colors.card,
	calendarBackground: colors.card,
	textSectionTitleColor: colors.mutedForeground,
	textSectionTitleDisabledColor: colors.muted,
	// Selected date - transparent background with primary text (we'll add border via customStyle)
	selectedDayBackgroundColor: "transparent",
	selectedDayTextColor: colors.primary,
	todayTextColor: colors.primary,
	todayBackgroundColor: "transparent",
	dayTextColor: colors.foreground,
	textDisabledColor: colors.muted,
	dotColor: colors.primary,
	selectedDotColor: colors.primary,
	arrowColor: colors.foreground,
	disabledArrowColor: colors.muted,
	monthTextColor: colors.foreground,
	indicatorColor: colors.primary,
	textDayFontFamily: fontFamily.regular,
	textMonthFontFamily: fontFamily.semibold,
	textDayHeaderFontFamily: fontFamily.medium,
	textDayFontSize: 14,
	textMonthFontSize: 16,
	textDayHeaderFontSize: 12,
	"stylesheet.calendar.header": {
		week: {
			marginTop: spacing.xs,
			flexDirection: "row",
			justifyContent: "space-around",
			borderBottomWidth: 1,
			borderBottomColor: colors.border,
			paddingBottom: spacing.sm,
		},
	},
};

export const AppCalendar = memo(function AppCalendar({
	selectedDate,
	onDateSelect,
	onMonthChange,
	tasks = [],
	projects = [],
	minDate,
	maxDate,
	hideArrows = false,
	initialMonth,
}: AppCalendarProps) {
	const today = useMemo(() => toDateId(new Date()), []);

	// Track the currently displayed month internally to prevent jumping
	const [displayedMonth, setDisplayedMonth] = useState(
		initialMonth || selectedDate || today
	);

	// Generate marked dates from tasks and projects
	const markedDates = useMemo(() => {
		const marks: Record<string, any> = {};

		// Add project period markings
		projects.forEach((project, projectIndex) => {
			const start = fromDateId(project.startDate);
			const end = fromDateId(project.endDate);

			// Determine project color based on status
			let projectColor: string;
			if (project.color) {
				projectColor = project.color;
			} else if (project.status === "completed") {
				projectColor = PROJECT_COLORS.completed;
			} else {
				projectColor = PROJECT_COLORS.inProgress;
			}

			let current = new Date(start);
			while (current <= end) {
				const dateId = toDateId(current);
				const isStart = dateId === project.startDate;
				const isEnd = dateId === project.endDate;

				if (!marks[dateId]) {
					marks[dateId] = {
						periods: [{
							startingDay: isStart,
							endingDay: isEnd,
							color: projectColor,
						}],
						textColor: colors.foreground,
					};
				} else {
					// Add this project as a new period (supports multiple overlapping projects)
					if (!marks[dateId].periods) {
						// Convert old format to new periods format
						marks[dateId] = {
							periods: [
								{
									startingDay: marks[dateId].startingDay || false,
									endingDay: marks[dateId].endingDay || false,
									color: marks[dateId].color || projectColor,
								},
								{
									startingDay: isStart,
									endingDay: isEnd,
									color: projectColor,
								}
							],
							textColor: colors.foreground,
						};
					} else {
						marks[dateId].periods.push({
							startingDay: isStart,
							endingDay: isEnd,
							color: projectColor,
						});
					}
				}

				current.setDate(current.getDate() + 1);
			}
		});

		// Add task dot markings
		tasks.forEach((task) => {
			const dateId = task.date;
			const taskColor = task.color || colors.primary;

			if (!marks[dateId]) {
				marks[dateId] = {
					marked: true,
					dotColor: taskColor,
				};
			} else {
				// Add dot to existing marking
				marks[dateId] = {
					...marks[dateId],
					marked: true,
					dotColor: taskColor,
				};
			}
		});

		// Add selected date marking - circle outline style
		if (selectedDate) {
			if (!marks[selectedDate]) {
				marks[selectedDate] = {
					selected: true,
					selectedColor: "rgba(0, 166, 244, 0.15)", // Light primary background
					selectedTextColor: colors.primary, // Primary color text
					customStyles: {
						container: {
							borderWidth: 2,
							borderColor: colors.primary,
							borderRadius: 16,
						},
						text: {
							color: colors.primary,
							fontFamily: fontFamily.semibold,
						},
					},
				};
			} else {
				marks[selectedDate] = {
					...marks[selectedDate],
					selected: true,
					selectedColor: "rgba(0, 166, 244, 0.15)",
					selectedTextColor: colors.foreground, // Keep text visible on period
					customStyles: {
						container: {
							borderWidth: 2,
							borderColor: colors.primary,
							borderRadius: 16,
						},
						text: {
							color: colors.foreground,
							fontFamily: fontFamily.semibold,
						},
					},
				};
			}
		}

		return marks;
	}, [tasks, projects, selectedDate]);

	// Handle day press
	const handleDayPress = useCallback(
		(day: DateData) => {
			if (onDateSelect) {
				onDateSelect(day.dateString);
			}
		},
		[onDateSelect]
	);

	// Handle month change - update internal state and notify parent
	const handleMonthChange = useCallback(
		(month: DateData) => {
			setDisplayedMonth(month.dateString);
			// Notify parent so it can adjust data fetching
			onMonthChange?.(month.dateString);
		},
		[onMonthChange]
	);

	return (
		<View style={styles.container}>
			<Calendar
				key="app-calendar"
				current={displayedMonth}
				onDayPress={handleDayPress}
				onMonthChange={handleMonthChange}
				markedDates={markedDates}
				markingType={projects.length > 0 ? "multi-period" : "dot"}
				minDate={minDate}
				maxDate={maxDate}
				hideArrows={hideArrows}
				enableSwipeMonths={true}
				theme={calendarTheme as any}
				style={styles.calendar}
			/>
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
		overflow: "hidden",
	},
	calendar: {
		borderRadius: radius.md,
	},
});
