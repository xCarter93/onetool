"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FiltersWithClear } from "@/components/filters/radius-full";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { useCreateRecord } from "@/components/domain/create-record-provider";
import type { Filter, FilterFieldConfig } from "@/components/ui/filters";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import {
	ColumnDef,
	SortingState,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	CheckCircle2,
	ExternalLink,
	Eye,
	Filter as FilterIcon,
	LayoutGrid,
	Plus,
	RotateCcw,
	Search,
	TableProperties,
	Trash2,
	Upload,
	UserCheck,
	Users,
	UserX,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { MetricFrame } from "@/components/metric-frame";
import { useActivitySparklines } from "@/hooks/use-activity-sparklines";
import {
	useCanPerformAction,
	useFeatureAccess,
} from "@/hooks/use-feature-access";
import { usePermissions } from "@/hooks/use-permissions";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	type DragEndEvent,
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "../projects/components/kanban";
import { ClientDetailDrawer } from "./components/client-detail-drawer";
import { ActivitySparkline } from "@/components/shared/activity-sparkline";
import { ActivityColumnHeader } from "@/components/shared/activity-column-header";
import { cn } from "@/lib/utils";

type Client = {
	id: string;
	name: string;
	location: string;
	activeProjects: number;
	lastActivity: string; // ISO date or friendly string
	status: "Active" | "Prospect" | "Paused" | "Archived";
	primaryContact: {
		name: string;
		email: string;
		jobTitle: string;
	} | null;
	activity?: number[];
};

type ClientKanbanStatus = "lead" | "active" | "inactive";

type ClientKanbanItem = {
	id: string;
	name: string;
	column: ClientKanbanStatus;
	activeProjects: number;
	primaryContact: {
		name: string;
		email: string;
	} | null;
};

type ClientKanbanColumn = {
	id: ClientKanbanStatus;
	name: string;
	description: string;
};

type ClientActionGate = ReturnType<typeof useCanPerformAction>;

const kanbanColumns: ClientKanbanColumn[] = [
	{ id: "lead", name: "Leads", description: "Potential new clients" },
	{ id: "active", name: "Active", description: "Current clients" },
	{ id: "inactive", name: "Inactive", description: "Paused or dormant" },
];

// Per-lane accent dot (kanban-board-4 style); status → colored dot only.
const statusDot: Record<ClientKanbanStatus, string> = {
	lead: "bg-amber-500",
	active: "bg-emerald-500",
	inactive: "bg-muted-foreground/50",
};

const formatKanbanStatus = (status: ClientKanbanStatus) => {
	switch (status) {
		case "lead":
			return "Lead";
		case "active":
			return "Active";
		case "inactive":
			return "Inactive";
		default:
			return status;
	}
};

// Map a display status to the kanban lane it belongs in.
const toKanbanStatus = (status: Client["status"]): ClientKanbanStatus => {
	if (status === "Active") return "active";
	if (status === "Prospect") return "lead"; // legacy "Prospect" → Lead lane
	return "inactive";
};

// Advanced filters (status) applied to a client set. Status honors is / is_not
// so the default "is not Archived" chip can hide archived clients while staying
// removable to reveal them.
const applyClientFilters = (
	rows: Client[],
	filters: Filter<unknown>[]
): Client[] => {
	let result = rows;
	filters.forEach((filter) => {
		if (filter.values.length === 0) return;
		switch (filter.field) {
			case "status": {
				const isNot = filter.operator === "is_not";
				result = result.filter((c) => {
					const match = filter.values.includes(c.status as unknown);
					return isNot ? !match : match;
				});
				break;
			}
		}
	});
	return result;
};

// Free-text search on client name + primary contact name/email.
const searchClients = (rows: Client[], query: string): Client[] => {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((c) => {
		if (c.name?.toLowerCase().includes(q)) return true;
		if (c.primaryContact) {
			if (c.primaryContact.name?.toLowerCase().includes(q)) return true;
			if (c.primaryContact.email?.toLowerCase().includes(q)) return true;
		}
		return false;
	});
};

const createColumns = (
	router: ReturnType<typeof useRouter>,
	onPreview: (id: string) => void,
	onDelete: (id: string, name: string) => void,
	onRestore: (id: string, name: string) => void,
	canModify: boolean,
	canDelete: boolean
): ColumnDef<Client>[] => [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium text-foreground">{row.original.name}</span>
				<span className="text-muted-foreground text-xs">
					{row.original.location}
				</span>
			</div>
		),
	},
	{
		accessorKey: "primaryContact",
		header: "Primary Contact",
		cell: ({ row }) =>
			row.original.primaryContact ? (
				<div className="flex flex-col">
					<span className="font-medium text-foreground">
						{row.original.primaryContact.name}
					</span>
					<span className="text-muted-foreground text-xs">
						{row.original.primaryContact.email}
					</span>
				</div>
			) : (
				<span className="text-muted-foreground text-sm">No contact</span>
			),
	},
	{
		accessorKey: "activeProjects",
		header: "Active Projects",
		cell: ({ row }) => (
			<span className="text-foreground">{row.original.activeProjects}</span>
		),
	},
	{
		accessorKey: "lastActivity",
		header: "Last Activity",
		cell: ({ row }) => {
			const date = new Date(row.original.lastActivity);
			return (
				<span className="text-foreground">
					{isNaN(date.getTime())
						? row.original.lastActivity
						: date.toLocaleDateString()}
				</span>
			);
		},
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.original.status;
			return (
				<StatusBadge
					status={status.toLowerCase()}
					appearance={
						status === "Active"
							? "solid"
							: status === "Prospect"
								? "soft"
								: "outline"
					}
				>
					{status}
				</StatusBadge>
			);
		},
	},
	{
		id: "activity",
		header: () => <ActivityColumnHeader />,
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex justify-center">
				<ActivitySparkline data={row.original.activity} />
			</div>
		),
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => (
			// Stop row-click preview from firing when using the explicit actions.
			<div
				className="flex items-center justify-end gap-2"
				onClick={(e) => e.stopPropagation()}
			>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onPreview(row.original.id)}
					aria-label={`Preview client ${row.original.name}`}
				>
					<Eye className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => router.push(`/clients/${row.original.id}`)}
					aria-label={`Open client ${row.original.name}`}
				>
					<ExternalLink className="size-4" />
				</Button>
				{canModify &&
					(row.original.status === "Archived" ? (
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onRestore(row.original.id, row.original.name)}
							className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
							aria-label={`Restore client ${row.original.name}`}
						>
							<RotateCcw className="size-4" />
						</Button>
					) : (
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onDelete(row.original.id, row.original.name)}
							disabled={!canDelete}
							className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
							aria-label={`Archive client ${row.original.name}`}
						>
							<Trash2 className="size-4" />
						</Button>
					))}
			</div>
		),
	},
];

