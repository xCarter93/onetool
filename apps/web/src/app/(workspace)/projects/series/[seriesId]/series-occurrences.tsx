"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, RotateCcw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import type { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge, type StatusRole } from "@/components/domain/status-badge";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	DataGrid,
	DataGridContainer,
	dataGridFeatures,
	type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import { formatVisitDate, stateLabel } from "../../components/recurrence/labels";
import {
	AssigneeStack,
	type OrgUser,
} from "../../../home/components/calendar/assignee-stack";

// Same vocabulary as the visit page's billing panel; unknown states render no badge.
const BILLING_STATE: Record<string, { label: string; role: StatusRole }> = {
	needs_setup: { label: "Needs setup", role: "neutral" },
	ready: { label: "Ready to bill", role: "info" },
	allocated: { label: "Invoice created", role: "success" },
	held: { label: "Awaiting approval", role: "warning" },
	review: { label: "Needs decision", role: "warning" },
	deferred: { label: "Deferred", role: "neutral" },
	nonbillable: { label: "Not billed", role: "neutral" },
};

export function SeriesOccurrences({
	seriesId,
	canManage,
	seriesIsActive,
}: {
	seriesId: Id<"projectSeries">;
	canManage: boolean;
	seriesIsActive: boolean;
}) {
	const toast = useToast();
	const [cursor, setCursor] = useState<string | undefined>();
	const [previousCursors, setPreviousCursors] = useState<
		Array<string | undefined>
	>([]);
	const [pendingVisitId, setPendingVisitId] = useState<Id<"projects"> | null>(
		null
	);
	const occurrences = useQuery(api.projectSeries.listOccurrences, {
		seriesId,
		cursor,
	});
	const orgUsers = useQuery(api.users.listByOrg, {});
	const usersById = useMemo(
		() => new Map<Id<"users">, OrgUser>(orgUsers?.map((u) => [u._id, u])),
		[orgUsers]
	);
	const skip = useMutation(api.projectSeries.skip);
	const restoreVisit = useMutation(api.projectSeries.restoreVisit);

	const runVisitAction = async (
		projectId: Id<"projects">,
		action: "skip" | "restore"
	) => {
		if (pendingVisitId) return;
		setPendingVisitId(projectId);
		try {
			if (action === "skip") {
				await skip({ projectId });
				toast.success(
					"Visit skipped",
					"Removed from the active schedule. Future dates are unchanged."
				);
			} else {
				await restoreVisit({ projectId });
				toast.success("Visit restored", "This visit is active again.");
			}
		} catch (error) {
			toast.error(
				action === "skip" ? "Skip failed" : "Restore failed",
				convexErrorMessage(error, "Try again.")
			);
		} finally {
			setPendingVisitId(null);
		}
	};

	const rows = occurrences?.page ?? [];
	const billing = occurrences?.billing;
	const columns: ColumnDef<DataGridFeatures, Doc<"projects">>[] = [
		{
			accessorKey: "title",
			header: "Project",
			cell: ({ row }) => (
				<Link
					href={`/projects/${row.original._id}`}
					className="font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{row.original.title}
				</Link>
			),
		},
		{
			accessorKey: "startDate",
			header: "Date",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{formatVisitDate(row.original.startDate)}
				</span>
			),
		},
		{
			id: "crew",
			header: "Crew",
			cell: ({ row }) => {
				const ids = row.original.assignedUserIds ?? [];
				if (ids.length > 0 && orgUsers === undefined)
					return <Skeleton className="h-6 w-28" />;
				const names = ids
					.map((id) => usersById.get(id)?.name)
					.filter((name): name is string => Boolean(name));
				if (names.length === 0)
					return <span className="text-muted-foreground">Unassigned</span>;
				return (
					<div className="flex items-center gap-2">
						<AssigneeStack ids={ids} usersById={usersById} size="size-6" />
						<span className="text-muted-foreground min-w-0 truncate">
							{names.length === 1 ? names[0] : `${names.length} assigned`}
						</span>
					</div>
				);
			},
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<StatusBadge status={row.original.status} appearance="outline">
					{stateLabel(row.original.status)}
				</StatusBadge>
			),
		},
		{
			id: "seriesState",
			header: "Recurrence",
			cell: ({ row }) => (
				<StatusBadge role="neutral" appearance="outline">
					{row.original.recurringState
						? stateLabel(row.original.recurringState)
						: "Recurring"}
				</StatusBadge>
			),
		},
		...(billing
			? [
					{
						id: "billing",
						header: "Billing",
						cell: ({ row }) => {
							const state = billing[row.original._id];
							const badge = state && BILLING_STATE[state.state];
							if (!badge) return null;
							return (
								<StatusBadge
									role={badge.role}
									appearance="outline"
									title={state.reason}
								>
									{badge.label}
								</StatusBadge>
							);
						},
					} satisfies ColumnDef<DataGridFeatures, Doc<"projects">>,
				]
			: []),
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const projectId = row.original._id;
				const busy = pendingVisitId !== null;
				return (
					<div className="flex justify-end gap-2">
						{canManage && occurrences?.skippableIds.includes(projectId) && (
							<Button
								size="sm"
								variant="outline"
								disabled={busy}
								onClick={() => void runVisitAction(projectId, "skip")}
							>
								Skip visit
							</Button>
						)}
						{canManage &&
							seriesIsActive &&
							occurrences?.restorableIds.includes(projectId) && (
								<Button
									size="sm"
									variant="outline"
									disabled={busy}
									onClick={() => void runVisitAction(projectId, "restore")}
								>
									<RotateCcw className="size-4" /> Restore
								</Button>
							)}
					</div>
				);
			},
		},
	];
	const table = useTable({ features: dataGridFeatures, data: rows, columns });

	return (
		<Frame>
			<FrameHeader>
				<FrameTitle>Occurrences</FrameTitle>
				<FrameDescription>
					Each visit is a separate project with its own work history.
				</FrameDescription>
			</FrameHeader>
			<FramePanel className="p-0">
				{occurrences === undefined ? (
					<div className="space-y-3 p-4">
						{Array.from({ length: 5 }, (_, index) => (
							<Skeleton key={index} className="h-12" />
						))}
					</div>
				) : rows.length === 0 ? (
					<EmptyState
						icon={<CalendarDays />}
						title="No visits yet"
						description="Future visits appear here as they are scheduled."
					/>
				) : (
					<DataGrid
						table={table}
						recordCount={rows.length}
						tableLayout={{ width: "auto", headerBackground: true }}
					>
						<DataGridContainer>
							<DataGridTable />
						</DataGridContainer>
					</DataGrid>
				)}
				{occurrences && (previousCursors.length > 0 || !occurrences.isDone) && (
					<div className="flex justify-between border-t p-4">
						<Button
							variant="outline"
							disabled={previousCursors.length === 0}
							onClick={() => {
								setCursor(previousCursors.at(-1));
								setPreviousCursors(previousCursors.slice(0, -1));
							}}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							disabled={occurrences.isDone}
							onClick={() => {
								setPreviousCursors((history) => [...history, cursor]);
								setCursor(occurrences.continueCursor);
							}}
						>
							Next
						</Button>
					</div>
				)}
			</FramePanel>
		</Frame>
	);
}
