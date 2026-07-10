"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StyledBadge } from "@/components/ui/styled";
import { StyledFilters } from "@/components/ui/styled/styled-filters";
import { StyledSegmentedControl } from "@/components/ui/styled/styled-segmented-control";
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
	Building2,
	Calendar,
	CheckCircle2,
	CircleCheck,
	CircleDashed,
	ExternalLink,
	Eye,
	Filter as FilterIcon,
	FolderKanban,
	FolderOpen,
	LayoutGrid,
	Plus,
	Repeat,
	Search,
	TableProperties,
	Trash2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useState } from "react";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { MetricFrame } from "@/components/metric-frame";
import {
	type DragEndEvent,
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "./components/kanban";
import { ProjectDetailDrawer } from "./components/project-detail-drawer";
import { cn } from "@/lib/utils";

// Enhanced project type that includes client information for display
type ProjectWithClient = Doc<"projects"> & {
	client?: Doc<"clients">;
};

type ProjectKanbanItem = {
	id: string;
	name: string;
	column: Doc<"projects">["status"];
	status: Doc<"projects">["status"];
	clientName?: string;
	projectType: Doc<"projects">["projectType"];
	startDate?: number;
	endDate?: number;
	projectNumber?: string | null;
};

type ProjectKanbanColumn = {
	id: Doc<"projects">["status"];
	name: string;
	description: string;
};

const statusVariant = (status: Doc<"projects">["status"]) => {
	switch (status) {
		case "completed":
			return "default" as const;
		case "in-progress":
			return "secondary" as const;
		case "cancelled":
			return "destructive" as const;
		case "planned":
			return "outline" as const;
		default:
			return "outline" as const;
	}
};

// Per-lane accent dot (kanban-board-4 style); status → colored dot only.
const statusDot: Record<Doc<"projects">["status"], string> = {
	planned: "bg-muted-foreground/50",
	"in-progress": "bg-amber-500",
	completed: "bg-emerald-500",
	cancelled: "bg-rose-500",
};

const kanbanColumns: ProjectKanbanColumn[] = [
	{
		id: "planned",
		name: "Planned",
		description: "Projects queued up",
	},
	{
		id: "in-progress",
		name: "In Progress",
		description: "Currently active work",
	},
	{
		id: "completed",
		name: "Completed",
		description: "Recently wrapped up",
	},
	{
		id: "cancelled",
		name: "Cancelled",
		description: "Parked or cancelled",
	},
];

const formatStatus = (status: Doc<"projects">["status"]) => {
	switch (status) {
		case "in-progress":
			return "In Progress";
		case "completed":
			return "Completed";
		case "cancelled":
			return "Cancelled";
		case "planned":
			return "Planned";
		default:
			return status;
	}
};

const formatProjectDate = (timestamp?: number) => {
	if (!timestamp) {
		return "Not set";
	}
	const date = new Date(timestamp);
	return date.toLocaleDateString();
};

const createColumns = (
	router: ReturnType<typeof useRouter>,
	onDelete: (id: string, name: string) => void,
	onPreview: (id: string) => void
): ColumnDef<ProjectWithClient>[] => [
	{
		accessorKey: "title",
		header: "Project",
		cell: ({ row }) => (
			<span className="font-medium text-foreground">{row.original.title}</span>
		),
	},
	{
		id: "client",
		header: "Client",
		cell: ({ row }) => (
			<span className="text-foreground">
				{row.original.client?.companyName || "Unknown Client"}
			</span>
		),
	},
	{
		accessorKey: "projectType",
		header: "Type",
		cell: ({ row }) => (
			<span className="text-foreground capitalize">
				{row.original.projectType}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<StyledBadge variant={statusVariant(row.original.status)}>
				{formatStatus(row.original.status)}
			</StyledBadge>
		),
	},
	{
		accessorKey: "startDate",
		header: "Start Date",
		cell: ({ row }) => {
			const startDate = row.original.startDate;
			if (!startDate)
				return <span className="text-muted-foreground">Not set</span>;
			const d = new Date(startDate);
			return <span className="text-foreground">{d.toLocaleDateString()}</span>;
		},
	},
	{
		accessorKey: "_creationTime",
		header: "Created",
		cell: ({ row }) => {
			const d = new Date(row.original._creationTime);
			return <span className="text-foreground">{d.toLocaleDateString()}</span>;
		},
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
					onClick={() => onPreview(row.original._id)}
					aria-label={`Preview project ${row.original.title}`}
				>
					<Eye className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => router.push(`/projects/${row.original._id}`)}
					aria-label={`Open project ${row.original.title}`}
				>
					<ExternalLink className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					onClick={() => onDelete(row.original._id, row.original.title)}
					className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
					aria-label={`Delete project ${row.original.title}`}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		),
	},
];

