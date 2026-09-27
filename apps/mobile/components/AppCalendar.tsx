import React, { memo, useCallback, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import { fontFamily, radii, useTokens } from "@/lib/theme";
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
	const t = useTokens();
	const today = useMemo(() => toDateId(new Date()), []);

	// Web-aligned calendar theme — selected day fills `primary`, today gets a
	// `brand` marker (frame.indicator), not the selected treatment.
	const calendarTheme = useMemo(
		() => ({
			backgroundColor: t.card,
			calendarBackground: t.card,
			textSectionTitleColor: t.sub,
			textSectionTitleDisabledColor: t.sub,
			selectedDayBackgroundColor: t.primary,
			selectedDayTextColor: "#ffffff",
			todayTextColor: t.brand,
			todayBackgroundColor: "transparent",
			dayTextColor: t.ink,
			textDisabledColor: t.sub,
			dotColor: t.primary,
			selectedDotColor: "#ffffff",
			arrowColor: t.ink,
			disabledArrowColor: t.sub,
			monthTextColor: t.ink,
			indicatorColor: t.primary,
			textDayFontFamily: fontFamily.regular,
			textMonthFontFamily: fontFamily.semibold,
			textDayHeaderFontFamily: fontFamily.medium,
			textDayFontSize: 14,
			textMonthFontSize: 16,
			textDayHeaderFontSize: 12,
			"stylesheet.calendar.header": {
				week: {
					marginTop: 4,
					flexDirection: "row",
					justifyContent: "space-around",
					borderBottomWidth: 1,
					borderBottomColor: t.line,
					paddingBottom: 8,
				},
			},
		}),
		[t]
	);

	const styles = useMemo(
		() =>
			StyleSheet.create({
				container: {
					backgroundColor: t.card,
					borderRadius: radii.lg,
					padding: 8,
					borderWidth: 1,
					borderColor: t.line,
					overflow: "hidden",
				},
				calendar: {
					borderRadius: radii.lg,
				},
			}),
		[t]
	);

	// Track the currently displayed month internally to prevent jumping
	const [displayedMonth, setDisplayedMonth] = useState(
		initialMonth || selectedDate || today
	);

	// Generate marked dates from tasks and projects
	const markedDates = useMemo(() => {
		const marks: Record<string, any> = {};

		// Add project period markings
		projects.forEach((project) => {
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
						textColor: t.ink,
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
							textColor: t.ink,
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
			const taskColor = task.color || t.accent;

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

		// Add selected date marking — web's 4px-radius solid fill.
		if (selectedDate) {
			marks[selectedDate] = {
				...marks[selectedDate],
				selected: true,
				selectedColor: t.primary,
				selectedTextColor: "#ffffff",
				customStyles: {
					container: {
						backgroundColor: t.primary,
						borderRadius: radii.ctrl,
					},
					text: {
						color: "#ffffff",
						fontFamily: fontFamily.semibold,
					},
				},
			};
		}

		// Today gets a `brand` dot marker, not the selected treatment, unless
		// it's also the selected date.
		if (today !== selectedDate) {
			marks[today] = {
				...marks[today],
				customStyles: {
					...marks[today]?.customStyles,
					text: {
						...marks[today]?.customStyles?.text,
						color: t.brand,
						fontFamily: fontFamily.semibold,
					},
				},
			};
		}

		return marks;
	}, [tasks, projects, selectedDate, today, t]);

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
