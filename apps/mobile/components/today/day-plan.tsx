import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, recordTint, type, useTokens } from "@/lib/theme";
import { Panel } from "@/components/canvas";
import { ListRow } from "@/components/ui";
import { AgendaRow } from "@/components/today/agenda-row";
import {
	NextUpCard,
	NextUpProjectCard,
} from "@/components/today/next-up-card";
import { GroupLabel } from "@/components/today/plan-section";
import {
	ScheduleEmpty,
	type ScheduleEmptyVariant,
} from "@/components/today/schedule-empty";
import {
	isWeekend,
	selectNextUp,
	selectNextUpProject,
	type AgendaProject,
	type AgendaTask,
	type DayPlan,
} from "@/lib/agenda";

export type Assignee = { initials: string; name: string };

interface DayPlanViewProps {
	plan: DayPlan;
	/** The anchored day (UTC-midnight date-id) — drives the empty-state variant. */
	dayMs: number;
	/** Anchored to the real today — gates both card variants. */
	isToday: boolean;
	/** Project spans covering this day (the ALL DAY band). */
	projects: AgendaProject[];
	/** "10:24 AM" — rendered on the now separator. */
	nowLabel: string;
	/** Local minutes-since-midnight, for the next-up card's countdown chip. */
	nowMinutes: number;
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

/** "3 jobs · 1 done" — the day's stats echo, from rows already on screen. */
function sectionMeta(tasks: readonly AgendaTask[], done: Set<string>): string {
	const n = tasks.length;
	const finished = tasks.filter((task) => done.has(task._id)).length;
	const label = `${n} ${n === 1 ? "job" : "jobs"}`;
	return finished > 0 ? `${label} · ${finished} done` : label;
}

/**
 * The anchored day's timeline. The first still-open timed job is lifted OUT of
 * the list into the "Next up" card — it is the day's lead object, so it gets the
 * moment below the hero and is never duplicated in the rows beneath. Then an ALL
 * DAY band (project spans plus untimed tasks: work that owns the day but not a
 * slot in it), the remaining timed rows with the now separator, then overdue
 * spillover.
 *
 * `selectNextUp` only yields a card when the anchored day IS today, and the now
 * separator's `nowIndex` comes back re-based onto the shortened list — browsing
 * another day needs no extra guard in here.
 */
export function DayPlanView({
	plan,
	dayMs,
	isToday,
	projects,
	nowLabel,
	nowMinutes,
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
	const { anytime, overdue } = plan;
	const { next, timed, nowIndex } = selectNextUp(plan, completedIds);
	// Project-visit fallback: a timed-empty plan has nowIndex -1 even today, so
	// the today gate comes from the screen, not from selectNextUp.
	const nextProject =
		!next && isToday ? selectNextUpProject(projects) : null;
	// The lead is never duplicated below — same rule as the timed card.
	const bandProjects = nextProject
		? projects.filter((p) => p._id !== nextProject._id)
		: projects;
	const allDayCount = bandProjects.length + anytime.length;
	// Emptiness is judged on the WHOLE day, before the lead is split off.
	const empty =
		projects.length === 0 && anytime.length === 0 && plan.timed.length === 0 && overdue.length === 0;

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

	// Every row's own bottom border is suppressed (last=true) — the shared
	// `Panel` below draws the dividers between ALL of them, group labels
	// included, so the day reads as one bordered timeline, not three boxes.
	const taskRow = (task: AgendaTask) => (
		<AgendaRow
			key={task._id}
			task={task}
			completed={completedIds.has(task._id)}
			updating={updatingIds.has(task._id)}
			last
			onToggle={() => onToggleTask(task._id)}
			onOpen={() => onOpenTask(task._id)}
			assignee={assigneeFor?.(task)}
		/>
	);

	return (
		<>
			{next ? (
				<NextUpCard
					task={next}
					updating={updatingIds.has(next._id)}
					nowMinutes={nowMinutes}
					onToggle={() => onToggleTask(next._id)}
					onOpen={() => onOpenTask(next._id)}
					assignee={assigneeFor?.(next)}
				/>
			) : nextProject ? (
				<NextUpProjectCard
					project={nextProject}
					onOpen={() => onOpenProject(nextProject._id)}
				/>
			) : null}

			<Panel>
				{allDayCount > 0 ? (
					<GroupLabel
						label="All day"
						meta={`${allDayCount} ${allDayCount === 1 ? "item" : "items"}`}
						inset
					/>
				) : null}
				{bandProjects.map((p) => (
					<ListRow
						key={p._id}
						icon="Folder"
						iconColor={recordTint.project.fg}
						iconBg={recordTint.project.bg}
						title={p.title}
						sub={p.context}
						status={p.status}
						onPress={() => onOpenProject(p._id)}
						last
					/>
				))}
				{anytime.map((task) => taskRow(task))}

				{timed.length > 0 ? (
					<GroupLabel label="Schedule" meta={sectionMeta(timed, completedIds)} inset />
				) : null}
				{timed.flatMap((task, i) => [
					...(i === nowIndex
						? [<React.Fragment key="now">{nowSeparator}</React.Fragment>]
						: []),
					taskRow(task),
				])}
				{/* A finished schedule still shows where "now" stands. */}
				{nowIndex === timed.length ? nowSeparator : null}

				{overdue.length > 0 ? (
					<GroupLabel
						label="Overdue"
						meta={`${overdue.length} ${overdue.length === 1 ? "job" : "jobs"}`}
						inset
					/>
				) : null}
				{overdue.map((task) => taskRow(task))}
			</Panel>
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
});
