"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskSheet } from "@/components/shared/task-sheet";
import { Badge } from "@/components/ui/badge";
import { FiltersWithClear } from "@/components/filters/radius-full";
import type { Filter, FilterFieldConfig } from "@/components/ui/filters";
import {
	DateFilterValue,
	matchesDateFilter,
} from "@/components/filters/date-filter";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
	ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Calendar,
	User,
	Plus,
	CheckCircle2,
	Circle,
	XCircle,
	Search,
	Building2,
	FolderOpen,
	Edit,
	Trash2,
	Filter as FilterIcon,
	X,
} from "lucide-react";
import { Task } from "@/types/task";
import { isTerminalStatus } from "@/lib/tasks";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";

// --- Grouping logic ---

interface TaskGroup {
	label: string;
	tasks: Task[];
	variant: "destructive" | "default" | "secondary" | "outline";
}

function groupTasks(tasks: Task[]): TaskGroup[] {
	const now = new Date();
	const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = todayStart + 86400000; // +1 day in ms

	// End of current week (Sunday end)
	const dayOfWeek = now.getUTCDay(); // 0=Sun
	const daysUntilEndOfWeek = 7 - dayOfWeek;
	const endOfWeek = todayStart + daysUntilEndOfWeek * 86400000;

	const overdue: Task[] = [];
	const today: Task[] = [];
	const thisWeek: Task[] = [];
	const upcoming: Task[] = [];
	const completed: Task[] = [];
	const cancelled: Task[] = [];

	for (const task of tasks) {
		if (task.status === "cancelled") {
			cancelled.push(task);
		} else if (task.status === "completed") {
			completed.push(task);
		} else if (task.date < todayStart) {
			overdue.push(task);
		} else if (task.date >= todayStart && task.date < todayEnd) {
			today.push(task);
		} else if (task.date >= todayEnd && task.date < endOfWeek) {
			thisWeek.push(task);
		} else {
			upcoming.push(task);
		}
	}

	return [
		{ label: "Overdue", tasks: overdue, variant: "destructive" as const },
		{ label: "Today", tasks: today, variant: "default" as const },
		{ label: "This Week", tasks: thisWeek, variant: "secondary" as const },
		{ label: "Upcoming", tasks: upcoming, variant: "outline" as const },
		{ label: "Completed", tasks: completed, variant: "outline" as const },
		{ label: "Cancelled", tasks: cancelled, variant: "outline" as const },
	].filter((g) => g.tasks.length > 0);
}

// --- Date formatting ---

