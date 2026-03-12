"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TaskSheet } from "@/components/shared/task-sheet";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import {
	StyledBadge,
	StyledButton,
	StyledTable,
	StyledTableBody,
	StyledTableCell,
	StyledTableHead,
	StyledTableHeader,
	StyledTableRow,
} from "@/components/ui/styled";
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Calendar,
	User,
	Plus,
	CheckCircle2,
	Circle,
	Search,
	Building2,
	FolderOpen,
	Edit,
	Trash2,
	ClipboardList,
} from "lucide-react";
import { Task } from "@/types/task";

// --- Grouping logic (matches tasks page) ---

interface TaskGroup {
	label: string;
	tasks: Task[];
	variant: "destructive" | "default" | "secondary" | "outline";
}

function groupTasks(tasks: Task[]): TaskGroup[] {
	const now = new Date();
	const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	const todayEnd = todayStart + 86400000;

	const dayOfWeek = now.getUTCDay();
	const daysUntilEndOfWeek = 7 - dayOfWeek;
	const endOfWeek = todayStart + daysUntilEndOfWeek * 86400000;

	const overdue: Task[] = [];
	const today: Task[] = [];
	const thisWeek: Task[] = [];
	const upcoming: Task[] = [];
	const completed: Task[] = [];

	for (const task of tasks) {
		if (task.status === "completed") {
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
	return task.date < todayStart && task.status !== "completed";
}

// --- Columns ---

function createColumns(
	entityType: "client" | "project",
	clients: { _id: Id<"clients">; companyName: string }[] | undefined,
	projects: { _id: Id<"projects">; title: string }[] | undefined,
	users:
		| { _id: Id<"users">; name?: string; email: string }[]
		| undefined,
	onToggleComplete: (task: Task) => void,
	onEdit: (task: Task) => void,
	onDelete: (task: Task) => void,
	updatingTasks: Set<Id<"tasks">>
): ColumnDef<Task>[] {
	const cols: ColumnDef<Task>[] = [
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
						disabled={isUpdating}
						className={cn(
							"p-0.5 rounded-full transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							isUpdating && "opacity-50 cursor-not-allowed"
						)}
					>
						{task.status === "completed" ? (
							<CheckCircle2 className="h-5 w-5 text-green-600" />
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
									task.status === "completed" &&
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
	];

	// Show project column on client pages (tasks may span projects)
	if (entityType === "client") {
		cols.push({
			id: "project",
			header: "Project",
			cell: ({ row }) => {
				const task = row.original;
				const project = projects?.find((p) => p._id === task.projectId);
				if (!project) {
					return <span className="text-sm text-muted-foreground">—</span>;
				}
				return (
					<StyledBadge
						variant="outline"
						className="gap-1.5 font-normal text-xs"
					>
						<FolderOpen className="h-3 w-3 text-primary" />
						<span className="truncate max-w-[120px]">{project.title}</span>
					</StyledBadge>
				);
			},
		});
	}

	// Show client column on project pages (for context)
	if (entityType === "project") {
		cols.push({
			id: "client",
			header: "Client",
			cell: ({ row }) => {
				const task = row.original;
				const client = clients?.find((c) => c._id === task.clientId);
				if (!client) {
					return <span className="text-sm text-muted-foreground">—</span>;
				}
				return (
					<StyledBadge
						variant="outline"
						className="gap-1.5 font-normal text-xs"
					>
						<Building2 className="h-3 w-3 text-primary" />
						<span className="truncate max-w-[120px]">
							{client.companyName}
						</span>
					</StyledBadge>
				);
			},
		});
	}

	// Assignee column
	cols.push({
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
				<StyledBadge
					variant="outline"
					className="gap-1.5 font-normal text-xs"
				>
					<User className="h-3 w-3 text-primary" />
					<span className="truncate max-w-[100px]">
						{assignee.name || assignee.email}
					</span>
				</StyledBadge>
			);
		},
	});

	// Actions column
	cols.push({
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
						disabled={isUpdating}
						className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
						title="Edit task"
					>
						<Edit className="h-3.5 w-3.5" />
					</button>
					<button
						onClick={() => onDelete(task)}
						disabled={isUpdating}
						className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors"
						title="Delete task"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				</div>
			);
		},
	});

	return cols;
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
			<div className="flex items-center gap-2 px-4 py-2 mb-1">
				<StyledBadge variant={group.variant} className="text-xs">
					{group.label}
				</StyledBadge>
				<span className="text-xs text-muted-foreground">
					{group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
				</span>
			</div>

			<div className="overflow-hidden rounded-lg border">
				<StyledTable>
					<StyledTableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<StyledTableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<StyledTableHead
										key={header.id}
										style={
											header.column.getSize() !== 150
												? { width: header.column.getSize() }
												: undefined
										}
									>
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
						{table.getRowModel().rows.map((row) => (
							<StyledTableRow
								key={row.id}
								className={cn(
									row.original.status === "completed" && "opacity-60"
								)}
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
						))}
					</StyledTableBody>
				</StyledTable>
			</div>
		</div>
	);
}

// --- Main Component ---

interface RecordTasksTabProps {
	tasks: Doc<"tasks">[] | undefined;
	onAddTask: () => void;
	entityType: "client" | "project";
}

export function RecordTasksTab({
	tasks,
	onAddTask,
	entityType,
}: RecordTasksTabProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [updatingTasks, setUpdatingTasks] = useState<Set<Id<"tasks">>>(
		new Set()
	);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

	// Queries for related data
	const clients = useQuery(api.clients.list, {});
	const projects = useQuery(api.projects.list, {});
	const users = useQuery(api.users.listByOrg, {});

	// Mutations
	const updateTaskMutation = useMutation(api.tasks.update);
	const completeTaskMutation = useMutation(api.tasks.complete);
	const deleteTaskMutation = useMutation(api.tasks.remove);

	// Filter and sort tasks
	const filteredTasks = useMemo(() => {
		if (!tasks) return [];

		let filtered = tasks as Task[];

		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(task) =>
					task.title.toLowerCase().includes(query) ||
					task.description?.toLowerCase().includes(query)
			);
		}

		filtered.sort((a, b) => a.date - b.date);
		return filtered;
	}, [tasks, searchQuery]);

	const groups = useMemo(() => groupTasks(filteredTasks), [filteredTasks]);

	// Handlers
	const handleToggleComplete = async (task: Task) => {
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
			console.error("Error deleting task:", error);
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

	// Columns
	const columns = useMemo(
		() =>
			createColumns(
				entityType,
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
				updatingTasks
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[clients, projects, users, updatingTasks, entityType]
	);

	const totalTasks = tasks?.length ?? 0;

	return (
		<div>
			{/* Header */}
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Tasks ({totalTasks})
				</h3>
				<StyledButton
					label="Add Task"
					icon={<Plus className="h-4 w-4" />}
					intent="outline"
					size="sm"
					onClick={onAddTask}
				/>
			</div>
			<Separator className="mb-4" />

			{/* Search */}
			{totalTasks > 0 && (
				<div className="relative mb-4">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search tasks..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10"
					/>
				</div>
			)}

			{/* Grouped tasks */}
			{groups.length > 0 ? (
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
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
						<ClipboardList className="h-6 w-6 text-muted-foreground" />
					</div>
					<p className="text-sm text-muted-foreground">
						{searchQuery
							? "No tasks match your search."
							: `No tasks for this ${entityType} yet.`}
					</p>
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
