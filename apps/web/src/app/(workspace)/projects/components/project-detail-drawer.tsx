"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	CalendarClock,
	ExternalLink,
	FileText,
	FolderKanban,
	ListChecks,
	Plus,
	Receipt,
	Users,
} from "lucide-react";

import { Badge } from "@/components/reui/badge";
import {
	Timeline,
	TimelineContent,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
	TimelineTitle,
} from "@/components/reui/timeline";
import { StyledButton } from "@/components/ui/styled";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TaskSheet } from "@/components/shared/task-sheet";
import { useToast } from "@/hooks/use-toast";
import {
	DetailDrawer,
	DrawerField,
	DrawerFieldGrid,
	DrawerSection,
} from "@/components/shared/detail-drawer";

type ProjectStatus = Doc<"projects">["status"];

const STATUS_LABEL: Record<ProjectStatus, string> = {
	planned: "Planned",
	"in-progress": "In Progress",
	completed: "Completed",
	cancelled: "Cancelled",
};

const STATUS_BADGE: Record<
	ProjectStatus,
	React.ComponentProps<typeof Badge>["variant"]
> = {
	planned: "secondary",
	"in-progress": "warning-light",
	completed: "success-light",
	cancelled: "destructive-light",
};

const STATUS_ORDER: ProjectStatus[] = [
	"planned",
	"in-progress",
	"completed",
	"cancelled",
];

function formatDate(ts: number | null | undefined): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatCurrency(n: number): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(n);
}