function formatRelativeDate(timestamp: number): string {
	const now = new Date();
	const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = todayStart + 86400000;
	const tomorrowEnd = todayEnd + 86400000;

	if (timestamp >= todayStart && timestamp < todayEnd) return "Today";
	if (timestamp >= todayEnd && timestamp < tomorrowEnd) return "Tomorrow";

	const date = new Date(timestamp);
	const diffDays = Math.round((timestamp - todayStart) / 86400000);

	if (diffDays === -1) return "Yesterday";

	return date.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: date.getUTCFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

function isOverdue(task: Task): boolean {
	const now = new Date();
	const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	return task.date < todayStart && !isTerminalStatus(task.status);
}

// --- Columns ---

function createColumns(
	clients: { _id: Id<"clients">; companyName: string }[] | undefined,
	projects: { _id: Id<"projects">; title: string }[] | undefined,
	users:
		| { _id: Id<"users">; name?: string; email: string }[]
		| undefined,
	onToggleComplete: (task: Task) => void,
	onEdit: (task: Task) => void,
	onDelete: (task: Task) => void,
	updatingTasks: Set<Id<"tasks">>,
	canModify: boolean,
	canDelete: boolean
): ColumnDef<Task>[] {
	return [
		{
			id: "complete",
			header: "",
			size: 48,
			cell: ({ row }) => {
				const task = row.original;
				const isUpdating = updatingTasks.has(task._id);
				return (
					<button
						onClick={() => onToggleComplete(task)}
						disabled={
							isUpdating || task.status === "cancelled" || !canModify
						}
						className={cn(
							"p-0.5 rounded-full transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							isUpdating && "opacity-50 cursor-not-allowed"
						)}
					>
						{task.status === "completed" ? (
							<CheckCircle2 className="h-5 w-5 text-green-600" />
						) : task.status === "cancelled" ? (
							<XCircle className="h-5 w-5 text-muted-foreground" />
						) : (
							<Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
						)}
					</button>
				);
			},
		},
		{
			accessorKey: "title",
			header: "Task",
			cell: ({ row }) => {
				const task = row.original;
				return (
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"font-medium text-foreground truncate",
									isTerminalStatus(task.status) &&
										"line-through text-muted-foreground"
								)}
							>
								{task.title}
							</span>
						</div>
						{task.description && (
							<p className="text-sm text-muted-foreground truncate max-w-[300px]">
								{task.description}
							</p>
						)}
					</div>
				);
			},
		},
		{
			accessorKey: "date",
			header: "Due Date",
			cell: ({ row }) => {
				const task = row.original;
				const overdue = isOverdue(task);
				return (
					<div
						className={cn(
							"flex items-center gap-1.5 text-sm",
							overdue
								? "text-red-600 dark:text-red-400"
								: "text-muted-foreground"
						)}
					>
						<Calendar className="h-3.5 w-3.5 shrink-0" />
						<span>{formatRelativeDate(task.date)}</span>
					</div>
				);
			},
		},
		{
			id: "client",
			header: "Client",
			cell: ({ row }) => {
				const task = row.original;
				const client = clients?.find((c) => c._id === task.clientId);
				if (!client) {
					return <span className="text-sm text-muted-foreground">—</span>;
				}
				return (
					<Badge
						variant="outline"
						className="gap-1.5 font-normal text-xs"
					>
						<Building2 className="h-3 w-3 text-primary" />
						<span className="truncate max-w-[120px]">
							{client.companyName}
						</span>
					</Badge>
				);
			},
		},
		{
			id: "project",
			header: "Project",
			cell: ({ row }) => {
				const task = row.original;
				const project = projects?.find((p) => p._id === task.projectId);
				if (!project) {
					return <span className="text-sm text-muted-foreground">—</span>;
				}
				return (
					<Badge
						variant="outline"
						className="gap-1.5 font-normal text-xs"
					>
						<FolderOpen className="h-3 w-3 text-primary" />
						<span className="truncate max-w-[120px]">{project.title}</span>
					</Badge>
				);
			},
		},
		{
			id: "assignee",
			header: "Assignee",
			cell: ({ row }) => {
				const task = row.original;
				const assignee = users?.find((u) => u._id === task.assigneeUserId);
				if (!assignee) {
					return (
						<span className="text-sm text-muted-foreground">Unassigned</span>
					);
				}
				return (
					<Badge
						variant="outline"
						className="gap-1.5 font-normal text-xs"
					>
						<User className="h-3 w-3 text-primary" />
						<span className="truncate max-w-[100px]">
							{assignee.name || assignee.email}
						</span>
					</Badge>
				);
			},
		},
		{
			id: "actions",
			header: "",
			size: 80,
			cell: ({ row }) => {
				const task = row.original;
				const isUpdating = updatingTasks.has(task._id);
				return (
					<div className="flex items-center gap-1">
						<button
							onClick={() => onEdit(task)}
							disabled={isUpdating || !canModify}
							className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
							title="Edit task"
						>
							<Edit className="h-3.5 w-3.5" />
						</button>
						<button
							onClick={() => onDelete(task)}
							disabled={isUpdating || !canDelete}
							className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors"
							title="Delete task"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</div>
				);
			},
		},
	];
}

// --- Group Table ---