function ActiveEmptyState({
	gate,
	onAdd,
	canModify,
}: {
	gate: ClientActionGate;
	onAdd: () => void;
	canModify: boolean;
}) {
	const { canPerform, reason, currentUsage, limit } = gate;
	return (
		<EmptyState
			size="md"
			icon={<Users />}
			title="No clients yet"
			description="Create your first client to start organizing relationships and tracking activity."
			action={
				canModify ? (
					<Tooltip>
						<TooltipTrigger render={<span className="inline-block" />}>
							<Button onClick={onAdd} disabled={!canPerform}>
								<Plus className="h-4 w-4" />
								Add Your First Client
							</Button>
						</TooltipTrigger>
						{!canPerform && (
							<TooltipContent>
								<div className="space-y-1">
									<p className="font-semibold">Upgrade Required</p>
									<p>{reason || "You've reached your client limit"}</p>
									{limit && limit !== "unlimited" && currentUsage !== undefined && (
										<p className="text-muted-foreground">
											{currentUsage}/{limit} clients
										</p>
									)}
								</div>
							</TooltipContent>
						)}
					</Tooltip>
				) : undefined
			}
		/>
	);
}

function ClientsPageContent() {
	const router = useRouter();
	const toast = useToast();
	const openCreate = useCreateRecord();
	const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [query, setQuery] = React.useState("");
	// Seed a removable "Status is not Archived" chip so archived clients are
	// hidden by default but revealed by clearing or editing the filter.
	const [filters, setFilters] = React.useState<Filter<unknown>[]>(() => [
		{
			id: "default-hide-archived",
			field: "status",
			operator: "is_not",
			values: ["Archived"],
		},
	]);
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [clientToDelete, setClientToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [previewId, setPreviewId] = useState<Id<"clients"> | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [kanbanData, setKanbanData] = useState<ClientKanbanItem[]>([]);
	const isOrgSwitching = useIsOrgSwitching();

	// Usage gate for creating clients + premium gate for import.
	const gate = useCanPerformAction("create_client");
	const { canPerform, reason } = gate;
	const { hasPremiumAccess } = useFeatureAccess();
	const { can } = usePermissions();
	const canModifyClients = can("clients", "modify");
	const canDeleteClients = can("clients", "delete");

	const archiveClient = useMutation(api.clients.archive);
	const restoreClient = useMutation(api.clients.restore);
	const updateClient = useMutation(api.clients.update);

	// Single dataset: all clients incl. archived. Archived rows stay in the
	// table's data (so they're reachable) but are hidden by the default
	// "is not Archived" filter chip until the user edits or removes it.
	const convexClients = useQuery(api.clients.listWithProjectCounts, {
		includeArchived: true,
	});
	const clientsStats = useQuery(api.clients.getStats, {});
	// 30-day activity sparkline data, keyed by client id (presentational).
	const sparklines = useActivitySparklines("client");

	const allData = React.useMemo<Client[]>(
		() =>
			(convexClients ?? []).map((client) => ({
				...client,
				activity: sparklines?.[client.id],
			})),
		[convexClients, sparklines]
	);

	// Advanced filters + free-text search over the full set.
	const filteredData = React.useMemo(
		() => applyClientFilters(allData, filters),
		[allData, filters]
	);
	const searchedData = React.useMemo(
		() => searchClients(filteredData, query),
		[filteredData, query]
	);

	const isEmpty = allData.length === 0;

	const isLoading = isOrgSwitching || convexClients === undefined;

	const handleAddClient = React.useCallback(() => {
		if (!canPerform) {
			toast.error(
				"Upgrade Required",
				reason || "You've reached your client limit"
			);
			return;
		}
		openCreate({ type: "client" });
	}, [canPerform, reason, openCreate, toast]);

	const openPreview = React.useCallback((id: string) => {
		setPreviewId(id as Id<"clients">);
		setPreviewOpen(true);
	}, []);

	const handleDelete = React.useCallback((id: string, name: string) => {
		setClientToDelete({ id, name });
		setDeleteModalOpen(true);
	}, []);

	const handleRestore = React.useCallback(
		async (id: string, name: string) => {
			try {
				await restoreClient({ id: id as Id<"clients"> });
				toast.success(
					"Client Restored",
					`${name} has been restored and is now active.`
				);
			} catch (error) {
				console.error("Failed to restore client:", error);
				toast.error(
					"Restore Failed",
					"Failed to restore the client. Please try again."
				);
			}
		},
		[restoreClient, toast]
	);

	const confirmDelete = async () => {
		if (!clientToDelete) return;
		// Success/error toasts + closing are owned by DeleteConfirmationModal;
		// let errors propagate so the modal shows a single error toast.
		await archiveClient({ id: clientToDelete.id as Id<"clients"> });
		setClientToDelete(null);
	};

	// Stable status map (from the full set) for drag-to-update detection.
	const clientStatusMap = React.useMemo(() => {
		const map = new Map<string, ClientKanbanStatus>();
		allData.forEach((client) => map.set(client.id, toKanbanStatus(client.status)));
		return map;
	}, [allData]);

	// Kanban reflects the (filtered + searched) non-archived clients.
	React.useEffect(() => {
		setKanbanData(
			searchedData
				.filter((client) => client.status !== "Archived")
				.map((client) => ({
					id: client.id,
					name: client.name,
					column: toKanbanStatus(client.status),
					activeProjects: client.activeProjects,
					primaryContact: client.primaryContact
						? {
								name: client.primaryContact.name,
								email: client.primaryContact.email,
							}
						: null,
				}))
		);
	}, [searchedData]);

	// onDataChange fires on every drag-over (column crossing), so keep it purely
	// optimistic; the DB write happens once on drop via handleKanbanDragEnd.
	const handleKanbanDataChange = React.useCallback(
		(nextData: ClientKanbanItem[]) => {
			setKanbanData(nextData);
		},
		[]
	);

	const handleKanbanDragEnd = React.useCallback(
		(event: DragEndEvent) => {
			if (!canModifyClients) return;
			const item = kanbanData.find((i) => i.id === event.active.id);
			if (!item) return;
			const originalStatus = clientStatusMap.get(item.id);
			if (originalStatus && originalStatus !== item.column) {
				updateClient({
					id: item.id as Id<"clients">,
					status: item.column,
				}).catch((error) => {
					console.error("Failed to update client status:", error);
					toast.error(
						"Update Failed",
						"Failed to update client status. Please try again."
					);
				});
			}
		},
		[canModifyClients, kanbanData, clientStatusMap, updateClient, toast]
	);

	const columns = React.useMemo(
		() =>
			createColumns(
				router,
				openPreview,
				handleDelete,
				handleRestore,
				canModifyClients,
				canDeleteClients
			),
		[
			router,
			openPreview,
			handleDelete,
			handleRestore,
			canModifyClients,
			canDeleteClients,
		]
	);

	const table = useReactTable({
		data: searchedData,
		columns,
		state: {
			sorting,
			pagination,
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	// Reset to the first page whenever the visible set changes (incl. after a
	// delete/refetch shrinks it, which could otherwise strand pageIndex past
	// the last page).
	React.useEffect(() => {
		setPagination((prev) =>
			prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }
		);
	}, [query, filters, searchedData.length]);

	// One status filter covering every status incl. Archived. New status chips
	// default to "is"; the seeded default chip uses "is not Archived".
	const filterFields: FilterFieldConfig<unknown>[] = React.useMemo(
		() => [
			{
				key: "status",
				label: "Status",
				icon: <CheckCircle2 className="h-3 w-3" />,
				type: "select",
				defaultOperator: "is",
				options: [
					{ value: "Active", label: "Active" },
					{ value: "Prospect", label: "Prospect" },
					{ value: "Paused", label: "Paused" },
					{ value: "Archived", label: "Archived" },
				],
			},
		],
		[]
	);

	const footerShown =
		viewMode === "table" ? searchedData.length : kanbanData.length;
	const footerTotal = allData.length;
	const showFooter = !isLoading && !isEmpty;

	const filtersBar = (
		<div className="border-b px-4 py-3">
			<FiltersWithClear
				filters={filters}
				fields={filterFields}
				onChange={setFilters}
				addButtonText="Filter"
				addButtonIcon={<FilterIcon className="h-4 w-4" />}
				size="md"
				variant="outline"
				radius="full"
				showClearButton={true}
				clearButtonText="Clear"
				clearButtonIcon={<X className="h-4 w-4" />}
			/>
		</div>
	);

	const kanbanBoard = (
		<div className="px-2 py-4 h-[calc(100vh-30rem)] min-h-[24rem]">
			<KanbanProvider
				columns={kanbanColumns}
				data={kanbanData}
				onDataChange={handleKanbanDataChange}
				onDragEnd={handleKanbanDragEnd}
			>
				{(column) => {
					const columnItems = kanbanData.filter(
						(item) => item.column === column.id
					);

					return (
						<KanbanBoard
							key={column.id}
							id={column.id}
							className="bg-card/60 flex flex-col"
						>
							<KanbanHeader className="border-b bg-muted/30 flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
								<div className="flex min-w-0 items-center gap-2">
									<span
										className={cn(
											"size-2.5 shrink-0 rounded-full",
											statusDot[column.id]
										)}
									/>
									<div className="min-w-0">
										<p className="text-foreground truncate text-sm font-semibold">
											{column.name}
										</p>
										<p className="text-muted-foreground truncate text-xs">
											{column.description}
										</p>
									</div>
								</div>
								<Badge variant="outline">{columnItems.length}</Badge>
							</KanbanHeader>
							<KanbanCards id={column.id}>
								{(item: ClientKanbanItem) => (
									<KanbanCard
										key={item.id}
										id={item.id}
										name={item.name}
										column={item.column}
										dragDisabled={!canModifyClients}
									>
										<div
											role="button"
											tabIndex={0}
											onClick={() => openPreview(item.id)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													openPreview(item.id);
												}
											}}
											className="flex cursor-pointer flex-col gap-2 outline-none"
										>
											<div className="flex items-start justify-between gap-2">
												<p className="text-foreground line-clamp-2 text-sm font-medium">
													{item.name}
												</p>
												<StatusBadge
													status={item.column}
													appearance={
														item.column === "active"
															? "solid"
															: item.column === "inactive"
																? "outline"
																: "soft"
													}
													className="shrink-0"
												>
													{formatKanbanStatus(item.column)}
												</StatusBadge>
											</div>
											<p className="text-muted-foreground truncate text-xs">
												{item.activeProjects === 0
													? "No active projects"
													: `${item.activeProjects} active ${
															item.activeProjects === 1 ? "project" : "projects"
														}`}
											</p>
											{item.primaryContact ? (
												<div className="text-muted-foreground text-xs">
													<p className="text-foreground font-medium">
														{item.primaryContact.name}
													</p>
													<p className="truncate">{item.primaryContact.email}</p>
												</div>
											) : null}
											<div className="flex items-center justify-end pt-1">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														router.push(`/clients/${item.id}`);
													}}
													onKeyDown={(e) => e.stopPropagation()}
													className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
												>
													Open <ExternalLink className="size-3" />
												</button>
											</div>
										</div>
									</KanbanCard>
								)}
							</KanbanCards>
						</KanbanBoard>
					);
				}}
			</KanbanProvider>
		</div>
	);

	const clientsTable = (
		<div className="overflow-x-auto">
			<DataGridContainer className="rounded-lg border">
				<DataGridTable />
			</DataGridContainer>
		</div>
	);

	return (
		<div className="relative px-6 pt-8 pb-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Clients</h1>
						<p className="text-muted-foreground text-sm">
							Overview of your clients
						</p>
					</div>
				</div>
				{canModifyClients && (
					<div className="flex gap-2">
						<Tooltip>
							<TooltipTrigger render={<span className="inline-block" />}>
								<Button
									variant="outline"
									onClick={() => router.push("/clients/import")}
									disabled={!hasPremiumAccess}
								>
									<Upload className="h-4 w-4" />
									Import Clients
								</Button>
							</TooltipTrigger>
							{!hasPremiumAccess && (
								<TooltipContent>
									<div className="space-y-1">
										<p className="font-semibold">Premium Feature</p>
										<p>Upgrade to access client import functionality</p>
									</div>
								</TooltipContent>
							)}
						</Tooltip>

						<Tooltip>
							<TooltipTrigger render={<span className="inline-block" />}>
								<Button onClick={handleAddClient} disabled={!canPerform}>
									<Plus className="h-4 w-4" />
									Add Client
									{!canPerform &&
										gate.limit &&
										gate.limit !== "unlimited" &&
										gate.currentUsage !== undefined && (
											<Badge variant="secondary" className="ml-1 text-xs">
												{gate.currentUsage}/{gate.limit}
											</Badge>
										)}
								</Button>
							</TooltipTrigger>
							{!canPerform && (
								<TooltipContent>
									<div className="space-y-1">
										<p className="font-semibold">Upgrade Required</p>
										<p>{reason || "You've reached your client limit"}</p>
										{gate.limit &&
											gate.limit !== "unlimited" &&
											gate.currentUsage !== undefined && (
												<p className="text-muted-foreground">
													{gate.currentUsage}/{gate.limit} clients
												</p>
											)}
									</div>
								</TooltipContent>
							)}
						</Tooltip>
					</div>
				)}
			</div>

			<MetricFrame
				loading={clientsStats === undefined}
				metrics={[
					{
						label: "Prospective Clients",
						value: clientsStats?.groupedByStatus?.prospective ?? 0,
						hint: "Clients currently marked as prospects",
						icon: <Users />,
						accent: "var(--color-blue-500)",
					},
					{
						label: "Active Clients",
						value: clientsStats?.groupedByStatus?.active ?? 0,
						hint: "Clients engaged in work right now",
						icon: <UserCheck />,
						accent: "var(--color-emerald-500)",
					},
					{
						label: "Inactive Clients",
						value: clientsStats?.groupedByStatus?.inactive ?? 0,
						hint: "Clients marked inactive or archived",
						icon: <UserX />,
						accent: "var(--color-zinc-400)",
					},
				]}
				summary={
					clientsStats
						? `${clientsStats.total} total clients · ${clientsStats.recentlyCreated} added in the last 30 days`
						: undefined
				}
			/>

			<Frame>
				<FrameHeader className="flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<FrameTitle className="text-base">Clients</FrameTitle>
						<FrameDescription>
							Search, filter, and browse your client list
						</FrameDescription>
					</div>
					<div className="flex w-full items-center gap-2 sm:w-auto">
						<div className="relative flex-1 sm:w-64 sm:flex-none">
							<Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
							<Input
								placeholder="Search clients or contacts..."
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
						<SegmentedControl
							className="shrink-0"
							value={viewMode}
							onValueChange={(v) => setViewMode(v as "table" | "kanban")}
							options={[
								{
									value: "table",
									label: "Table",
									icon: <TableProperties className="size-4" />,
									ariaLabel: "Table view",
									hideLabelOnMobile: true,
								},
								{
									value: "kanban",
									label: "Kanban",
									icon: <LayoutGrid className="size-4" />,
									ariaLabel: "Kanban view",
									hideLabelOnMobile: true,
								},
							]}
						/>
					</div>
				</FrameHeader>

				<DataGrid
					table={table}
					recordCount={searchedData.length}
					onRowClick={(row) => openPreview(row.id)}
					emptyMessage="No clients match your filters."
					tableLayout={{
						width: "auto",
						headerBackground: true,
					}}
				>
					<FramePanel className="p-0">
						{isLoading ? (
							<div className="p-4">
								<div className="space-y-4">
									{[...Array(5)].map((_, i) => (
										<div key={i} className="flex items-center space-x-4 p-4">
											<div className="flex-1 space-y-2">
												<div className="h-4 bg-muted rounded animate-pulse w-2/3" />
												<div className="h-3 bg-muted rounded animate-pulse w-1/2" />
											</div>
											<div className="h-4 bg-muted rounded animate-pulse w-16" />
											<div className="h-4 bg-muted rounded animate-pulse w-20" />
											<div className="h-8 w-8 bg-muted rounded animate-pulse" />
										</div>
									))}
								</div>
							</div>
						) : isEmpty ? (
							<ActiveEmptyState
								gate={gate}
								onAdd={handleAddClient}
								canModify={canModifyClients}
							/>
						) : viewMode === "kanban" ? (
							<>
								{filtersBar}
								{kanbanBoard}
							</>
						) : (
							<>
								{filtersBar}
								{clientsTable}
							</>
						)}
					</FramePanel>

					{showFooter && (
						<FrameFooter className="flex-row items-center justify-between">
							<div className="text-muted-foreground text-sm">
								{footerShown} of {footerTotal} clients
							</div>
							{viewMode === "table" ? <DataGridPagination /> : null}
						</FrameFooter>
					)}
				</DataGrid>
			</Frame>

			{/* Detail preview drawer */}
			<ClientDetailDrawer
				clientId={previewId}
				open={previewOpen}
				onOpenChange={setPreviewOpen}
			/>

			{/* Archive Confirmation Modal */}
			{clientToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Archive Client"
					itemName={clientToDelete.name}
					itemType="Client"
					isArchive={true}
				/>
			)}
		</div>
	);
}

export default function ClientsPage() {
	return (
		<PermissionGate object="clients">
			<ClientsPageContent />
		</PermissionGate>
	);
}
