import { differenceInCalendarDays, format, subDays } from "date-fns";
import {
	Building2Icon,
	CalendarIcon,
	ClockIcon,
	FileTextIcon,
	FolderOpenIcon,
	PencilIcon,
	UsersIcon,
	XIcon,
} from "lucide-react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { EventCalendarOccurrence } from "@/components/reui/event-calendar/event-calendar-types";
import { StatusBadge } from "@/components/domain/status-badge";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { AssigneeStack, type OrgUser } from "./assignee-stack";
import { KIND_BY_ID, type HomeEventData } from "./calendar-events";

export type HomeOccurrence = EventCalendarOccurrence<HomeEventData>;

interface EventSheetProps {
	occurrence: HomeOccurrence | null;
	usersById: Map<Id<"users">, OrgUser>;
	canEditTask: boolean;
	onOpenChange: (open: boolean) => void;
	onEditTask: (taskId: Id<"tasks">) => void;
	onOpenProject: (projectId: Id<"projects">) => void;
}

/** Inline dot separator between two rendered segments. */
function Dot() {
	return (
		<span
			aria-hidden="true"
			className="bg-muted-foreground/40 size-1 shrink-0 rounded-full"
		/>
	);
}

/** The "when" line: date plus (for timed events) the time range. */
function WhenDetail({ occurrence }: { occurrence: HomeOccurrence }) {
	const { start, end, allDay } = occurrence;
	// All-day ends are exclusive; step back for the inclusive last day
	// (calendar-day math, so DST transitions can't shift the day).
	const lastDay = allDay ? subDays(end, 1) : end;
	const sameDay =
		start.getFullYear() === lastDay.getFullYear() &&
		start.getMonth() === lastDay.getMonth() &&
		start.getDate() === lastDay.getDate();
	const days = allDay ? differenceInCalendarDays(lastDay, start) + 1 : 0;
	return (
		<>
			<div className="text-foreground flex flex-wrap items-center gap-x-1.5">
				<span>
					{sameDay
						? format(start, "EEEE, MMMM d")
						: `${format(start, "MMM d")} – ${format(lastDay, "MMM d")}`}
				</span>
				{!allDay && (
					<>
						<Dot />
						<span>
							{format(start, "h:mm a")} – {format(end, "h:mm a")}
						</span>
					</>
				)}
			</div>
			<div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
				<span>{allDay ? "All day" : durationLabel(start, end)}</span>
				{allDay && days > 1 && (
					<>
						<Dot />
						<span>{days} days</span>
					</>
				)}
			</div>
		</>
	);
}

function durationLabel(start: Date, end: Date): string {
	const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
	const hours = Math.floor(mins / 60);
	const rest = mins % 60;
	if (hours && rest) return `${hours}h ${rest}m`;
	if (hours) return `${hours}h`;
	return `${rest}m`;
}

/** A labeled detail row: fixed-width icon gutter + content. */
function DetailRow({
	icon,
	children,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3">
			<span
				aria-hidden="true"
				className="text-muted-foreground flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
			>
				{icon}
			</span>
			<div className="min-w-0 flex-1 text-sm">{children}</div>
		</div>
	);
}

/**
 * Read-only detail sheet for a clicked occurrence. Editing routes to the
 * shared TaskSheet (tasks) or the project's page (projects) — the calendar
 * never grows its own form.
 */
export function CalendarEventSheet({
	occurrence,
	usersById,
	canEditTask,
	onOpenChange,
	onEditTask,
	onOpenProject,
}: EventSheetProps) {
	const data = occurrence?.event.data;
	const kind = data ? KIND_BY_ID.get(data.kind) : undefined;
	return (
		<Sheet open={occurrence !== null} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				showCloseButton={false}
				className="inset-y-4 right-4 left-auto flex h-[calc(100svh-2rem)] w-[min(26rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 outline-none"
			>
				{occurrence && data && (
					<>
						{/* Header: title + status share one line. */}
						<div className="flex shrink-0 items-center gap-2.5 border-b px-5 py-3">
							<SheetTitle className="min-w-0 shrink truncate text-lg leading-tight font-semibold">
								{occurrence.event.title}
							</SheetTitle>
							<SheetDescription className="sr-only">
								Event details.
							</SheetDescription>
							<StatusBadge status={data.status} className="shrink-0" />
							{occurrence.allDay && data.kind === "task" && (
								<Badge variant="outline" className="shrink-0">
									All day
								</Badge>
							)}
							<div aria-hidden="true" className="flex-1" />
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="-me-1 shrink-0"
								onClick={() => onOpenChange(false)}
							>
								<XIcon className="size-4" aria-hidden="true" />
								<span className="sr-only">Close</span>
							</Button>
						</div>

						{/* Details */}
						<div className="min-h-0 flex-1">
							<ScrollArea className="h-full">
								<div className="flex flex-col gap-4 px-5 py-5">
									<DetailRow icon={<ClockIcon />}>
										<WhenDetail occurrence={occurrence} />
									</DetailRow>

									{kind && (
										<DetailRow icon={<CalendarIcon />}>
											<div className="flex items-center gap-2">
												<span
													aria-hidden="true"
													className="size-2.5 shrink-0 rounded-full"
													style={{ backgroundColor: kind.color }}
												/>
												<span className="text-foreground truncate">
													{data.kind === "project" ? "Project" : "Task"}
												</span>
											</div>
										</DetailRow>
									)}

									<DetailRow icon={<Building2Icon />}>
										<p className="text-foreground truncate">
											{data.clientName}
										</p>
									</DetailRow>

									{data.assigneeIds.length > 0 && (
										<DetailRow icon={<UsersIcon />}>
											<div className="flex items-center gap-2">
												<AssigneeStack
													ids={data.assigneeIds}
													usersById={usersById}
													max={5}
													size="size-6"
												/>
												<span className="text-muted-foreground truncate text-xs">
													{data.assigneeIds
														.map((id) => usersById.get(id)?.name)
														.filter(Boolean)
														.join(", ")}
												</span>
											</div>
										</DetailRow>
									)}

									{data.description && (
										<DetailRow icon={<FileTextIcon />}>
											<p className="text-foreground leading-relaxed whitespace-pre-line">
												{data.description}
											</p>
										</DetailRow>
									)}
								</div>
							</ScrollArea>
						</div>

						{/* Actions */}
						<div className="bg-muted flex shrink-0 items-center gap-2 border-t px-5 py-3">
							{data.kind === "task" && data.projectId && (
								<Button
									type="button"
									variant="outline"
									className="me-auto"
									onClick={() => onOpenProject(data.projectId!)}
								>
									<FolderOpenIcon className="size-4" aria-hidden="true" />
									Open project
								</Button>
							)}
							<Button
								type="button"
								variant="outline"
								className="ms-auto"
								onClick={() => onOpenChange(false)}
							>
								Close
							</Button>
							{data.kind === "project" ? (
								<Button
									type="button"
									onClick={() =>
										onOpenProject(occurrence.eventId as Id<"projects">)
									}
								>
									<FolderOpenIcon className="size-4" aria-hidden="true" />
									Open project
								</Button>
							) : (
								canEditTask && (
									<Button
										type="button"
										onClick={() =>
											onEditTask(occurrence.eventId as Id<"tasks">)
										}
									>
										<PencilIcon className="size-4" aria-hidden="true" />
										Edit task
									</Button>
								)
							)}
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