function GroupTable({
	group,
	columns,
}: {
	group: TaskGroup;
	columns: ColumnDef<Task>[];
}) {
	const table = useReactTable({
		data: group.tasks,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="mb-6">
			{/* Group header */}
			<div className="flex items-center gap-2 px-4 py-2 mb-1">
				<Badge variant={group.variant} className="text-xs">
					{group.label}
				</Badge>
				<span className="text-xs text-muted-foreground">
					{group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
				</span>
			</div>

			{/* Table for this group */}
			<DataGrid
				table={table}
				recordCount={group.tasks.length}
				tableLayout={{ width: "auto", headerBackground: true }}
				rowClassName={(task) =>
					isTerminalStatus(task.status) ? "opacity-60" : undefined
				}
			>
				<DataGridContainer className="rounded-lg border">
					<DataGridTable />
				</DataGridContainer>
			</DataGrid>
		</div>
	);
}

// --- Main Page ---

function TasksPageContent() {
	const searchParams = useSearchParams();
	const projectIdFromUrl = searchParams.get(
		"projectId"
	) as Id<"projects"> | null;

	const [searchQuery, setSearchQuery] = useState("");
	const [filters, setFilters] = useState<Filter<unknown>[]>([]);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [updatingTasks, setUpdatingTasks] = useState<Set<Id<"tasks">>>(
		new Set()
	);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
	const { can } = usePermissions();
	const canModifyTasks = can("tasks", "modify");
	const canDeleteTasks = can("tasks", "delete");

	// Queries
	const allTasks = useQuery(api.tasks.list, {});
	// Skip without the projects/clients grant — gated endpoints throw FORBIDDEN otherwise.
	const projects = useQuery(api.projects.list, can("projects") ? {} : "skip");
	const clients = useQuery(api.clients.list, can("clients") ? {} : "skip");
	const users = useQuery(api.users.listByOrg, {});

	// Mutations
	const updateTaskMutation = useMutation(api.tasks.update);
	const completeTaskMutation = useMutation(api.tasks.complete);
	const deleteTaskMutation = useMutation(api.tasks.remove);

	const isLoading = allTasks === undefined;

	// Get project name if filtering by project
	const filteredProject = projectIdFromUrl
		? projects?.find((p) => p._id === projectIdFromUrl)
		: null;

	// Define filter fields configuration
	const filterFields: FilterFieldConfig<unknown>[] = useMemo(() => {
		const statusOptions = [
			{ value: "pending", label: "Pending" },
			{ value: "in-progress", label: "In Progress" },
			{ value: "completed", label: "Completed" },
			{ value: "cancelled", label: "Cancelled" },
		];

		const clientOptions =
			clients?.map((client) => ({
				value: client._id,
				label: client.companyName,
			})) || [];

		const projectOptions =
			projects?.map((project) => ({
				value: project._id,
				label: project.title,
			})) || [];

		const assigneeOptions =
			users?.map(
				(user: { _id: Id<"users">; name?: string; email: string }) => ({
					value: user._id,
					label: user.name || user.email,
				})
			) || [];

		return [
			{
				key: "status",
				label: "Status",
				icon: <CheckCircle2 className="h-3 w-3" />,
				type: "select",
				options: statusOptions,
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
				key: "project",
				label: "Project",
				icon: <FolderOpen className="h-3 w-3" />,
				type: "multiselect",
				options: projectOptions,
				searchable: true,
			},
			{
				key: "assignee",
				label: "Assignee",
				icon: <User className="h-3 w-3" />,
				type: "multiselect",
				options: assigneeOptions,
				searchable: true,
			},
			{
				key: "date",
				label: "Date",
				icon: <Calendar className="h-3 w-3" />,
				type: "date",
				defaultOperator: "before",
				operators: [
					{ value: "before", label: "before" },
					{ value: "after", label: "after" },
					{ value: "is", label: "on" },
				],
				customRenderer: (p) => (
					<DateFilterValue values={p.values} onChange={p.onChange} />
				),
			},
		];
	}, [clients, projects, users]);

	// Filter tasks
	const filteredTasks = useMemo(() => {
		if (!allTasks) return [];

		let filtered = allTasks as Task[];

		// Project filter (from URL parameter)
		if (projectIdFromUrl) {
			filtered = filtered.filter((task) => task.projectId === projectIdFromUrl);
		}

		// Apply filters from the Filters component
		filters.forEach((filter) => {
			if (filter.values.length === 0) return;

			switch (filter.field) {
				case "status":
					filtered = filtered.filter((task) =>
						filter.values.includes(task.status as unknown)
					);
					break;
				case "client":
					filtered = filtered.filter((task) =>
						filter.values.includes(task.clientId as unknown)
					);
					break;
				case "project":
					filtered = filtered.filter((task) =>
						filter.values.includes(task.projectId as unknown)
					);
					break;
				case "assignee":
					filtered = filtered.filter(
						(task) =>
							task.assigneeUserId &&
							filter.values.includes(task.assigneeUserId as unknown)
					);
					break;
				case "date":
					filtered = filtered.filter((task) =>
						matchesDateFilter(task.date, filter.operator, filter.values[0])
					);
					break;
			}
		});

		// Search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(task) =>
					task.title.toLowerCase().includes(query) ||
					task.description?.toLowerCase().includes(query)
			);
		}

		// Sort by date ascending within groups
		filtered.sort((a, b) => a.date - b.date);

		return filtered;
	}, [allTasks, projectIdFromUrl, filters, searchQuery]);

	// Group tasks
	const groups = useMemo(() => groupTasks(filteredTasks), [filteredTasks]);

	// Handlers
	const handleToggleComplete = async (task: Task) => {
		if (task.status === "cancelled") return;
		setUpdatingTasks((prev) => new Set(prev).add(task._id));
		try {
			if (task.status === "completed") {
				await updateTaskMutation({ id: task._id, status: "pending" });
			} else {
				await completeTaskMutation({ id: task._id });
			}
		} catch (error) {
			console.error("Error updating task:", error);
		} finally {
			setUpdatingTasks((prev) => {
				const newSet = new Set(prev);
				newSet.delete(task._id);
				return newSet;
			});
		}
	};

	const handleEdit = (task: Task) => {
		setEditingTask(task);
	};

	const handleDeleteRequest = (task: Task) => {
		setTaskToDelete(task);
		setDeleteModalOpen(true);
	};

	const confirmDelete = async () => {
		if (!taskToDelete) return;
		setUpdatingTasks((prev) => new Set(prev).add(taskToDelete._id));
		try {
			await deleteTaskMutation({ id: taskToDelete._id });
			setDeleteModalOpen(false);
			setTaskToDelete(null);
		} catch (error) {
			// Re-throw so the modal shows a single error toast, not a false success.
			throw error;
		} finally {
			if (taskToDelete) {
				setUpdatingTasks((prev) => {
					const newSet = new Set(prev);
					newSet.delete(taskToDelete._id);
					return newSet;
				});
			}
		}
	};

	// Stats
	const todayStart = (() => {
		const now = new Date();
		return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	})();
	const totalTasks = allTasks?.length || 0;
	const completedTasks =
		allTasks?.filter((t) => t.status === "completed").length || 0;
	const overdueTasks =
		allTasks?.filter(
			(t) => t.date < todayStart && !isTerminalStatus(t.status)
		).length || 0;

	// Columns
	const columns = useMemo(
		() =>
			createColumns(
				clients as
					| { _id: Id<"clients">; companyName: string }[]
					| undefined,
				projects as
					| { _id: Id<"projects">; title: string }[]
					| undefined,
				users as
					| { _id: Id<"users">; name?: string; email: string }[]
					| undefined,
				handleToggleComplete,
				handleEdit,
				handleDeleteRequest,
				updatingTasks,
				canModifyTasks,
				canDeleteTasks
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[clients, projects, users, updatingTasks, canModifyTasks, canDeleteTasks]
	);

	return (
		<div className="p-4 sm:p-6 lg:p-8 space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">
							Tasks
							{filteredProject && (
								<span className="text-lg font-normal text-muted-foreground ml-2">
									for {filteredProject.title}
								</span>
							)}
						</h1>
						<p className="text-muted-foreground text-sm">
							{isLoading
								? "Loading tasks..."
								: `${totalTasks} total \u2022 ${completedTasks} completed \u2022 ${overdueTasks} overdue`}
						</p>
					</div>
				</div>
				<TaskSheet
					mode="create"
					trigger={
						<Button disabled={!canModifyTasks}>
							<Plus className="h-4 w-4" />
							New Task
						</Button>
					}
				/>
			</div>

			{/* Filters and Search */}
			<div className="flex flex-col sm:flex-row gap-4 items-start">
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

				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search tasks..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10"
					/>
				</div>

				{searchQuery.trim() !== "" && filters.length === 0 && (
					<Button variant="outline" onClick={() => setSearchQuery("")}>
						<X className="h-4 w-4" />
						Clear
					</Button>
				)}
			</div>

			{/* Tasks Content */}
			{isLoading ? (
				<div className="bg-card rounded-lg border p-8">
					<div className="space-y-4">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="flex items-center gap-4">
								<Skeleton className="h-5 w-5 rounded-full" />
								<Skeleton className="h-5 flex-1" />
								<Skeleton className="h-5 w-20" />
								<Skeleton className="h-5 w-16" />
								<Skeleton className="h-5 w-24" />
							</div>
						))}
					</div>
				</div>
			) : groups.length > 0 ? (
				<div className="space-y-2">
					{groups.map((group) => (
						<GroupTable
							key={group.label}
							group={group}
							columns={columns}
						/>
					))}
				</div>
			) : (
				<div className="bg-card rounded-lg border">
					<EmptyState
						size="md"
						icon={<Calendar />}
						title="No tasks found"
						description={
							searchQuery || filters.length > 0
								? "No tasks match your current filters or search. Try adjusting your filters or clearing them."
								: "You haven't created any tasks yet. Create your first task to get started."
						}
						action={
							!searchQuery && filters.length === 0 ? (
								<TaskSheet
									mode="create"
									trigger={
										<Button disabled={!canModifyTasks}>
											<Plus className="h-4 w-4" />
											Create Your First Task
										</Button>
									}
								/>
							) : undefined
						}
					/>
				</div>
			)}

			{/* Edit Task Sheet */}
			{editingTask && (
				<TaskSheet
					task={editingTask}
					mode="edit"
					isOpen={true}
					onOpenChange={(open) => !open && setEditingTask(null)}
				/>
			)}

			{/* Delete Confirmation Modal */}
			{taskToDelete && (
				<DeleteConfirmationModal
					isOpen={deleteModalOpen}
					onClose={() => {
						setDeleteModalOpen(false);
						setTaskToDelete(null);
					}}
					onConfirm={confirmDelete}
					title="Delete Task"
					itemName={taskToDelete.title}
					itemType="Task"
				/>
			)}
		</div>
	);
}

export default function TasksPage() {
	return (
		<PermissionGate object="tasks">
			<TasksPageContent />
		</PermissionGate>
	);
}
