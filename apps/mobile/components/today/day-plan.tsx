import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
	fontFamily,
	radii,
	recordTint,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { Button, ListRow } from "@/components/ui";
import { AgendaRow } from "@/components/today/agenda-row";
import type { AgendaProject, AgendaTask, DayPlan } from "@/lib/agenda";

export type Assignee = { initials: string; name: string };

interface DayPlanViewProps {
	plan: DayPlan;
	/** Multi-day/all-day project work covering this day (the ALL DAY lane). */
	projects: AgendaProject[];
	/** "10:24 AM" — rendered on the now separator. */
	nowLabel: string;
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
 * The single chronological plan for a day — ALL DAY project lane on top,
 * timed tasks in start order with a now separator and a "next up" emphasis,
 * then untimed and overdue work. One representation, list-first: the pattern
 * every field-service app (and Apple's own day-view list toggle) converges on
 * for phone-width glanceability.
 */
export function DayPlanView({
	plan,
	projects,
	nowLabel,
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
	const empty =
		projects.length === 0 &&
		timed.length === 0 &&
		anytime.length === 0 &&
		overdue.length === 0;

	if (empty) {
		return (
			<View style={[styles.empty, { borderColor: t.line }]}>
				<Text style={[styles.emptyTitle, { color: t.ink }]}>
					Nothing scheduled
				</Text>
				<Text style={[styles.emptyCopy, { color: t.sub }]}>
					This day is clear.
				</Text>
				<Button title="New task" onPress={onNewTask} style={styles.emptyAction} />
			</View>
		);
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

	const section = (label: string, children: React.ReactNode) => (
		<View style={styles.group}>
			<Text style={[styles.groupLabel, { color: t.faint }]}>{label}</Text>
			<View
				style={[
					styles.groupCard,
					{ backgroundColor: t.card, borderColor: t.line },
				]}
			>
				{children}
			</View>
		</View>
	);

	return (
		<>
			{projects.length > 0
				? section(
						"ALL DAY",
						projects.map((p, i) => (
							<ListRow
								key={p._id}
								icon="Folder"
								iconColor={recordTint.project.fg}
								iconBg={recordTint.project.bg}
								title={p.title}
								sub={p.context}
								status={p.status}
								onPress={() => onOpenProject(p._id)}
								last={i === projects.length - 1}
							/>
						)),
					)
				: null}

			{timed.length > 0
				? section(
						"SCHEDULE",
						<>
							{timed.flatMap((task, i) => [
								...(i === nowIndex
									? [<React.Fragment key="now">{nowSeparator}</React.Fragment>]
									: []),
								taskRow(task, i === timed.length - 1),
							])}
							{/* A finished schedule still shows where "now" stands. */}
							{nowIndex === timed.length ? nowSeparator : null}
						</>,
					)
				: null}

			{anytime.length > 0
				? section(
						"ANYTIME",
						anytime.map((task, i) => taskRow(task, i === anytime.length - 1)),
					)
				: null}

			{overdue.length > 0
				? section(
						"OVERDUE",
						overdue.map((task, i) => taskRow(task, i === overdue.length - 1)),
					)
				: null}
		</>
	);
}

const styles = StyleSheet.create({
	group: {
		gap: 7,
	},
	groupLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
	},
	groupCard: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
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
	empty: {
		alignItems: "center",
		gap: 4,
		borderWidth: 1,
		borderStyle: "dashed",
		borderRadius: radii.card,
		paddingVertical: 30,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	emptyCopy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	emptyAction: {
		marginTop: 12,
		alignSelf: "stretch",
	},
});
