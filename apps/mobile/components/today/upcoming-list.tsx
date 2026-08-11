import React from "react";
import { StyleSheet, Text } from "react-native";
import { fontFamily, recordTint, type, useTokens } from "@/lib/theme";
import { ListRow } from "@/components/ui";
import { AgendaRow } from "@/components/today/agenda-row";
import { PlanSection } from "@/components/today/plan-section";
import { ScheduleEmpty } from "@/components/today/schedule-empty";
import { dayLabel, type AgendaTask, type UpcomingDay } from "@/lib/agenda";
import { utcDayStartMs } from "@/lib/date";
import type { Assignee } from "@/components/today/day-plan";

interface UpcomingListProps {
	/** Non-empty days only, in order (see `buildUpcomingAgenda`). */
	days: UpcomingDay[];
	/** The day the list starts from — used for the "nothing until…" lead line. */
	anchorDayMs: number;
	todayMs: number;
	completedIds: Set<string>;
	updatingIds: Set<string>;
	onToggleTask: (id: string) => void;
	onOpenTask: (id: string) => void;
	onOpenProject: (id: string) => void;
	onNewTask: () => void;
	assigneeFor?: (task: AgendaTask) => Assignee | undefined;
}

/**
 * The rolling upcoming agenda — the anchored day forward two weeks, grouped by
 * day, empty days omitted. Day-level work (project spans, untimed tasks) leads
 * each group; timed rows follow in start order.
 *
 * No now separator here: this view answers "what's coming", and a now line
 * repeated inside a two-week scroll would be noise.
 */
export function UpcomingList({
	days,
	anchorDayMs,
	todayMs,
	completedIds,
	updatingIds,
	onToggleTask,
	onOpenTask,
	onOpenProject,
	onNewTask,
	assigneeFor,
}: UpcomingListProps) {
	const t = useTokens();

	if (days.length === 0) {
		return <ScheduleEmpty variant="no-work" onNewTask={onNewTask} />;
	}

	// The anchored day being empty is information — without a line, the list
	// silently opens on a later date.
	const firstLabel = dayLabel(days[0].dayMs, todayMs);
	const skipsAhead =
		utcDayStartMs(days[0].dayMs) !== utcDayStartMs(anchorDayMs);

	return (
		<>
			{skipsAhead ? (
				<Text style={[styles.lead, { color: t.sub }]}>
					Nothing scheduled until{" "}
					{firstLabel === "Tomorrow" ? "tomorrow" : firstLabel}.
				</Text>
			) : null}
			{days.map((day) => {
				const allDayCount = day.projects.length + day.anytime.length;
				const total = allDayCount + day.timed.length;
				return (
					<PlanSection
						key={day.dayMs}
						tone="day"
						label={dayLabel(day.dayMs, todayMs)}
						meta={`${total} ${total === 1 ? "job" : "jobs"}`}
					>
						{day.projects.map((p, i) => (
							<ListRow
								key={p._id}
								icon="Folder"
								iconColor={recordTint.project.fg}
								iconBg={recordTint.project.bg}
								title={p.title}
								sub={p.context}
								status={p.status}
								onPress={() => onOpenProject(p._id)}
								last={i === total - 1}
							/>
						))}
						{day.anytime.map((task, i) => (
							<AgendaRow
								key={task._id}
								task={task}
								completed={completedIds.has(task._id)}
								updating={updatingIds.has(task._id)}
								last={day.projects.length + i === total - 1}
								onToggle={() => onToggleTask(task._id)}
								onOpen={() => onOpenTask(task._id)}
								assignee={assigneeFor?.(task)}
							/>
						))}
						{day.timed.map((task, i) => (
							<AgendaRow
								key={task._id}
								task={task}
								completed={completedIds.has(task._id)}
								updating={updatingIds.has(task._id)}
								last={allDayCount + i === total - 1}
								onToggle={() => onToggleTask(task._id)}
								onOpen={() => onOpenTask(task._id)}
								assignee={assigneeFor?.(task)}
							/>
						))}
					</PlanSection>
				);
			})}
		</>
	);
}

const styles = StyleSheet.create({
	lead: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		// Sits directly above the first group; the scroll container owns the rest.
		marginBottom: -8,
	},
});