function formatActivityTime(ts: number): string {
	return new Date(ts).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

// Share of the start→due window that has elapsed, or null if not schedulable.
// Reads the clock inside a module helper so the component render stays pure.
function getScheduleElapsedPct(
	startDate: number | null,
	endDate: number | null
): number | null {
	if (!startDate || !endDate) return null;
	if (endDate <= startDate) return 100;
	const pct = ((Date.now() - startDate) / (endDate - startDate)) * 100;
	return Math.min(100, Math.max(0, pct));
}

function initials(name: string): string {
	return (
		name
			.split(" ")
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

export interface ProjectDetailDrawerProps {
	projectId: Id<"projects"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ProjectDetailDrawer({
	projectId,
	open,
	onOpenChange,
}: ProjectDetailDrawerProps) {
	const router = useRouter();
	const preview = useQuery(
		api.projects.getPreview,
		projectId ? { id: projectId } : "skip"
	);

	const loading = projectId !== null && preview === undefined;
	const notFound = projectId !== null && preview === null;
	const data = preview ?? null;
	const project = data?.project ?? null;

	const openRecord = () => {
		if (!projectId) return;
		onOpenChange(false);
		router.push(`/projects/${projectId}`);
	};

	// Share of the start→due window that has elapsed (schedule hero).
	const schedulePct = getScheduleElapsedPct(
		project?.startDate ?? null,
		project?.endDate ?? null
	);

	const title = project?.title ?? (loading ? "Loading…" : "Project");

	return (
		<DetailDrawer
			open={open}
			onOpenChange={onOpenChange}
			eyebrow={
				project?.projectNumber ? `Project #${project.projectNumber}` : "Project"
			}
			icon={
				<span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
					<FolderKanban className="size-4" />
				</span>
			}
			title={title}
			badge={
				project ? (
					<Badge variant={STATUS_BADGE[project.status]} size="lg">
						{STATUS_LABEL[project.status]}
					</Badge>
				) : null
			}
			description={
				data
					? `${data.client?.companyName ?? "No client"} · ${
							project?.projectType === "recurring" ? "Recurring" : "One-off"
						}`
					: undefined
			}
			actions={
				<>
					<StyledButton
						intent="primary"
						size="sm"
						icon={<ExternalLink className="size-3.5" />}
						label="Open project"
						showArrow={false}
						onClick={openRecord}
					/>
					<TaskSheet
						mode="create"
						initialValues={{
							projectId: projectId ?? undefined,
							clientId: data?.client?._id,
						}}
						trigger={
							<StyledButton
								intent="outline"
								size="sm"
								icon={<Plus className="size-3.5" />}
								label="Add Task"
								showArrow={false}
							/>
						}
					/>
				</>
			}
		>
			{loading ? (
				<DrawerSkeleton />
			) : notFound ? (
				<p className="text-muted-foreground p-5 text-sm">Project not found</p>
			) : !data || !project ? (
				<DrawerSkeleton />
			) : (
				<>
					{/* Schedule hero */}
					<DrawerSection>
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<CalendarClock className="size-4" />
							<span>Schedule</span>
						</div>
						<div className="flex items-start justify-between">
							<div className="flex flex-col">
								<span className="text-muted-foreground text-xs">Start</span>
								<span className="text-foreground text-sm font-medium">
									{formatDate(project.startDate)}
								</span>
							</div>
							<div className="flex flex-col text-right">
								<span className="text-muted-foreground text-xs">Due</span>
								<span className="text-foreground text-sm font-medium">
									{formatDate(project.endDate)}
								</span>
							</div>
						</div>
						{schedulePct !== null ? (
							<div className="flex flex-col gap-1.5">
								<Progress value={schedulePct} className="h-1.5" />
								<span className="text-muted-foreground text-xs">
									{project.completedAt
										? `Completed ${formatDate(project.completedAt)}`
										: `${Math.round(schedulePct)}% of timeline elapsed`}
								</span>
							</div>
						) : null}
					</DrawerSection>

					{/* Status control */}
					<DrawerSection label="Status">
						<StatusControl
							key={project.status}
							projectId={project._id}
							currentStatus={project.status}
						/>
					</DrawerSection>

					{/* Description */}
					{project.description ? (
						<DrawerSection label="Description">
							<p className="text-foreground text-sm whitespace-pre-wrap">
								{project.description}
							</p>
						</DrawerSection>
					) : null}

					{/* Details */}
					<DrawerSection label="Details">
						<DrawerFieldGrid>
							<DrawerField label="Client">
								{data.client?.companyName ?? "—"}
							</DrawerField>
							<DrawerField label="Address">
								{data.client?.address ?? "—"}
							</DrawerField>
							<DrawerField label="Type">
								{project.projectType === "recurring" ? "Recurring" : "One-off"}
							</DrawerField>
							<DrawerField label="Project #">
								{project.projectNumber ?? "—"}
							</DrawerField>
							<DrawerField label="Created">
								{formatDate(project.createdAt)}
							</DrawerField>
							{project.completedAt ? (
								<DrawerField label="Completed">
									{formatDate(project.completedAt)}
								</DrawerField>
							) : null}
						</DrawerFieldGrid>
					</DrawerSection>

					{/* Assigned To */}
					<DrawerSection label="Assigned To">
						{data.assignees.length ? (
							<div className="flex items-center gap-2.5">
								<div className="flex -space-x-2">
									{data.assignees.slice(0, 5).map((a) => (
										<Avatar
											key={a._id}
											className="ring-background size-7 ring-2"
										>
											<AvatarFallback className="text-[0.625rem]">
												{initials(a.name)}
											</AvatarFallback>
										</Avatar>
									))}
								</div>
								<span className="text-muted-foreground text-sm">
									{data.assignees.length === 1
										? data.assignees[0].name
										: `${data.assignees.length} assigned`}
								</span>
							</div>
						) : (
							<p className="text-muted-foreground flex items-center gap-2 text-sm">
								<Users className="size-4" /> No one assigned
							</p>
						)}
					</DrawerSection>

					{/* Related */}
					<DrawerSection label="Related">
						<div className="flex flex-col gap-2.5">
							<RelatedRow
								icon={<FileText className="size-4" />}
								label="Quotes"
								count={data.related.quotes.count}
								value={formatCurrency(data.related.quotes.total)}
								valueLabel="quoted"
							/>
							<RelatedRow
								icon={<Receipt className="size-4" />}
								label="Invoices"
								count={data.related.invoices.count}
								value={formatCurrency(data.related.invoices.outstanding)}
								valueLabel="outstanding"
							/>
							<RelatedRow
								icon={<ListChecks className="size-4" />}
								label="Tasks"
								count={data.related.tasks.count}
								value={`${data.related.tasks.open} open`}
							/>
						</div>
					</DrawerSection>

					{/* Activity (last 7 days) */}
					<DrawerSection label="Activity">
						{data.activities.length ? (
							<Timeline defaultValue={data.activities.length}>
								{data.activities.map((activity, index) => (
									<TimelineItem
										key={activity._id}
										step={index + 1}
										className="pb-5! last:pb-0!"
									>
										<TimelineSeparator className="bg-border!" />
										<TimelineIndicator className="bg-primary size-2.5! border-primary!" />
										<TimelineTitle className="text-foreground text-sm font-normal leading-snug">
											{activity.description}
										</TimelineTitle>
										<TimelineContent className="text-xs">
											{formatActivityTime(activity.timestamp)} ·{" "}
											{activity.userName}
										</TimelineContent>
									</TimelineItem>
								))}
							</Timeline>
						) : (
							<p className="text-muted-foreground text-sm">
								No activity in the last 7 days
							</p>
						)}
					</DrawerSection>
				</>
			)}
		</DetailDrawer>
	);
}

/**
 * Status Select with a save-when-dirty button. State initializes from the
 * project's current status; the parent keys this by status so it re-seeds after
 * a save, and the Sheet unmounts it on close so it re-seeds on reopen.
 */
function StatusControl({
	projectId,
	currentStatus,
}: {
	projectId: Id<"projects">;
	currentStatus: ProjectStatus;
}) {
	const updateProject = useMutation(api.projects.update);
	const toast = useToast();
	const [status, setStatus] = React.useState<ProjectStatus>(currentStatus);
	const [saving, setSaving] = React.useState(false);
	const dirty = status !== currentStatus;

	const handleSave = async () => {
		if (!dirty) return;
		setSaving(true);
		try {
			await updateProject({ id: projectId, status });
		} catch (err) {
			console.error("Failed to update project status:", err);
			toast.error("Couldn't update project", "Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<div className="flex items-center gap-2">
				<Select
					value={status}
					onValueChange={(v) => setStatus(v as ProjectStatus)}
				>
					<SelectTrigger className="h-9 flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUS_ORDER.map((s) => (
							<SelectItem key={s} value={s}>
								{STATUS_LABEL[s]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{dirty ? (
					<StyledButton
						intent="primary"
						size="sm"
						label={saving ? "Saving…" : "Save"}
						showArrow={false}
						disabled={saving}
						onClick={handleSave}
					/>
				) : null}
			</div>
			{dirty ? (
				<p className="text-warning text-xs">Unsaved status change</p>
			) : null}
		</>
	);
}

function RelatedRow({
	icon,
	label,
	count,
	value,
	valueLabel,
}: {
	icon: React.ReactNode;
	label: string;
	count: number;
	value: string;
	valueLabel?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2.5">
				<span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
					{icon}
				</span>
				<div className="flex flex-col">
					<span className="text-foreground text-sm font-medium">{label}</span>
					<span className="text-muted-foreground text-xs">{count} total</span>
				</div>
			</div>
			<div className="flex flex-col items-end">
				<span className="text-foreground text-sm font-medium tabular-nums">
					{value}
				</span>
				{valueLabel ? (
					<span className="text-muted-foreground text-xs">{valueLabel}</span>
				) : null}
			</div>
		</div>
	);
}

function DrawerSkeleton() {
	return (
		<div className="flex flex-col gap-5 p-5">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="flex flex-col gap-2">
					<div className="bg-muted h-3 w-24 animate-pulse rounded" />
					<div className="bg-muted h-8 w-full animate-pulse rounded" />
				</div>
			))}
		</div>
	);
}
