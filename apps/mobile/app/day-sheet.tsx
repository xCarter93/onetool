import { View, StyleSheet } from "react-native";
import { useState } from "react";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useTokens } from "@/lib/theme";
import { DaySheet } from "@/components/calendar/DaySheet";
import {
	startOfLocalDay,
	nextLocalDayStart,
} from "@/components/calendar/dateUtils";

// Day-detail form-sheet route — same native sheet type as /org-switch (chrome in
// _layout.tsx). Owns the single-day getCalendarEvents query, the tasks.complete
// mutation, and the optimistic Sets; DaySheet renders the content.
export default function DaySheetRoute() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const params = useLocalSearchParams<{ dayTs?: string }>();
	const dayTs = params.dayTs ? Number(params.dayTs) : null;

	const [completedTaskIds, setCompletedTaskIds] = useState<Set<Id<"tasks">>>(
		new Set(),
	);
	const [updating, setUpdating] = useState<Set<Id<"tasks">>>(new Set());
	const completeTask = useMutation(api.tasks.complete);

	// Single-day window — getCalendarEvents returns events overlapping it, so
	// multi-day projects that span this day are included.
	const calendarArgs =
		dayTs == null
			? ("skip" as const)
			: {
					startDate: startOfLocalDay(dayTs),
					endDate: nextLocalDayStart(dayTs) - 1,
				};
	const events = useQuery(api.calendar.getCalendarEvents, calendarArgs);

	// Optimistic complete (Pattern 4 / T-20-07): flip + mark in-flight, then call
	// the mutation; NEVER dismiss the sheet (the reactive query keeps the row
	// visible with completed styling). Roll back the flip on throw.
	const handleCompleteTask = async (taskId: Id<"tasks">) => {
		if (completedTaskIds.has(taskId)) return;
		setCompletedTaskIds((prev) => new Set(prev).add(taskId));
		setUpdating((prev) => new Set(prev).add(taskId));
		try {
			await completeTask({ id: taskId });
		} catch {
			setCompletedTaskIds((prev) => {
				const next = new Set(prev);
				next.delete(taskId);
				return next;
			});
		} finally {
			setUpdating((prev) => {
				const next = new Set(prev);
				next.delete(taskId);
				return next;
			});
		}
	};

	// Project row: dismiss the sheet, then navigate to the project.
	const handleProjectPress = (id: Id<"projects">) => {
		router.back();
		router.push(`/projects/${id}` as Href);
	};

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom },
			]}
		>
			<DaySheet
				dayTs={dayTs}
				projects={events?.projects ?? []}
				tasks={events?.tasks ?? []}
				onClose={() => router.back()}
				onProjectPress={handleProjectPress}
				onCompleteTask={handleCompleteTask}
				completedTaskIds={completedTaskIds}
				updating={updating}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
});
