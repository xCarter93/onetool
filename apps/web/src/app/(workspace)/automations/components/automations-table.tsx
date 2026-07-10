"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	type ColumnDef,
	type PaginationState,
	type SortingState,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { ArrowRight, Pencil, Power, PowerOff, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { DataGrid } from "@/components/ui/data-grid";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridColumnHeader } from "@/components/ui/data-grid-column-header";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/notification-utils";
import { ManualRunButton } from "./manual-run-button";
import {
	STATUS_BADGE,
	actionNodeCount,
	effectiveStatus,
	formatObjectType,
	getObjectTypeBadgeVariant,
	triggerObjectType,
	triggerTypeOf,
} from "../lib/automation-display";

type Automation = Doc<"workflowAutomations">;

export function AutomationsTable() {
	const router = useRouter();
	const toast = useToast();
	const automations = useQuery(api.automations.list);
	const toggleActive = useMutation(api.automations.toggleActive);
	const removeAutomation = useMutation(api.automations.remove);

	const [search, setSearch] = useState("");
	const [pendingDelete, setPendingDelete] = useState<{
		id: Id<"workflowAutomations">;
		name: string;
	} | null>(null);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const handleToggle = useCallback(
		async (id: Id<"workflowAutomations">) => {
			try {
				await toggleActive({ id });
			} catch (error) {
				toast.error(
					"Couldn't update automation",
					error instanceof Error
						? error.message
						: "Failed to change the automation status"
				);
			}
		},
		[toggleActive, toast]
	);

	const handleEdit = useCallback(
		(id: string) => router.push(`/automations/editor?id=${id}`),
		[router]
	);

	const confirmDelete = useCallback(async () => {
		if (!pendingDelete) return;
		try {
			await removeAutomation({ id: pendingDelete.id });
			toast.success(
				"Automation deleted",
				`"${pendingDelete.name}" has been deleted.`
			);
			setPendingDelete(null);
		} catch {
			toast.error("Error", "Failed to delete automation");
		}
	}, [pendingDelete, removeAutomation, toast]);

	const columns = useMemo<ColumnDef<Automation>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => (
					<DataGridColumnHeader title="Name" column={column} />
				),
				size: 260,
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="font-medium text-foreground">
							{row.original.name}
						</span>
						{row.original.description && (
							<span className="text-muted-foreground line-clamp-1 text-xs">
								{row.original.description}
							</span>
						)}
					</div>
				),
			},
			{
				id: "trigger",
				header: "Trigger",
				enableSorting: false,
				size: 220,
				cell: ({ row }) => {
					const objectType = triggerObjectType(row.original);
					const triggerType = triggerTypeOf(row.original);
					const trigger =
						row.original.publishedSnapshot?.trigger ?? row.original.trigger;
					const toStatus =
						"toStatus" in trigger ? (trigger.toStatus as string) : undefined;
					return (
						<div className="flex items-center gap-2">
							{objectType && (
								<Badge variant={getObjectTypeBadgeVariant(objectType)}>
									{formatObjectType(objectType)}
								</Badge>
							)}
							{toStatus ? (
								<>
									<ArrowRight className="size-3 text-muted-foreground" />
									<span className="text-sm text-muted-foreground">
										{toStatus}
									</span>
								</>
							) : triggerType && triggerType !== "status_changed" ? (
								<span className="text-sm text-muted-foreground capitalize">
									{triggerType.replace(/_/g, " ")}
								</span>
							) : null}
						</div>
					);
				},
			},
			{
				id: "steps",
				accessorFn: (a) => actionNodeCount(a),
				header: ({ column }) => (
					<DataGridColumnHeader title="Steps" column={column} />
				),
				size: 90,
				cell: ({ row }) => {
					const count = actionNodeCount(row.original);
					return (
						<span className="text-sm text-foreground">
							{count} action{count === 1 ? "" : "s"}
						</span>
					);
				},
			},
			{
				accessorKey: "triggerCount",
				header: ({ column }) => (
					<DataGridColumnHeader title="Runs" column={column} />
				),
				size: 80,
				cell: ({ row }) => (
					<span className="text-sm tabular-nums text-foreground">
						{(row.original.triggerCount ?? 0).toLocaleString()}
					</span>
				),
			},
			{
				accessorKey: "lastTriggeredAt",
				header: ({ column }) => (
					<DataGridColumnHeader title="Last run" column={column} />
				),
				size: 130,
				cell: ({ row }) =>
					row.original.lastTriggeredAt ? (
						<span className="text-sm text-muted-foreground">
							{formatRelativeTime(row.original.lastTriggeredAt)}
						</span>
					) : (
						<span className="text-sm text-muted-foreground">Never</span>
					),
			},
			{
				id: "status",
				header: "Status",
				enableSorting: false,
				size: 140,
				cell: ({ row }) => {
					const status = effectiveStatus(row.original);
					const badge = STATUS_BADGE[status];
					return (
						<div className="flex items-center gap-2">
							<Badge variant={badge.variant}>{badge.label}</Badge>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => handleToggle(row.original._id)}
								aria-label={
									status === "active"
										? `Pause ${row.original.name}`
										: `Activate ${row.original.name}`
								}
							>
								{status === "active" ? (
									<PowerOff className="size-3.5" />
								) : (
									<Power className="size-3.5" />
								)}
							</Button>
						</div>
					);
				},
			},
			{
				id: "actions",
				header: "",
				enableSorting: false,
				size: 150,
				cell: ({ row }) => (
					<div className="flex items-center justify-end gap-2">
						{effectiveStatus(row.original) === "active" && (
							<ManualRunButton
								automationId={row.original._id}
								automationName={row.original.name}
								objectType={triggerObjectType(row.original)}
								triggerType={triggerTypeOf(row.original)}
							/>
						)}
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => handleEdit(row.original._id)}
							aria-label={`Edit ${row.original.name}`}
						>
							<Pencil className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() =>
								setPendingDelete({
									id: row.original._id,
									name: row.original.name,
								})
							}
							className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
							aria-label={`Delete ${row.original.name}`}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				),
			},
		],
		[handleToggle, handleEdit]
	);

	const data = useMemo(() => {
		const all = automations ?? [];
		const q = search.trim().toLowerCase();
		if (!q) return all;
		return all.filter(
			(a) =>
				a.name.toLowerCase().includes(q) ||
				(a.description?.toLowerCase().includes(q) ?? false)
		);
	}, [automations, search]);

	// Reset to the first page whenever the search narrows the result set.
	useEffect(() => {
		setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
	}, [search]);

	const table = useReactTable({
		data,
		columns,
		pageCount: Math.max(1, Math.ceil(data.length / pagination.pageSize)),
		state: { sorting, pagination },
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getRowId: (row) => row._id,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<>
			<DataGrid
				table={table}
				recordCount={data.length}
				isLoading={automations === undefined}
				emptyMessage={
					search ? "No automations match your search." : "No automations yet."
				}
				tableLayout={{ dense: true, headerSticky: true }}
			>
				<Frame variant="default" className="w-full">
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<div className="flex flex-col gap-px">
							<FrameTitle>All automations</FrameTitle>
							<FrameDescription className="text-xs">
								{automations === undefined
									? "Loading…"
									: `${data.length} automation${data.length === 1 ? "" : "s"}`}
							</FrameDescription>
						</div>
						<div className="relative w-full min-w-48 sm:w-[240px]">
							<Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search automations"
								aria-label="Search automations"
								className="pl-8"
							/>
						</div>
					</FrameHeader>

					<FramePanel className="p-0 shadow-none!">
						<ScrollArea>
							<DataGridTable />
							<ScrollBar orientation="horizontal" />
						</ScrollArea>
						<Separator />
						<FrameFooter>
							<DataGridPagination />
						</FrameFooter>
					</FramePanel>
				</Frame>
			</DataGrid>

			{pendingDelete && (
				<DeleteConfirmationModal
					isOpen={!!pendingDelete}
					onClose={() => setPendingDelete(null)}
					onConfirm={confirmDelete}
					title="Delete Automation"
					itemName={pendingDelete.name}
					itemType="Automation"
				/>
			)}
		</>
	);
}
