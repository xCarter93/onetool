"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { StyledButton } from "@/components/ui/styled/styled-button";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/styled/styled-select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetTrigger,
	SheetFooter,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
	CalendarIcon,
	User,
	Building2,
	FolderOpen,
	Activity,
} from "lucide-react";
import { Task } from "@/types/task";

interface TaskSheetProps {
	task?: Task | null;
	onOpenChange?: (open: boolean) => void;
	trigger?: React.ReactNode;
	mode?: "create" | "edit";
	isOpen?: boolean;
	initialValues?: {
		clientId?: Id<"clients">;
		projectId?: Id<"projects">;
	};
}

const statusOptions = [
	{ value: "pending", label: "Pending", color: "text-gray-600" },
	{ value: "in-progress", label: "In Progress", color: "text-blue-600" },
	{ value: "completed", label: "Completed", color: "text-green-600" },
	{ value: "cancelled", label: "Cancelled", color: "text-red-600" },
];

const repeatOptions = [
	{ value: "none", label: "No repeat" },
	{ value: "daily", label: "Daily" },
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "yearly", label: "Yearly" },
];

export function TaskSheet({
	task,
	onOpenChange,
	trigger,
	mode,
	isOpen,
	initialValues,
}: TaskSheetProps) {
	const { success, error } = useToast();
	const [formData, setFormData] = useState({
		title: "",
		description: "",
		type: "external" as "internal" | "external",
		clientId: "" as Id<"clients"> | "",
		projectId: "" as Id<"projects"> | "",
		date: undefined as Date | undefined,
		assigneeUserId: "" as Id<"users"> | "",
		status: "pending" as Task["status"],
		repeat: "none" as Task["repeat"],
		repeatUntil: undefined as Date | undefined,
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [datePopoverOpen, setDatePopoverOpen] = useState(false);
	const [repeatUntilPopoverOpen, setRepeatUntilPopoverOpen] = useState(false);
	const [internalOpen, setInternalOpen] = useState(false);

	// Queries for form data
	const clients = useQuery(api.clients.list, {});
	const projects = useQuery(
		api.projects.list,
		formData.clientId ? { clientId: formData.clientId as Id<"clients"> } : {}
	);
	const users = useQuery(api.users.listByOrg);

	// Mutations
	const createTask = useMutation(api.tasks.create);
	const updateTask = useMutation(api.tasks.update);

	// Determine if this is create or edit mode
	const isEditMode = mode === "edit" || !!task;
	const isCreateMode = mode === "create" || !task;

	// Initialize form with task data when editing, or reset for create mode.
	// Done during render via the previous-value pattern (keyed on the inputs
	// that should trigger a re-init) instead of a setState-in-effect.
	const initKey = `${mode ?? ""}|${isEditMode}|${isCreateMode}|${task?._id ?? ""}|${task?.date ?? ""}|${initialValues?.clientId ?? ""}|${initialValues?.projectId ?? ""}`;
	const [prevInitKey, setPrevInitKey] = useState(initKey);
	if (initKey !== prevInitKey) {
		setPrevInitKey(initKey);
		if (isEditMode && task) {
			setFormData({
				title: task.title,
				description: task.description || "",
				type: task.type || "external",
				clientId: task.clientId || "",
				projectId: task.projectId || "",
				date: new Date(task.date),
				assigneeUserId: task.assigneeUserId || "",
				status: task.status,
				repeat: task.repeat || "none",
				repeatUntil: task.repeatUntil ? new Date(task.repeatUntil) : undefined,
			});
		} else if (isCreateMode) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			setFormData({
				title: "",
				description: "",
				type: "external",
				clientId: initialValues?.clientId || "",
				projectId: initialValues?.projectId || "",
				date: today,
				assigneeUserId: "",
				status: "pending",
				repeat: "none",
				repeatUntil: undefined,
			});
		}
	}

	const handleInputChange = (field: string, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }));

		// Clear project when client changes
		if (field === "clientId") {
			setFormData((prev) => ({ ...prev, projectId: "" }));
		}
	};

	const handleSubmit = async (e?: React.FormEvent) => {
		e?.preventDefault();

		if (!formData.title.trim()) {
			error("Error", "Task title is required");
			return;
		}

		if (formData.type === "external" && !formData.clientId) {
			error("Error", "Please select a client for external tasks");
			return;
		}

		if (!formData.date) {
			error("Error", "Please select a date");
			return;
		}

		if (
			formData.repeat &&
			formData.repeat !== "none" &&
			!formData.repeatUntil
		) {
			error("Error", "Please select an end date for recurring tasks");
			return;
		}

		setIsSubmitting(true);

		try {
			// Normalize dates to midnight UTC to avoid timezone issues
			const normalizeDate = (date: Date): number => {
				const normalized = new Date(date);
				// Get the date components in local timezone
				const year = normalized.getFullYear();
				const month = normalized.getMonth();
				const day = normalized.getDate();
				// Create a new date in UTC with these components
				return Date.UTC(year, month, day);
			};

			const taskDate = normalizeDate(formData.date);
			const repeatUntil = formData.repeatUntil
				? normalizeDate(formData.repeatUntil)
				: undefined;

			const taskData = {
				title: formData.title.trim(),
				description: formData.description.trim() || undefined,
				type: formData.type,
				clientId: formData.clientId
					? (formData.clientId as Id<"clients">)
					: undefined,
				projectId: formData.projectId
					? (formData.projectId as Id<"projects">)
					: undefined,
				date: taskDate,
				assigneeUserId: formData.assigneeUserId
					? (formData.assigneeUserId as Id<"users">)
					: undefined,
				status: formData.status,
				repeat: formData.repeat,
				repeatUntil,
			};

			if (isEditMode && task) {
				await updateTask({
					id: task._id,
					...taskData,
				});
				success("Success", "Task updated successfully!");
			} else {
				await createTask(taskData);
				success("Success", "Task created successfully!");
			}

			// Close the sheet
			if (trigger) {
				setInternalOpen(false);
			} else if (onOpenChange) {
				onOpenChange(false);
			}
		} catch (err) {
			console.error("Error saving task:", err);
			error(
				"Error",
				err instanceof Error ? err.message : "Failed to save task"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClose = () => {
		if (trigger) {
			setInternalOpen(false);
		} else if (onOpenChange) {
			onOpenChange(false);
		}
	};

	const sheetContent = (
		<SheetContent side="right" className="w-full sm:max-w-xl bg-background!">
			<div className="flex flex-col h-full overflow-hidden">
				<SheetHeader className="border-b border-border pb-4 shrink-0">
					<SheetTitle className="flex items-center gap-2 text-2xl font-semibold">
						{isEditMode ? "Edit Task" : "Create New Task"}
					</SheetTitle>
					<SheetDescription className="text-muted-foreground">
						{isEditMode
							? "Update the task details below."
							: "Add a new task to your schedule. Fill in the details below."}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto pt-6 px-6">
					<form onSubmit={handleSubmit} className="space-y-6">
						{/* Task Type Selector */}
						<div className="space-y-2.5">
							<label className="text-sm font-semibold text-foreground">
								Task Type
							</label>
							<StyledSelect
								value={formData.type}
								onValueChange={(value) =>
									handleInputChange("type", value as "internal" | "external")
								}
							>
								<StyledSelectTrigger className="w-full">
									<SelectValue />
								</StyledSelectTrigger>
								<StyledSelectContent>
									<SelectItem value="external">
										External (Client Task)
									</SelectItem>
									<SelectItem value="internal">Internal (Team Task)</SelectItem>
								</StyledSelectContent>
							</StyledSelect>
							<p className="text-xs text-muted-foreground">
								{formData.type === "external"
									? "External tasks require a client and can be linked to projects"
									: "Internal tasks are for your team and don't require a client"}
							</p>
						</div>

						{/* Title */}
						<div className="space-y-2.5">
							<label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
								Task Title <span className="text-danger">*</span>
							</label>
							<Input
								value={formData.title}
								onChange={(e) => handleInputChange("title", e.target.value)}
								placeholder="Enter task title..."
								className="w-full transition-all duration-200 hover:border-primary/50 focus:border-primary"
							/>
						</div>

						{/* Description */}
						<div className="space-y-2.5">
							<label className="text-sm font-semibold text-foreground">
								Description
							</label>
							<textarea
								value={formData.description}
								onChange={(e) =>
									handleInputChange("description", e.target.value)
								}
								placeholder="Add task description..."
								className={cn(
									"flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-sm",
									"placeholder:text-muted-foreground",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
									"disabled:cursor-not-allowed disabled:opacity-50",
									"transition-all duration-200 hover:border-primary/50 focus:border-primary",
									"resize-none"
								)}
								rows={4}
							/>
						</div>

						{/* Client Selection - Only for External Tasks */}
						{formData.type === "external" && (
							<div className="space-y-2.5">
								<label className="text-sm font-semibold text-foreground flex items-center gap-2">
									<Building2 className="h-4 w-4 text-primary" />
									Client <span className="text-danger">*</span>
								</label>
								<StyledSelect
									value={formData.clientId}
									onValueChange={(value) =>
										handleInputChange("clientId", value)
									}
								>
									<StyledSelectTrigger className="w-full">
										<SelectValue placeholder="Select a client..." />
									</StyledSelectTrigger>
									<StyledSelectContent>
										{clients?.map((client) => (
											<SelectItem key={client._id} value={client._id}>
												{client.companyName}
											</SelectItem>
										))}
									</StyledSelectContent>
								</StyledSelect>
							</div>
						)}

						{/* Project Selection - Only for External Tasks */}
						{formData.type === "external" && (
							<div className="space-y-2.5">
								<label className="text-sm font-semibold text-foreground flex items-center gap-2">
									<FolderOpen className="h-4 w-4 text-primary" />
									Project{" "}
									<span className="text-muted-foreground text-xs">
										(Optional)
									</span>
								</label>
								<StyledSelect
									value={formData.projectId}
									onValueChange={(value) =>
										handleInputChange("projectId", value)
									}
									disabled={!formData.clientId}
								>
									<StyledSelectTrigger
										className="w-full"
										disabled={!formData.clientId}
									>
										<SelectValue placeholder="No project selected" />
									</StyledSelectTrigger>
									<StyledSelectContent>
										{projects?.map((project) => (
											<SelectItem key={project._id} value={project._id}>
												{project.title}
											</SelectItem>
										))}
									</StyledSelectContent>
								</StyledSelect>
								{!formData.clientId && (
									<p className="text-xs text-muted-foreground">
										Select a client first to choose a project
									</p>
								)}
							</div>
						)}

						{/* Date */}
						<div className="space-y-2.5">
							<label className="text-sm font-semibold text-foreground flex items-center gap-2">
								<CalendarIcon className="h-4 w-4 text-primary" />
								Date <span className="text-danger">*</span>
							</label>
							<Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
								<PopoverTrigger asChild>
									<Button
										intent="outline"
										id="date-picker"
										className="w-full justify-start font-normal"
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{formData.date
											? formData.date.toLocaleDateString("en-US", {
													year: "numeric",
													month: "long",
													day: "numeric",
											  })
											: "Select date"}
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-auto p-0 bg-white dark:bg-gray-950"
									align="start"
								>
									<Calendar
										mode="single"
										selected={formData.date}
										onSelect={(date) => {
											if (date) {
												setFormData((prev) => ({ ...prev, date }));
												setDatePopoverOpen(false);
											}
										}}
										className="bg-white! dark:bg-gray-950!"
									/>
								</PopoverContent>
							</Popover>
						</div>

						{/* Status */}
						<div className="space-y-2.5">
							<label className="text-sm font-semibold text-foreground flex items-center gap-2">
								<Activity className="h-4 w-4 text-primary" />
								Status
							</label>
							<StyledSelect
								value={formData.status}
								onValueChange={(value) => handleInputChange("status", value)}
							>
								<StyledSelectTrigger className="w-full">
									<SelectValue />
								</StyledSelectTrigger>
								<StyledSelectContent>
									{statusOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						</div>

						{/* Assignee */}
						<div className="space-y-2.5">
							<label className="text-sm font-semibold text-foreground flex items-center gap-2">
								<User className="h-4 w-4 text-primary" />
								Assign To
							</label>
							<StyledSelect
								value={formData.assigneeUserId || undefined}
								onValueChange={(value) =>
									handleInputChange("assigneeUserId", value)
								}
							>
								<StyledSelectTrigger className="w-full">
									<SelectValue placeholder="Unassigned" />
								</StyledSelectTrigger>
								<StyledSelectContent>
									{users?.map((user) => (
										<SelectItem key={user._id} value={user._id}>
											{user.name || user.email}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						</div>

						{/* Repeat Options */}
						<div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/50">
							<h3 className="text-sm font-semibold text-foreground">
								Recurrence
							</h3>
							<div className="space-y-2.5">
								<label className="text-xs font-medium text-foreground">
									Repeat
								</label>
								<StyledSelect
									value={formData.repeat}
									onValueChange={(value) => handleInputChange("repeat", value)}
								>
									<StyledSelectTrigger className="w-full">
										<SelectValue />
									</StyledSelectTrigger>
									<StyledSelectContent>
										{repeatOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</StyledSelectContent>
								</StyledSelect>
							</div>

							{formData.repeat !== "none" && (
								<div className="flex flex-col gap-2 animate-in fade-in-50 slide-in-from-top-2 duration-200">
									<Label
										htmlFor="repeat-until-picker"
										className="text-xs font-medium text-foreground flex items-center gap-1"
									>
										Repeat Until <span className="text-danger">*</span>
									</Label>
									<Popover
										open={repeatUntilPopoverOpen}
										onOpenChange={setRepeatUntilPopoverOpen}
									>
										<PopoverTrigger asChild>
											<Button
												intent="outline"
												id="repeat-until-picker"
												className="w-full justify-start font-normal"
											>
												<CalendarIcon className="mr-2 h-4 w-4" />
												{formData.repeatUntil
													? formData.repeatUntil.toLocaleDateString("en-US", {
															year: "numeric",
															month: "long",
															day: "numeric",
													  })
													: "Select end date"}
											</Button>
										</PopoverTrigger>
										<PopoverContent
											className="w-auto p-0 bg-white dark:bg-gray-950"
											align="start"
										>
											<Calendar
												mode="single"
												selected={formData.repeatUntil}
												onSelect={(date) => {
													if (date) {
														setFormData((prev) => ({
															...prev,
															repeatUntil: date,
														}));
														setRepeatUntilPopoverOpen(false);
													}
												}}
												disabled={(date) => {
													if (!formData.date) return false;
													const taskDate = new Date(formData.date);
													taskDate.setHours(0, 0, 0, 0);
													const checkDate = new Date(date);
													checkDate.setHours(0, 0, 0, 0);
													return checkDate < taskDate;
												}}
												className="bg-white! dark:bg-gray-950!"
											/>
										</PopoverContent>
									</Popover>
								</div>
							)}
						</div>
					</form>
				</div>

				<SheetFooter className="flex flex-row justify-end gap-3 border-t border-border shrink-0">
					<StyledButton
						type="button"
						intent="outline"
						onClick={handleClose}
						disabled={isSubmitting}
						label="Cancel"
						showArrow={false}
					/>
					<StyledButton
						type="button"
						intent="primary"
						onClick={() => handleSubmit()}
						isLoading={isSubmitting}
						disabled={
							isSubmitting ||
							!formData.title.trim() ||
							(formData.type === "external" && !formData.clientId) ||
							(formData.repeat !== "none" && !formData.repeatUntil)
						}
						label={
							isSubmitting
								? isEditMode
									? "Updating..."
									: "Creating..."
								: isEditMode
								? "Update Task"
								: "Create Task"
						}
						className="min-w-[120px]"
						showArrow={false}
					/>
				</SheetFooter>
			</div>
		</SheetContent>
	);

	// If trigger is provided, wrap in Sheet with trigger
	if (trigger) {
		return (
			<Sheet open={internalOpen} onOpenChange={setInternalOpen}>
				<SheetTrigger asChild>{trigger}</SheetTrigger>
				{sheetContent}
			</Sheet>
		);
	}

	// If controlled from parent with isOpen prop
	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			{sheetContent}
		</Sheet>
	);
}

// Export default for easier importing
export default TaskSheet;
