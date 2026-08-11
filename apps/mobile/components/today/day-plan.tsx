import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, recordTint, type, useTokens } from "@/lib/theme";
import { ListRow } from "@/components/ui";
import { AgendaRow } from "@/components/today/agenda-row";
import { PlanSection } from "@/components/today/plan-section";
import {
	ScheduleEmpty,
	type ScheduleEmptyVariant,
} from "@/components/today/schedule-empty";
import { isWeekend, type AgendaProject, type AgendaTask, type DayPlan } from "@/lib/agenda";

export type Assignee = { initials: string; name: string };

interface DayPlanViewProps {
	plan: DayPlan;
	/** The anchored day (UTC-midnight date-id) — drives the empty-state variant. */
	dayMs: number;
	/** Project spans covering this day (the ALL DAY band). */
	projects: AgendaProject[];
	/** "10:24 AM" — rendered on the now separator. */
	nowLabel: string;
	/** True when the whole rolling window is empty, not just this day. */
	windowEmpty: boolean;
	completedIds: Set<string>;
	updatingIds: Set<string>;
	onToggleTask: (id: string) => void;
	onOpenTask: (id: string) => void;
	onOpenProject: (id: string) => void;
	onNewTask: () => void;
	/** Team scope: resolves a task to its assignee chip. Undefined in Me scope. */
	assigneeFor?: (task: AgendaTask) => Assignee | undefined;
}

/**
 * The anchored day's timeline — an ALL DAY band on top (project spans plus
 * untimed tasks: work that owns the day but not a slot in it), then timed rows
 * in start order with the now separator and a "next up" emphasis, then overdue
 * spillover. List-first: the pattern every field-service app converges on for
 * phone-width glanceability.
 *
 * The now separator is placed by `buildDayPlan`, which only sets `nowIndex`
 * when the anchored day IS today — browsing another day needs no extra guard.
 */
export function DayPlanView({
	plan,
	dayMs,
	projects,
	nowLabel,
	windowEmpty,
	completedIds,
	updatingIds,
	onToggleTask,
	onOpenTask,
	onOpenProject,
	onNewTask,
	assigneeFor,
}: DayPlanViewProps) {
	const t = useTokens();
	const { timed, anytime, overdue, nextUpId, nowIndex } = plan;
	const allDayCount = projects.length + anytime.length;
	const empty = allDayCount === 0 && timed.length === 0 && overdue.length === 0;

	if (empty) {
		const variant: ScheduleEmptyVariant = windowEmpty
			? "no-work"
			: isWeekend(dayMs)
				? "day-off"
				: "clear-day";
		return <ScheduleEmpty variant={variant} onNewTask={onNewTask} />;
	}

	const nowSeparator = (
		<View style={styles.nowRow} accessibilityLabel={`Now, ${nowLabel}`}>
			<View style={[styles.nowDot, { backgroundColor: t.primarySolid }]} />
			<View style={[styles.nowLine, { backgroundColor: t.primarySolid }]} />
			<Text style={[styles.nowLabel, { color: t.frostedInk }]}>
				Now · {nowLabel}
			</Text>
		</View>
	);

	const taskRow = (task: AgendaTask, last: boolean) => {
		const row = (
			<AgendaRow
				key={task._id}
				task={task}
				completed={completedIds.has(task._id)}
				updating={updatingIds.has(task._id)}
				last={last}
				onToggle={() => onToggleTask(task._id)}
				onOpen={() => onOpenTask(task._id)}
				assignee={assigneeFor?.(task)}
			/>
		);
		if (task._id !== nextUpId) return row;
		// "Next up" carries its state on a SOLID rail — frosted washes composite
		// too close to the card to indicate anything (see design notes).
		return (
			<View
				key={task._id}
				style={[
					styles.nextUp,
					{ borderLeftColor: t.primarySolid, backgroundColor: t.secondary },
				]}
			>
				{row}
			</View>
		);
	};

	return (
		<>
			{allDayCount > 0 ? (
				<PlanSection label="All day">
					{projects.map((p, i) => (
						<ListRow
							key={p._id}
							icon="Folder"
							iconColor={recordTint.project.fg}
							iconBg={recordTint.project.bg}
							title={p.title}
							sub={p.context}
							status={p.status}
							onPress={() => onOpenProject(p._id)}
							last={i === allDayCount - 1}
						/>
					))}
					{anytime.map((task, i) =>
						taskRow(task, projects.length + i === allDayCount - 1),
					)}
				</PlanSection>
			) : null}

			{timed.length > 0 ? (
				<PlanSection label="Schedule">
					{timed.flatMap((task, i) => [
						...(i === nowIndex
							? [<React.Fragment key="now">{nowSeparator}</React.Fragment>]
							: []),
						taskRow(task, i === timed.length - 1),
					])}
					{/* A finished schedule still shows where "now" stands. */}
					{nowIndex === timed.length ? nowSeparator : null}
				</PlanSection>
			) : null}

			{overdue.length > 0 ? (
				<PlanSection label="Overdue">
					{overdue.map((task, i) => taskRow(task, i === overdue.length - 1))}
				</PlanSection>
			) : null}
		</>
	);
}

const styles = StyleSheet.create({
	nowRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingLeft: 14,
		paddingRight: 14,
		paddingVertical: 7,
	},
	nowDot: {
		width: 7,
		height: 7,
		borderRadius: 3.5,
	},
	nowLine: {
		flex: 1,
		height: 2,
		borderRadius: 1,
		opacity: 0.35,
	},
	nowLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
	},
	nextUp: {
		borderLeftWidth: 3,
	},
});
