"use client";

import { CalendarDays, FolderKanban } from "lucide-react";
import type { ToolRendererProps } from "./index";

// Mirrors getSchedule's output shape in convex/assistantTools.ts. Dates are
// ISO YYYY-MM-DD strings; historical threads replay older outputs where the
// same fields were epoch ms, so both are accepted.
type DayValue = string | number;

interface ScheduleOutput {
	projects: Array<{
		id: string;
		title: string;
		startDate?: DayValue;
		endDate?: DayValue;
		status: string;
		clientName: string;
	}>;
	tasks: Array<{
		id: string;
		title: string;
		date?: DayValue;
		startTime?: string;
		endTime?: string;
		status: string;
		clientName: string;
	}>;
}

const ROW_CAP = 8;

// Task/project dates are stored at UTC-midnight — format in UTC, never local.
// (ISO day strings parse as UTC midnight.)
function formatDay(day: DayValue) {
	return new Date(day).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function dayMs(day: DayValue | undefined) {
	if (day === undefined) return 0;
	return typeof day === "number" ? day : Date.parse(day);
}

function Row({
	primary,
	secondary,
	when,
}: {
	primary: string;
	secondary?: string;
	when: string;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5">
			<div className="min-w-0">
				<p className="truncate text-sm text-foreground">{primary}</p>
				{secondary && (
					<p className="truncate text-xs text-muted-foreground">{secondary}</p>
				)}
			</div>
			<span className="shrink-0 text-xs text-muted-foreground">{when}</span>
		</div>
	);
}

function OverflowNote({ hidden }: { hidden: number }) {
	if (hidden <= 0) return null;
	return (
		<p className="pt-1 text-xs text-muted-foreground">+{hidden} more</p>
	);
}

export function ScheduleRenderer({ output }: ToolRendererProps) {
	const schedule = output as ScheduleOutput;
	const tasks = Array.isArray(schedule?.tasks) ? schedule.tasks : [];
	const projects = Array.isArray(schedule?.projects) ? schedule.projects : [];

	if (tasks.length === 0 && projects.length === 0) {
		return (
			<div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
				Nothing scheduled in that range.
			</div>
		);
	}

	const sortedTasks = [...tasks].sort((a, b) => dayMs(a.date) - dayMs(b.date));
	const sortedProjects = [...projects].sort(
		(a, b) => dayMs(a.startDate) - dayMs(b.startDate)
	);

	return (
		<div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
			{sortedTasks.length > 0 && (
				<div>
					<div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						<CalendarDays className="size-3" />
						Tasks
					</div>
					<div className="divide-y divide-border/60">
						{sortedTasks.slice(0, ROW_CAP).map((task) => (
							<Row
								key={task.id}
								primary={task.title}
								secondary={task.clientName}
								when={
									task.date === undefined
										? (task.startTime ?? "")
										: task.startTime
											? `${formatDay(task.date)} · ${task.startTime}`
											: formatDay(task.date)
								}
							/>
						))}
					</div>
					<OverflowNote hidden={sortedTasks.length - ROW_CAP} />
				</div>
			)}
			{sortedProjects.length > 0 && (
				<div className={sortedTasks.length > 0 ? "mt-3" : undefined}>
					<div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						<FolderKanban className="size-3" />
						Projects
					</div>
					<div className="divide-y divide-border/60">
						{sortedProjects.slice(0, ROW_CAP).map((project) => (
							<Row
								key={project.id}
								primary={project.title}
								secondary={project.clientName}
								when={
									project.startDate
										? project.endDate && project.endDate !== project.startDate
											? `${formatDay(project.startDate)} – ${formatDay(project.endDate)}`
											: formatDay(project.startDate)
										: project.status
								}
							/>
						))}
					</div>
					<OverflowNote hidden={sortedProjects.length - ROW_CAP} />
				</div>
			)}
		</div>
	);
}
