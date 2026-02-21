"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/styled";
import { StyledTagsInput } from "@/components/ui/styled/styled-tags-input";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import {
	Building2,
	CircleDot,
	Target,
	FileText,
	MessageSquare,
	Tag,
	Calendar,
	User,
	Briefcase,
	Mail,
	Phone,
	MapPin,
	Receipt,
	DollarSign,
	AlertCircle,
	Pencil,
	Check,
	X,
} from "lucide-react";
import { ClientDocumentsSection } from "./client-documents-section";

function formatLeadSource(leadSource?: string): string {
	if (!leadSource) return "Not specified";
	return leadSource
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function formatCommunicationPreference(pref?: string): string {
	if (!pref) return "Not specified";
	switch (pref) {
		case "email":
			return "Email only";
		case "phone":
			return "Phone";
		case "both":
			return "Email & Phone";
		default:
			return pref;
	}
}

function formatDate(timestamp?: number) {
	if (!timestamp) return "—";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

const LEAD_SOURCE_OPTIONS = [
	{ value: "referral", label: "Referral" },
	{ value: "website", label: "Website" },
	{ value: "social-media", label: "Social Media" },
	{ value: "google-ads", label: "Google Ads" },
	{ value: "cold-call", label: "Cold Call" },
	{ value: "trade-show", label: "Trade Show" },
	{ value: "word-of-mouth", label: "Word of Mouth" },
	{ value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
	{ value: "lead", label: "Lead" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
	{ value: "archived", label: "Archived" },
];

const COMM_PREF_OPTIONS = [
	{ value: "email", label: "Email only" },
	{ value: "phone", label: "Phone" },
	{ value: "both", label: "Email & Phone" },
];

type EditingField = "companyName" | "status" | "leadSource" | "description" | "communicationPreference" | null;

interface ClientDetailSidebarProps {
	client: Doc<"clients">;
	clientId: string;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	invoices: Doc<"invoices">[] | undefined;
}

export function ClientDetailSidebar({
	client,
	clientId,
	primaryContact,
	primaryProperty,
	invoices,
}: ClientDetailSidebarProps) {
	const toast = useToast();
	const updateClient = useMutation(api.clients.update);

	const [editingField, setEditingField] = useState<EditingField>(null);
	const [editValue, setEditValue] = useState("");
	const [localTags, setLocalTags] = useState<string[]>(client.tags || []);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	// Keep localTags in sync with client data
	useEffect(() => {
		const clientTagsStr = JSON.stringify(client.tags || []);
		const localTagsStr = JSON.stringify(localTags);
		if (localTagsStr !== clientTagsStr && editingField === null) {
			setLocalTags(client.tags || []);
		}
	}, [client.tags, localTags, editingField]);

	// Auto-focus inputs when entering edit mode
	useEffect(() => {
		if (editingField === "description" && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.selectionStart = textareaRef.current.value.length;
		}
		if (editingField === "companyName" && nameInputRef.current) {
			nameInputRef.current.focus();
			nameInputRef.current.selectionStart = nameInputRef.current.value.length;
		}
	}, [editingField]);

	const startEditing = (field: EditingField, currentValue: string) => {
		setEditingField(field);
		setEditValue(currentValue);
	};

	const cancelEditing = () => {
		setEditingField(null);
		setEditValue("");
	};

	const saveField = async (field: string, value: string | undefined) => {
		try {
			await updateClient({
				id: clientId as Id<"clients">,
				[field]: value,
			});
			const labels: Record<string, string> = {
				companyName: "Client name",
				companyDescription: "Description",
				communicationPreference: "Communication preference",
				leadSource: "Lead source",
			};
			const label = labels[field] || field.charAt(0).toUpperCase() + field.slice(1);
			toast.success("Updated", `${label} saved.`);
			setEditingField(null);
			setEditValue("");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save";
			toast.error("Error", message);
		}
	};

	const handleTagsChange: React.Dispatch<React.SetStateAction<string[]>> = (action) => {
		const newTags = typeof action === "function" ? action(localTags) : action;
		setLocalTags(newTags);
		// Auto-save tags
		updateClient({
			id: clientId as Id<"clients">,
			tags: newTags,
		}).catch(() => {
			toast.error("Error", "Failed to save tags");
			setLocalTags(client.tags || []);
		});
	};

	const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (editValue.trim()) {
				saveField("companyName", editValue.trim());
			}
		}
		if (e.key === "Escape") {
			cancelEditing();
		}
	};

	const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			saveField("companyDescription", editValue || undefined);
		}
		if (e.key === "Escape") {
			cancelEditing();
		}
	};

	const totalBilled = invoices?.reduce((sum, inv) => sum + inv.total, 0) ?? 0;
	const outstanding =
		invoices
			?.filter((inv) => inv.status !== "paid")
			.reduce((sum, inv) => sum + inv.total, 0) ?? 0;

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
				{/* Client Name */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "companyName" && startEditing("companyName", client.companyName)}
				>
					<Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Name</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "companyName" && e.stopPropagation()}>
						{editingField === "companyName" ? (
							<input
								ref={nameInputRef}
								type="text"
								value={editValue}
								onChange={(e) => setEditValue(e.target.value)}
								onKeyDown={handleNameKeyDown}
								className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
								placeholder="Client name..."
							/>
						) : (
							<span className="text-sm font-medium text-foreground">
								{client.companyName}
							</span>
						)}
					</div>
					{editingField === "companyName"
						? renderActions(() => { if (editValue.trim()) saveField("companyName", editValue.trim()); })
						: renderPencil()
					}
				</div>

				{/* Status */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "status" && startEditing("status", client.status)}
				>
					<CircleDot className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Status</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "status" && e.stopPropagation()}>
						{editingField === "status" ? (
							<StyledSelect
								value={editValue}
								onValueChange={setEditValue}
							>
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
								status={client.status}
								size="default"
								showIcon={false}
								entityType="client"
							/>
						)}
					</div>
					{editingField === "status"
						? renderActions(() => saveField("status", editValue))
						: renderPencil()
					}
				</div>

				{/* Lead Source */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "leadSource" && startEditing("leadSource", client.leadSource || "")}
				>
					<Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Lead Source</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "leadSource" && e.stopPropagation()}>
						{editingField === "leadSource" ? (
							<StyledSelect
								value={editValue}
								onValueChange={setEditValue}
							>
								<StyledSelectTrigger className="h-8">
									<SelectValue placeholder="Select source" />
								</StyledSelectTrigger>
								<StyledSelectContent>
									{LEAD_SOURCE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						) : (
							<span className="text-sm text-foreground">
								{formatLeadSource(client.leadSource)}
							</span>
						)}
					</div>
					{editingField === "leadSource"
						? renderActions(() => saveField("leadSource", editValue || undefined))
						: renderPencil()
					}
				</div>

				{/* Description */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "description" && startEditing("description", client.companyDescription || "")}
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
								{client.companyDescription ? (
									client.companyDescription.length > 120
										? client.companyDescription.slice(0, 120) + "..."
										: client.companyDescription
								) : (
									<span className="text-muted-foreground italic">Add description...</span>
								)}
							</span>
						)}
					</div>
					{editingField === "description"
						? renderActions(() => saveField("companyDescription", editValue || undefined))
						: renderPencil()
					}
				</div>

				{/* Communication Preference */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() => editingField !== "communicationPreference" && startEditing("communicationPreference", client.communicationPreference || "")}
				>
					<MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Comm. Pref.</span>
					<div className="flex-1 min-w-0" onClick={(e) => editingField === "communicationPreference" && e.stopPropagation()}>
						{editingField === "communicationPreference" ? (
							<StyledSelect
								value={editValue}
								onValueChange={setEditValue}
							>
								<StyledSelectTrigger className="h-8">
									<SelectValue placeholder="Select" />
								</StyledSelectTrigger>
								<StyledSelectContent>
									{COMM_PREF_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						) : (
							<span className="text-sm text-foreground">
								{formatCommunicationPreference(client.communicationPreference)}
							</span>
						)}
					</div>
					{editingField === "communicationPreference"
						? renderActions(() => saveField("communicationPreference", editValue || undefined))
						: renderPencil()
					}
				</div>

				{/* Tags */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Tags</span>
					<div className="flex-1 min-w-0">
						<StyledTagsInput
							tags={localTags}
							setTags={handleTagsChange}
							placeholder="Add a tag..."
							size="sm"
						/>
					</div>
				</div>

				{/* Created */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Created</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatDate(client._creationTime)}
						</span>
					</div>
				</div>
			</div>

			<Separator className="my-4" />

			{/* Primary Contact & Address Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Primary Contact & Address
			</h3>
			{primaryContact ? (
				<div className="space-y-0">
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">Name</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-foreground">
								{primaryContact.firstName} {primaryContact.lastName}
							</span>
						</div>
					</div>
					{primaryContact.jobTitle && (
						<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
							<Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
							<span className="text-sm text-muted-foreground w-28 shrink-0">Job Title</span>
							<div className="flex-1 min-w-0">
								<span className="text-sm text-foreground">
									{primaryContact.jobTitle}
								</span>
							</div>
						</div>
					)}
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
				</div>
			) : (
				<p className="text-sm text-muted-foreground py-2">
					No primary contact set
				</p>
			)}

			{/* Primary Address */}
			{primaryProperty ? (
				<div className="space-y-0 mt-1">
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
				</div>
			) : (
				primaryContact && (
					<p className="text-sm text-muted-foreground py-2 mt-1">
						No primary address set
					</p>
				)
			)}

			<Separator className="my-4" />

			{/* Billing Summary Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Billing Summary
			</h3>
			<div className="space-y-0">
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Receipt className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Total Invoices</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{invoices?.length ?? 0}
						</span>
					</div>
				</div>
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Total Billed</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm font-medium text-foreground">
							${totalBilled.toLocaleString()}
						</span>
					</div>
				</div>
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Outstanding</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm font-medium text-foreground">
							${outstanding.toLocaleString()}
						</span>
					</div>
				</div>
			</div>

			<Separator className="my-4" />
			<ClientDocumentsSection clientId={clientId as Id<"clients">} />
		</div>
	);
}