export default function ProjectsPage() {
	const router = useRouter();
	const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [query, setQuery] = React.useState("");
	const [filters, setFilters] = React.useState<Filter<unknown>[]>([]);
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [projectToDelete, setProjectToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [previewId, setPreviewId] = useState<Id<"projects"> | null>(null);
	const [previewOpen, setPreviewOpen] = useState(false);
	const deleteProject = useMutation(api.projects.remove);
	const updateProjectStatus = useMutation(api.projects.update);
	const [kanbanData, setKanbanData] = useState<ProjectKanbanItem[]>([]);
	const isOrgSwitching = useIsOrgSwitching();

	// Fetch projects and clients from Convex
	const projects = useQuery(api.projects.list, {});
	const clients = useQuery(api.clients.list, {});
	const projectStats = useQuery(api.projects.getStats, {});

	// Enhanced projects with client information
	const data = React.useMemo((): ProjectWithClient[] => {
		if (!projects || !clients) return [];

		return projects.map((project) => ({
			...project,
			client: clients.find((client) => client._id === project.clientId),
		}));
	}, [projects, clients]);

	// Advanced filters (status / type / client / start-date) applied to the set.
	const filteredData = React.useMemo(() => {
		let result = data;
		filters.forEach((filter) => {
			if (filter.values.length === 0) return;
			switch (filter.field) {
				case "status":
					result = result.filter((p) =>
						filter.values.includes(p.status as unknown)
					);
					break;
				case "type":
					result = result.filter((p) =>
						filter.values.includes(p.projectType as unknown)
					);
					break;
				case "client":
					result = result.filter((p) =>
						filter.values.includes(p.clientId as unknown)
					);
					break;
				case "date":
					if (filter.operator === "between" && filter.values.length === 2) {
						const [startDate, endDate] = filter.values as [string, string];
						if (startDate) {
							const startTs = new Date(startDate).getTime();
							result = result.filter(
								(p) => p.startDate != null && p.startDate >= startTs
							);
						}
						if (endDate) {
							const end = new Date(endDate);
							end.setHours(23, 59, 59, 999);
							const endTs = end.getTime();
							result = result.filter(
								(p) => p.startDate != null && p.startDate <= endTs
							);
						}
					}
					break;
			}
		});
		return result;
	}, [data, filters]);

	// Free-text search on top of the advanced filters; drives table + kanban.
	const searchedData = React.useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return filteredData;
		return filteredData.filter(
			(p) =>
				p.title?.toLowerCase().includes(q) ||
				p.projectType?.toLowerCase().includes(q) ||
				p.status?.toLowerCase().includes(q) ||
				p.client?.companyName?.toLowerCase().includes(q)
		);
	}, [filteredData, query]);

	const projectStatusMap = React.useMemo(() => {
		const statusMap = new Map<string, Doc<"projects">["status"]>();
		data.forEach((project) => statusMap.set(project._id, project.status));
		return statusMap;
	}, [data]);

	React.useEffect(() => {
		setKanbanData(
			searchedData.map((project) => ({
				id: project._id,
				name: project.title,
				column: project.status,
				status: project.status,
				clientName: project.client?.companyName,
				projectType: project.projectType,
				startDate: project.startDate,
				endDate: project.endDate,
				projectNumber: project.projectNumber ?? null,
			}))
		);
	}, [searchedData]);

	// Loading state
	const isLoading =
		isOrgSwitching || projects === undefined || clients === undefined;

	// Empty state
	const isEmpty = !isLoading && data.length === 0;

	const handleDelete = React.useCallback((id: string, name: string) => {
		setProjectToDelete({ id, name });
		setDeleteModalOpen(true);
	}, []);

	const openPreview = React.useCallback((id: string) => {
		setPreviewId(id as Id<"projects">);
		setPreviewOpen(true);
	}, []);

	const confirmDelete = async () => {
		if (projectToDelete) {
			try {
				await deleteProject({ id: projectToDelete.id as Id<"projects"> });
				setDeleteModalOpen(false);
				setProjectToDelete(null);
			} catch (error) {
				console.error("Failed to delete project:", error);
			}
		}
	};

	const columns = React.useMemo(
		() => createColumns(router, handleDelete, openPreview),
		[router, handleDelete, openPreview]
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

	// Reset to first page when the filtered/searched set changes
	React.useEffect(() => {
		setPagination((prev) =>
			prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }
		);
	}, [query, filters, searchedData.length]);

	// Filter field configuration for the advanced filter builder
	const filterFields: FilterFieldConfig<unknown>[] = React.useMemo(() => {
		const statusOptions = [
			{ value: "planned", label: "Planned" },
			{ value: "in-progress", label: "In Progress" },
			{ value: "completed", label: "Completed" },
			{ value: "cancelled", label: "Cancelled" },
		];
		const typeOptions = [
			{ value: "one-off", label: "One-off" },
			{ value: "recurring", label: "Recurring" },
		];
		const clientOptions =
			clients?.map((client) => ({
				value: client._id,
				label: client.companyName,
			})) || [];

		return [
			{
				key: "status",
				label: "Status",
				icon: <CheckCircle2 className="h-3 w-3" />,
				type: "multiselect",
				options: statusOptions,
			},
			{
				key: "type",
				label: "Type",
				icon: <Repeat className="h-3 w-3" />,
				type: "multiselect",
				options: typeOptions,
			},
			{
				key: "client",
				label: "Client",
				icon: <Building2 className="h-3 w-3" />,
				type: "multiselect",
				options: clientOptions,
				searchable: true,
			},
			{
				key: "date",
				label: "Start Date",
				icon: <Calendar className="h-3 w-3" />,
				type: "daterange",
			},
		];
	}, [clients]);

	// onDataChange fires on every drag-over (column crossing), so keep it purely
	// optimistic; the DB write happens once on drop via handleKanbanDragEnd.
	const handleKanbanDataChange = React.useCallback(
		(nextData: ProjectKanbanItem[]) => {
			setKanbanData(nextData);
		},
		[]
	);

	const handleKanbanDragEnd = React.useCallback(
		(event: DragEndEvent) => {
			const item = kanbanData.find((i) => i.id === event.active.id);
			if (!item) return;
			const originalStatus = projectStatusMap.get(item.id);
			if (originalStatus && originalStatus !== item.column) {
				updateProjectStatus({
					id: item.id as Id<"projects">,
					status: item.column,
				}).catch((error) => {
					console.error("Failed to update project status:", error);
				});
			}
		},
		[kanbanData, projectStatusMap, updateProjectStatus]
	);

	return (
		<div className="relative px-6 pt-8 pb-6 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Projects</h1>
						<p className="text-muted-foreground text-sm">
							Overview of your projects
						</p>
					</div>
				</div>
				<Button onClick={() => router.push("/projects/new")}>
					<Plus className="h-4 w-4" />
					Create Project
				</Button>
			</div>

			<MetricFrame
				loading={isLoading}
				metrics={[
					{
						label: "Total Projects",
						value: projectStats?.total ?? data.length,
						hint: "All projects in your workspace",
						icon: <FolderKanban />,
						accent: "var(--color-blue-500)",
					},
					{
						label: "In Progress",
						value:
							projectStats?.byStatus["in-progress"] ??
							data.filter((p) => p.status === "in-progress").length,
						hint: "Currently active projects",
						icon: <CircleDashed />,
						accent: "var(--color-amber-500)",
					},
					{
						label: "Completed",
						value:
							projectStats?.byStatus.completed ??
							data.filter((p) => p.status === "completed").length,
						hint: "Finished projects",
						icon: <CircleCheck />,
						accent: "var(--color-emerald-500)",
					},
				]}
				summary={
					projectStats
						? `${projectStats.byStatus.planned} planned · ${projectStats.upcomingDeadlines} due this week · ${projectStats.overdue} overdue`
						: undefined
				}
			/>

			<Frame>
				<FrameHeader className="flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<FrameTitle className="text-base">Projects</FrameTitle>
						<FrameDescription>
							Search, filter, and browse your projects
						</FrameDescription>
					</div>
					<div className="flex w-full items-center gap-2 sm:w-auto">
						<div className="relative flex-1 sm:w-64 sm:flex-none">
							<Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
							<Input
								placeholder="Search projects..."
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
						<StyledSegmentedControl
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
					onRowClick={(row) => openPreview(row._id)}
					emptyMessage="No projects match your filters."
					tableLayout={{
						width: "auto",
						headerBackground: true,
					}}
				>
					<FramePanel className="p-0">
						{!isLoading && !isEmpty && (
							<div className="border-b px-4 py-3">
								<StyledFilters
									filters={filters}
									fields={filterFields}
									onChange={setFilters}
									addButtonText="Filter"
									addButtonIcon={<FilterIcon className="h-4 w-4" />}
									size="md"
									variant="outline"
									showClearButton={true}
									clearButtonText="Clear"
									clearButtonIcon={<X className="h-4 w-4" />}
								/>
							</div>
						)}

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
							<div className="px-6 py-12 text-center">
								<div className="mx-auto w-24 h-24 mb-4 flex items-center justify-center rounded-full bg-muted">
									<FolderOpen className="h-12 w-12 text-muted-foreground" />
								</div>
								<h3 className="text-lg font-semibold text-foreground mb-2">
									No projects yet
								</h3>
								<p className="text-muted-foreground mb-6 max-w-sm mx-auto">
									Get started by creating your first project. Projects help you
									organize work and track progress.
								</p>
								<Button onClick={() => router.push("/projects/new")}>
									<Plus className="h-4 w-4" />
									Create Your First Project
								</Button>
							</div>
						) : viewMode === "table" ? (
							<div className="overflow-x-auto">
								<DataGridContainer className="rounded-lg border">
									<DataGridTable />
								</DataGridContainer>
							</div>
						) : (
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
													<StyledBadge variant="outline">
														{columnItems.length}
													</StyledBadge>
												</KanbanHeader>
												<KanbanCards id={column.id}>
													{(item: ProjectKanbanItem) => (
														<KanbanCard
															key={item.id}
															id={item.id}
															name={item.name}
															column={item.column}
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
																	<StyledBadge
																		variant={statusVariant(item.column)}
																		className="shrink-0"
																	>
																		{formatStatus(item.column)}
																	</StyledBadge>
																</div>
																<p className="text-muted-foreground truncate text-xs">
																	{item.clientName || "Unknown Client"}
																</p>
																<div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
																	<span>{formatProjectDate(item.startDate)}</span>
																	<span aria-hidden>·</span>
																	<span>{formatProjectDate(item.endDate)}</span>
																	{item.projectNumber ? (
																		<>
																			<span aria-hidden>·</span>
																			<span>#{item.projectNumber}</span>
																		</>
																	) : null}
																</div>
																<div className="flex items-center justify-between pt-1">
																	<StyledBadge
																		variant="outline"
																		className="capitalize"
																	>
																		{item.projectType}
																	</StyledBadge>
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			router.push(`/projects/${item.id}`);
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
						)}
					</FramePanel>

					{!isLoading && !isEmpty && (
						<FrameFooter className="flex-row items-center justify-between">
							<div className="text-muted-foreground text-sm">
								{searchedData.length} of {data.length} projects
							</div>
							{viewMode === "table" ? <DataGridPagination /> : null}
						</FrameFooter>
					)}
				</DataGrid>
			</Frame>

			{/* Detail preview drawer */}
			<ProjectDetailDrawer
				projectId={previewId}
				open={previewOpen}
				onOpenChange={setPreviewOpen}
			/>

			{/* Delete Confirmation Modal */}
			{projectToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => setDeleteModalOpen(false)}
					onConfirm={confirmDelete}
					title="Delete Project"
					itemName={projectToDelete.name}
					itemType="Project"
				/>
			)}
		</div>
	);
}
