"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	StyledBadge,
	StyledButton,
	StyledCard,
	StyledCardContent,
	StyledCardDescription,
	StyledCardHeader,
	StyledCardTitle,
	StyledTable,
	StyledTableBody,
	StyledTableCell,
	StyledTableHead,
	StyledTableHeader,
	StyledTableRow,
} from "@/components/ui/styled";
import {
	ColumnDef,
	ColumnFiltersState,
	SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	FolderKanban,
	ExternalLink,
	Plus,
	FolderOpen,
	Trash2,
	TableProperties,
	LayoutGrid,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { useState } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import {
	KanbanBoard,
	KanbanCard,
	KanbanCards,
	KanbanHeader,
	KanbanProvider,
} from "./components/kanban";
import { ButtonGroup } from "@/components/ui/button-group";
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
	onDelete: (id: string, name: string) => void
): ColumnDef<ProjectWithClient>[] => [
	{
		accessorKey: "title",
		header: "Project",
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium text-foreground">
					{row.original.title}
				</span>
				<span className="text-muted-foreground text-xs">
					Client: {row.original.client?.companyName || "Unknown Client"}
				</span>
			</div>
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
			<div className="flex items-center gap-2">
				<Button
					intent="outline"
					size="sq-sm"
					onPress={() => router.push(`/projects/${row.original._id}`)}
					aria-label={`View project ${row.original.title}`}
				>
					<ExternalLink className="size-4" />
				</Button>
				<Button
					intent="outline"
					size="sq-sm"
					onPress={() => onDelete(row.original._id, row.original.title)}
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
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[]
	);
	const [query, setQuery] = React.useState("");
	const [pagination, setPagination] = React.useState({
		pageIndex: 0,
		pageSize: 10,
	});
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [projectToDelete, setProjectToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const deleteProject = useMutation(api.projects.remove);
	const updateProjectStatus = useMutation(api.projects.update);
	const [kanbanData, setKanbanData] = useState<ProjectKanbanItem[]>([]);

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

	const projectStatusMap = React.useMemo(() => {
		const statusMap = new Map<string, Doc<"projects">["status"]>();
		data.forEach((project) => statusMap.set(project._id, project.status));
		return statusMap;
	}, [data]);

	React.useEffect(() => {
		if (!data || data.length === 0) {
			setKanbanData([]);
			return;
		}

		setKanbanData(
			data.map((project) => ({
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
	}, [data]);

	// Loading state
	const isLoading = projects === undefined || clients === undefined;

	// Empty state
	const isEmpty = !isLoading && data.length === 0;

	const handleDelete = (id: string, name: string) => {
		setProjectToDelete({ id, name });
		setDeleteModalOpen(true);
	};

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

	const table = useReactTable({
		data,
		columns: createColumns(router, handleDelete),
		state: {
			sorting,
			columnFilters,
			globalFilter: query,
			pagination,
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setQuery,
		onPaginationChange: setPagination,
		globalFilterFn: (row, columnId, value) => {
			// If no search value, show all rows
			if (!value || value.trim() === "") return true;

			const search = value.toLowerCase().trim();
			const project = row.original;

			// Search in project title
			if (project.title && project.title.toLowerCase().includes(search))
				return true;

			// Search in project type
			if (
				project.projectType &&
				project.projectType.toLowerCase().includes(search)
			)
				return true;

			// Search in project status
			if (project.status && project.status.toLowerCase().includes(search))
				return true;

			// Search in client company name
			if (
				project.client?.companyName &&
				project.client.companyName.toLowerCase().includes(search)
			)
				return true;

			return false;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	// Reset to first page when search changes
	React.useEffect(() => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, [query]);

	const handleKanbanDataChange = React.useCallback(
		(nextData: ProjectKanbanItem[]) => {
			setKanbanData(nextData);

			const changedItem = nextData.find((item) => {
				const originalStatus = projectStatusMap.get(item.id);
				return originalStatus && originalStatus !== item.column;
			});

			if (changedItem) {
				updateProjectStatus({
					id: changedItem.id as Id<"projects">,
					status: changedItem.column,
				}).catch((error) => {
					console.error("Failed to update project status:", error);
				});
			}
		},
		[projectStatusMap, updateProjectStatus]
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
				<StyledButton
					intent="primary"
					icon={<Plus className="h-4 w-4" />}
					label="Create Project"
					onClick={() => router.push("/projects/new")}
				/>
			</div>

			{isLoading ? (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					{[...Array(3)].map((_, i) => (
						<StyledCard key={i}>
							<StyledCardHeader>
								<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24" />
								<div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-32" />
							</StyledCardHeader>
							<StyledCardContent>
								<div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
							</StyledCardContent>
						</StyledCard>
					))}
				</div>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<StyledCard>
						<StyledCardHeader>
							<StyledCardTitle className="flex items-center gap-2 text-base">
								<FolderKanban className="size-4" /> Total Projects
							</StyledCardTitle>
							<StyledCardDescription>
								All projects in your workspace
							</StyledCardDescription>
						</StyledCardHeader>
						<StyledCardContent>
							<div className="text-3xl font-semibold">
								{projectStats?.total || data.length}
							</div>
						</StyledCardContent>
					</StyledCard>
					<StyledCard>
						<StyledCardHeader>
							<StyledCardTitle className="text-base">
								In Progress
							</StyledCardTitle>
							<StyledCardDescription>
								Currently active projects
							</StyledCardDescription>
						</StyledCardHeader>
						<StyledCardContent>
							<div className="text-3xl font-semibold">
								{projectStats?.byStatus["in-progress"] ||
									data.filter((p) => p.status === "in-progress").length}
							</div>
						</StyledCardContent>
					</StyledCard>
					<StyledCard>
						<StyledCardHeader>
							<StyledCardTitle className="text-base">Completed</StyledCardTitle>
							<StyledCardDescription>Finished projects</StyledCardDescription>
						</StyledCardHeader>
						<StyledCardContent>
							<div className="text-3xl font-semibold">
								{projectStats?.byStatus.completed ||
									data.filter((p) => p.status === "completed").length}
							</div>
						</StyledCardContent>
					</StyledCard>
				</div>
			)}

			<StyledCard>
				<StyledCardHeader className="flex flex-col gap-3 border-b">
					<div>
						<StyledCardTitle>Projects</StyledCardTitle>
						<StyledCardDescription>
							Search, sort, and browse your projects
						</StyledCardDescription>
					</div>
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<Input
							placeholder="Search projects, clients, or status..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="w-full md:w-96"
						/>
						<ButtonGroup>
							<button
								onClick={() => setViewMode("table")}
								aria-pressed={viewMode === "table"}
								aria-label="Table view"
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									viewMode === "table"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								<TableProperties className="w-4 h-4" />
								<span className="hidden sm:inline">Table</span>
							</button>
							<button
								onClick={() => setViewMode("kanban")}
								aria-pressed={viewMode === "kanban"}
								aria-label="Kanban view"
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									viewMode === "kanban"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								<LayoutGrid className="w-4 h-4" />
								<span className="hidden sm:inline">Kanban</span>
							</button>
						</ButtonGroup>
					</div>
				</StyledCardHeader>
				<StyledCardContent className="relative px-0">
					{isLoading ? (
						<div className="px-6">
							<div className="space-y-4">
								{[...Array(5)].map((_, i) => (
									<div key={i} className="flex items-center space-x-4 p-4">
										<div className="flex-1 space-y-2">
											<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
											<div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2" />
										</div>
										<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-16" />
										<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
										<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24" />
										<div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
							<StyledButton
								intent="primary"
								icon={<Plus className="h-4 w-4" />}
								label="Create Your First Project"
								onClick={() => router.push("/projects/new")}
							/>
						</div>
					) : viewMode === "table" ? (
						<div className="px-6">
							<div className="overflow-hidden rounded-lg border">
								<StyledTable>
									<StyledTableHeader>
										{table.getHeaderGroups().map((headerGroup) => (
											<StyledTableRow key={headerGroup.id}>
												{headerGroup.headers.map((header) => (
													<StyledTableHead key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(
																	header.column.columnDef.header,
																	header.getContext()
																)}
													</StyledTableHead>
												))}
											</StyledTableRow>
										))}
									</StyledTableHeader>
									<StyledTableBody>
										{table.getRowModel().rows?.length ? (
											table.getRowModel().rows.map((row) => (
												<StyledTableRow
													key={row.id}
													data-state={row.getIsSelected() && "selected"}
												>
													{row.getVisibleCells().map((cell) => (
														<StyledTableCell key={cell.id}>
															{flexRender(
																cell.column.columnDef.cell,
																cell.getContext()
															)}
														</StyledTableCell>
													))}
												</StyledTableRow>
											))
										) : (
											<StyledTableRow>
												<StyledTableCell
													colSpan={createColumns(router, handleDelete).length}
													className="h-24 text-center"
												>
													No projects match your search.
												</StyledTableCell>
											</StyledTableRow>
										)}
									</StyledTableBody>
								</StyledTable>
							</div>
							<div className="flex items-center justify-between py-4">
								<div className="text-muted-foreground text-sm">
									{table.getFilteredRowModel().rows.length} of {data.length}{" "}
									projects
								</div>
								<div className="flex items-center gap-2">
									<Button
										intent="outline"
										size="sq-sm"
										onPress={() => table.previousPage()}
										isDisabled={!table.getCanPreviousPage()}
										aria-label="Previous page"
									>
										<ChevronLeft className="size-4" />
									</Button>
									<div className="text-sm font-medium">
										Page {table.getState().pagination?.pageIndex + 1} of{" "}
										{table.getPageCount()}
									</div>
									<Button
										intent="outline"
										size="sq-sm"
										onPress={() => table.nextPage()}
										isDisabled={!table.getCanNextPage()}
										aria-label="Next page"
									>
										<ChevronRight className="size-4" />
									</Button>
								</div>
							</div>
						</div>
					) : (
						<div className="px-2 py-6 h-[calc(100vh-28rem)]">
							<KanbanProvider
								columns={kanbanColumns}
								data={kanbanData}
								onDataChange={handleKanbanDataChange}
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
											<KanbanHeader className="flex items-center justify-between border-b bg-muted/30 shrink-0">
												<div>
													<p className="font-semibold text-sm text-foreground">
														{column.name}
													</p>
													<p className="text-xs text-muted-foreground">
														{column.description}
													</p>
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
														<div className="space-y-3">
															<div className="flex items-center justify-between gap-2">
																<p className="text-sm font-semibold text-foreground">
																	{item.name}
																</p>
																<StyledBadge
																	variant="outline"
																	className="capitalize"
																>
																	{item.projectType}
																</StyledBadge>
															</div>
															<div className="text-xs text-muted-foreground">
																Client: {item.clientName || "Unknown Client"}
															</div>
															<div className="flex items-center justify-between text-xs text-muted-foreground">
																<span>
																	Start: {formatProjectDate(item.startDate)}
																</span>
																<span>
																	Due: {formatProjectDate(item.endDate)}
																</span>
															</div>
															<div className="flex items-center justify-between text-xs">
																<span className="text-muted-foreground">
																	{item.projectNumber
																		? `Project #${item.projectNumber}`
																		: "No project number"}
																</span>
																<StyledBadge
																	variant={statusVariant(item.column)}
																>
																	{formatStatus(item.column)}
																</StyledBadge>
															</div>
															<div className="pt-2 border-t border-border/50">
																<StyledButton
																	intent="outline"
																	size="sm"
																	icon={
																		<ExternalLink className="h-3.5 w-3.5" />
																	}
																	label="View Project"
																	showArrow={false}
																	onClick={(e) => {
																		e?.stopPropagation();
																		router.push(`/projects/${item.id}`);
																	}}
																	className="w-full justify-center"
																/>
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
				</StyledCardContent>
			</StyledCard>

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
