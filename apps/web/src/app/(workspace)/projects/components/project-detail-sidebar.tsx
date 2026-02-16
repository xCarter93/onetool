"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/styled";
import { StyledMultiSelector } from "@/components/ui/styled/styled-multi-selector";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import {
	CircleDot,
	Layers,
	Calendar as CalendarIcon,
	CalendarCheck,
	FileText,
	Users,
	Hash,
	Building2,
	User,
	Mail,
	Phone,
	MapPin,
	Receipt,
	CheckCircle,
	DollarSign,
	FolderOpen,
	Pencil,
	Check,
	X,
} from "lucide-react";
import Link from "next/link";

function formatDate(timestamp?: number) {
	if (!timestamp) return "\u2014";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatCurrency(cents: number) {
	return "$" + cents.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

const STATUS_OPTIONS = [
	{ value: "planned", label: "Planned" },
	{ value: "in-progress", label: "In Progress" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTIONS = [
	{ value: "one-off", label: "One-off" },
	{ value: "recurring", label: "Recurring" },
];

type EditingField = "status" | "projectType" | "startDate" | "endDate" | "description" | "assignedUserIds" | null;

interface ProjectDetailSidebarProps {
	project: Doc<"projects">;
	projectId: Id<"projects">;
	client: Doc<"clients"> | null | undefined;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	quotes: Doc<"quotes">[] | undefined;
}

export function ProjectDetailSidebar({
	project,
	projectId,
	client,
	primaryContact,
	primaryProperty,
	quotes,
}: ProjectDetailSidebarProps) {
	const toast = useToast();
	const updateProject = useMutation(api.projects.update);
	const users = useQuery(api.users.listByOrg);

	const [editingField, setEditingField] = useState<EditingField>(null);
	const [editValue, setEditValue] = useState("");
	const [editDateValue, setEditDateValue] = useState<Date | undefined>(undefined);
	const [editAssignedUsers, setEditAssignedUsers] = useState<string[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (editingField === "description" && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.selectionStart = textareaRef.current.value.length;
		}
	}, [editingField]);

	const startEditing = (field: EditingField, currentValue: string) => {
		setEditingField(field);
		setEditValue(currentValue);
	};

	const startEditingDate = (field: "startDate" | "endDate", currentTimestamp?: number) => {
		setEditingField(field);
		setEditDateValue(currentTimestamp ? new Date(currentTimestamp) : undefined);
	};

	const startEditingAssignedUsers = () => {
		setEditingField("assignedUserIds");
		setEditAssignedUsers((project.assignedUserIds || []) as string[]);
	};

	const cancelEditing = () => {
		setEditingField(null);
		setEditValue("");
		setEditDateValue(undefined);
		setEditAssignedUsers([]);
	};

	const saveField = async (field: string, value: string | number | string[] | undefined) => {
		try {
			await updateProject({
				id: projectId,
				[field]: value,
			});
			const labels: Record<string, string> = {
				status: "Status",
				projectType: "Project type",
				startDate: "Start date",
				endDate: "End date",
				description: "Description",
				assignedUserIds: "Assigned users",
			};
			const label = labels[field] || field;
			toast.success("Updated", `${label} saved.`);
			cancelEditing();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save";
			toast.error("Error", message);
		}
	};

	const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			saveField("description", editValue || undefined);
		}
		if (e.key === "Escape") {
			cancelEditing();
		}
	};

	// Compute quote summary
	const totalQuotes = quotes?.length ?? 0;
	const approvedQuotes = quotes?.filter((q) => q.status === "approved").length ?? 0;
	const totalQuoted = quotes?.reduce((sum, q) => sum + (q.total || 0), 0) ?? 0;

	// Shared save/cancel button pair
	const renderActions = (onSave: () => void) => (
		<div className="flex items-center gap-0.5 shrink-0 ml-auto">
			<button
				onClick={(e) => { e.stopPropagation(); onSave(); }}
				className="p-1 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
				aria-label="Save"
			>
				<Check className="h-3.5 w-3.5" />
			</button>
			<button
				onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
				className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
				aria-label="Cancel"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);

	// Shared pencil icon for non-editing rows
	const renderPencil = () => (
		<Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto mt-0.5" />
	);

	return (
		<div className="px-5 py-4">
			{/* Record Details Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Record Details
			</h3>
			<div className="space-y-0">
				{/* Status */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "status" && startEditing("status", project.status)}
				>
					<CircleDot className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Status</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "status" && e.stopPropagation()}>
						{editingField === "status" ? (
							<StyledSelect value={editValue} onValueChange={setEditValue}>
								<StyledSelectTrigger className="h-8">
									<SelectValue />
								</StyledSelectTrigger>
								<StyledSelectContent>
									{STATUS_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						) : (
							<ProminentStatusBadge
								status={project.status}
								size="default"
								showIcon={false}
								entityType="project"
							/>
						)}
					</div>
					{editingField === "status"
						? renderActions(() => saveField("status", editValue))
						: renderPencil()
					}
				</div>

				{/* Project Type */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "projectType" && startEditing("projectType", project.projectType)}
				>
					<Layers className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Project Type</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "projectType" && e.stopPropagation()}>
						{editingField === "projectType" ? (
							<StyledSelect value={editValue} onValueChange={setEditValue}>
								<StyledSelectTrigger className="h-8">
									<SelectValue />
								</StyledSelectTrigger>
								<StyledSelectContent>
									{TYPE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						) : (
							<span className="text-sm text-foreground capitalize">
								{project.projectType === "one-off" ? "One-off" : "Recurring"}
							</span>
						)}
					</div>
					{editingField === "projectType"
						? renderActions(() => saveField("projectType", editValue))
						: renderPencil()
					}
				</div>

				{/* Start Date */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "startDate" && startEditingDate("startDate", project.startDate)}
				>
					<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Start Date</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "startDate" && e.stopPropagation()}>
						{editingField === "startDate" ? (
							<Popover open={true} onOpenChange={(open) => { if (!open) cancelEditing(); }}>
								<PopoverTrigger asChild>
									<button className="text-sm text-primary hover:text-primary/80">
										{editDateValue ? formatDate(editDateValue.getTime()) : "Select date..."}
									</button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="start">
									<Calendar
										mode="single"
										selected={editDateValue}
										onSelect={(date) => {
											if (date) {
												saveField("startDate", date.getTime());
											}
										}}
									/>
								</PopoverContent>
							</Popover>
						) : (
							<span className="text-sm text-foreground">
								{project.startDate ? formatDate(project.startDate) : <span className="text-muted-foreground italic">Not set</span>}
							</span>
						)}
					</div>
					{editingField !== "startDate" && renderPencil()}
				</div>

				{/* End Date */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "endDate" && startEditingDate("endDate", project.endDate)}
				>
					<CalendarCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">End Date</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "endDate" && e.stopPropagation()}>
						{editingField === "endDate" ? (
							<Popover open={true} onOpenChange={(open) => { if (!open) cancelEditing(); }}>
								<PopoverTrigger asChild>
									<button className="text-sm text-primary hover:text-primary/80">
										{editDateValue ? formatDate(editDateValue.getTime()) : "Select date..."}
									</button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="start">
									<Calendar
										mode="single"
										selected={editDateValue}
										onSelect={(date) => {
											if (date) {
												saveField("endDate", date.getTime());
											}
										}}
										disabled={(date) => {
											if (!project.startDate) return false;
											const start = new Date(project.startDate);
											start.setHours(0, 0, 0, 0);
											const checkDate = new Date(date);
											checkDate.setHours(0, 0, 0, 0);
											return checkDate < start;
										}}
									/>
								</PopoverContent>
							</Popover>
						) : (
							<span className="text-sm text-foreground">
								{project.endDate ? formatDate(project.endDate) : <span className="text-muted-foreground italic">Not set</span>}
							</span>
						)}
					</div>
					{editingField !== "endDate" && renderPencil()}
				</div>

				{/* Description */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "description" && startEditing("description", project.description || "")}
				>
					<FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Description</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "description" && e.stopPropagation()}>
						{editingField === "description" ? (
							<div className="space-y-1.5">
								<textarea
									ref={textareaRef}
									value={editValue}
									onChange={(e) => setEditValue(e.target.value)}
									onKeyDown={handleDescriptionKeyDown}
									rows={3}
									className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
									placeholder="Add a description..."
								/>
								<span className="text-xs text-muted-foreground">Enter to save, Esc to cancel</span>
							</div>
						) : (
							<span className="text-sm text-foreground">
								{project.description ? (
									project.description.length > 120
										? project.description.slice(0, 120) + "..."
										: project.description
								) : (
									<span className="text-muted-foreground italic">Add description...</span>
								)}
							</span>
						)}
					</div>
					{editingField === "description"
						? renderActions(() => saveField("description", editValue || undefined))
						: renderPencil()
					}
				</div>

				{/* Assigned Users */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "assignedUserIds" && startEditingAssignedUsers()}
				>
					<Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Assigned To</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "assignedUserIds" && e.stopPropagation()}>
						{editingField === "assignedUserIds" ? (
							<StyledMultiSelector
								options={
									users?.map((user) => ({
										label: user.name || user.email,
										value: user._id,
									})) || []
								}
								value={editAssignedUsers}
								onValueChange={setEditAssignedUsers}
								placeholder="Select team members"
								maxCount={2}
								className="w-full"
							/>
						) : (
							<span className="text-sm text-foreground">
								{project.assignedUserIds && project.assignedUserIds.length > 0 ? (
									<AssignedUserNames userIds={project.assignedUserIds as string[]} users={users} />
								) : (
									<span className="text-muted-foreground italic">Unassigned</span>
								)}
							</span>
						)}
					</div>
					{editingField === "assignedUserIds"
						? renderActions(() =>
							saveField(
								"assignedUserIds",
								editAssignedUsers.length > 0 ? editAssignedUsers : undefined
							)
						)
						: renderPencil()
					}
				</div>

				{/* Project Number - Read only */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Project No.</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground font-mono">
							{project.projectNumber || projectId.slice(-6)}
						</span>
					</div>
				</div>

				{/* Created - Read only */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Created</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatDate(project._creationTime)}
						</span>
					</div>
				</div>
			</div>

			<Separator className="my-4" />

			{/* Client Information Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Client Information
			</h3>
			{client ? (
				<div className="space-y-0">
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">Client</span>
						<div className="flex-1 min-w-0">
							<Link
								href={`/clients/${client._id}`}
								className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
							>
								{client.companyName}
							</Link>
						</div>
					</div>

					{primaryContact && (
						<>
							<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
								<User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
								<span className="text-sm text-muted-foreground w-28 shrink-0">Contact</span>
								<div className="flex-1 min-w-0">
									<span className="text-sm text-foreground">
										{primaryContact.firstName} {primaryContact.lastName}
									</span>
								</div>
							</div>
							{primaryContact.email && (
								<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
									<Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
									<span className="text-sm text-muted-foreground w-28 shrink-0">Email</span>
									<div className="flex-1 min-w-0">
										<a
											href={`mailto:${primaryContact.email}`}
											className="text-sm text-primary hover:text-primary/80 truncate block"
										>
											{primaryContact.email}
										</a>
									</div>
								</div>
							)}
							{primaryContact.phone && (
								<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
									<Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
									<span className="text-sm text-muted-foreground w-28 shrink-0">Phone</span>
									<div className="flex-1 min-w-0">
										<span className="text-sm text-foreground">
											{primaryContact.phone}
										</span>
									</div>
								</div>
							)}
						</>
					)}

					{primaryProperty && (
						<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
							<MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
							<span className="text-sm text-muted-foreground w-28 shrink-0">Address</span>
							<div className="flex-1 min-w-0">
								<span className="text-sm text-foreground">
									{[
										primaryProperty.streetAddress,
										primaryProperty.city,
										[primaryProperty.state, primaryProperty.zipCode]
											.filter(Boolean)
											.join(" "),
									]
										.filter(Boolean)
										.join(", ")}
								</span>
							</div>
						</div>
					)}

					{!primaryContact && (
						<p className="text-sm text-muted-foreground py-2">
							No primary contact set
						</p>
					)}
				</div>
			) : (
				<p className="text-sm text-muted-foreground py-2">
					No client linked
				</p>
			)}

			<Separator className="my-4" />

			{/* Quote Summary Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Quote Summary
			</h3>
			<div className="space-y-0">
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Receipt className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Total Quotes</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">{totalQuotes}</span>
					</div>
				</div>
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Approved</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm font-medium text-foreground">{approvedQuotes}</span>
					</div>
				</div>
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Total Quoted</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm font-medium text-foreground">
							{formatCurrency(totalQuoted)}
						</span>
					</div>
				</div>
			</div>

			<Separator className="my-4" />

			{/* Documents Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Documents
			</h3>
			<ProjectDocumentsSidebar projectId={projectId} />
		</div>
	);
}

// Helper component for assigned user names
function AssignedUserNames({
	userIds,
	users,
}: {
	userIds: string[];
	users: Array<{ _id: string; name?: string; email: string }> | undefined;
}) {
	if (!users) return <span className="text-muted-foreground">Loading...</span>;
	const names = userIds
		.map((id) => {
			const user = users.find((u) => u._id === id);
			return user ? (user.name || user.email) : null;
		})
		.filter(Boolean);

	if (names.length === 0) return <span className="text-muted-foreground italic">Unassigned</span>;
	return <>{names.join(", ")}</>;
}

// Condensed documents view for sidebar
function ProjectDocumentsSidebar({ projectId }: { projectId: Id<"projects"> }) {
	const attachments = useQuery(api.messageAttachments.listByEntity, {
		entityType: "project",
		entityId: projectId,
	});
	const signedDocuments = useQuery(api.documents.listSignedByProject, {
		projectId,
	});

	if (attachments === undefined || signedDocuments === undefined) {
		return (
			<div className="animate-pulse space-y-2">
				<div className="h-4 bg-muted rounded w-3/4" />
				<div className="h-4 bg-muted rounded w-1/2" />
			</div>
		);
	}

	const totalDocs = (attachments?.length ?? 0) + (signedDocuments?.length ?? 0);

	if (totalDocs === 0) {
		return (
			<div className="flex items-center gap-3 py-2.5 -mx-2 px-2">
				<FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
				<span className="text-sm text-muted-foreground italic">No documents yet</span>
			</div>
		);
	}

	// Show most recent document
	const allDocs = [
		...(attachments || []).map((a) => ({ name: a.fileName, time: a.uploadedAt })),
		...(signedDocuments || []).map((d) => ({ name: d.fileName, time: d.uploadedAt })),
	].sort((a, b) => b.time - a.time);

	const mostRecent = allDocs[0];

	return (
		<div className="space-y-0">
			<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
				<FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
				<span className="text-sm text-muted-foreground w-28 shrink-0">Latest</span>
				<div className="flex-1 min-w-0">
					<span className="text-sm text-foreground truncate block">
						{mostRecent.name}
					</span>
					<span className="text-xs text-muted-foreground">
						{formatDate(mostRecent.time)}
					</span>
				</div>
			</div>
			{totalDocs > 1 && (
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<div className="h-4 w-4 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0" />
					<span className="text-xs text-muted-foreground">
						+{totalDocs - 1} more document{totalDocs - 1 !== 1 ? "s" : ""}
					</span>
				</div>
			)}
		</div>
	);
}
