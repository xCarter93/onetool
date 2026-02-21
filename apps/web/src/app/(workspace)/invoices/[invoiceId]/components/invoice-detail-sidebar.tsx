"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	StyledSelect,
	StyledSelectTrigger,
	StyledSelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/styled";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
	CircleDot,
	Calendar as CalendarIcon,
	CalendarCheck,
	Hash,
	Building2,
	User,
	Mail,
	Phone,
	MapPin,
	FolderOpen,
	DollarSign,
	Percent,
	Receipt,
	Pencil,
	Check,
	X,
	FileText,
	Eye,
	Download,
	History,
	Clock,
} from "lucide-react";
import Link from "next/link";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

function formatDate(timestamp?: number) {
	if (!timestamp) return "\u2014";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

const STATUS_OPTIONS = [
	{ value: "draft", label: "Draft" },
	{ value: "sent", label: "Sent" },
	{ value: "paid", label: "Paid" },
	{ value: "overdue", label: "Overdue" },
	{ value: "cancelled", label: "Cancelled" },
];

type EditingField = "status" | "dueDate" | null;

interface InvoiceDetailSidebarProps {
	invoice: Doc<"invoices">;
	invoiceId: Id<"invoices">;
	client: Doc<"clients"> | null | undefined;
	project: Doc<"projects"> | null | undefined;
	primaryContact: Doc<"clientContacts"> | null | undefined;
	primaryProperty: Doc<"clientProperties"> | null | undefined;
	// PDF section
	latestDocument: Doc<"documents"> | null | undefined;
	allDocumentVersions: Doc<"documents">[] | undefined;
	selectedDocument: Doc<"documents"> | null | undefined;
	selectedDocumentUrl: string | null | undefined;
	onGeneratePdf: () => void;
	onDownloadPdf: () => void;
	selectedVersionId: Id<"documents"> | null;
	onSelectVersion: (id: Id<"documents"> | null) => void;
	showVersionHistory: boolean;
	onToggleVersionHistory: () => void;
}

export function InvoiceDetailSidebar({
	invoice,
	invoiceId,
	client,
	project,
	primaryContact,
	primaryProperty,
	latestDocument,
	allDocumentVersions,
	selectedDocument,
	selectedDocumentUrl,
	onGeneratePdf,
	onDownloadPdf,
	selectedVersionId,
	onSelectVersion,
	showVersionHistory,
	onToggleVersionHistory,
}: InvoiceDetailSidebarProps) {
	const toast = useToast();
	const updateInvoice = useMutation(api.invoices.update);

	const [editingField, setEditingField] = useState<EditingField>(null);
	const [editValue, setEditValue] = useState("");
	const [editDateValue, setEditDateValue] = useState<Date | undefined>(
		undefined
	);

	const currentStatus =
		invoice.status === "sent" &&
		invoice.dueDate &&
		invoice.dueDate < Date.now()
			? "overdue"
			: (invoice.status as InvoiceStatus);

	const startEditing = (field: EditingField, currentValue: string) => {
		setEditingField(field);
		setEditValue(currentValue);
	};

	const startEditingDate = (
		field: "dueDate",
		currentTimestamp?: number
	) => {
		setEditingField(field);
		setEditDateValue(
			currentTimestamp ? new Date(currentTimestamp) : undefined
		);
	};

	const cancelEditing = () => {
		setEditingField(null);
		setEditValue("");
		setEditDateValue(undefined);
	};

	const saveField = async (
		field: string,
		value: string | number | undefined
	) => {
		try {
			await updateInvoice({
				id: invoiceId,
				[field]: value,
			});
			const labels: Record<string, string> = {
				status: "Status",
				dueDate: "Due date",
			};
			const label = labels[field] || field;
			toast.success("Updated", `${label} saved.`);
			cancelEditing();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to save";
			toast.error("Error", message);
		}
	};

	const renderActions = (onSave: () => void) => (
		<div className="flex items-center gap-0.5 shrink-0 ml-auto">
			<button
				onClick={(e) => {
					e.stopPropagation();
					onSave();
				}}
				className="p-1 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
				aria-label="Save"
			>
				<Check className="h-3.5 w-3.5" />
			</button>
			<button
				onClick={(e) => {
					e.stopPropagation();
					cancelEditing();
				}}
				className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
				aria-label="Cancel"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);

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
				{/* Status (editable) */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() =>
						editingField !== "status" &&
						startEditing("status", invoice.status)
					}
				>
					<CircleDot className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Status
					</span>
					<div
						className="flex-1 min-w-0"
						onClick={(e) =>
							editingField === "status" && e.stopPropagation()
						}
					>
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
										<SelectItem
											key={opt.value}
											value={opt.value}
										>
											{opt.label}
										</SelectItem>
									))}
								</StyledSelectContent>
							</StyledSelect>
						) : (
							<ProminentStatusBadge
								status={currentStatus}
								size="default"
								showIcon={false}
								entityType="invoice"
							/>
						)}
					</div>
					{editingField === "status"
						? renderActions(() =>
								saveField(
									"status",
									editValue as InvoiceStatus
								)
							)
						: renderPencil()}
				</div>

				{/* Due Date (editable) */}
				<div
					className="flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors group hover:bg-muted/50 cursor-pointer"
					onClick={() =>
						editingField !== "dueDate" &&
						startEditingDate("dueDate", invoice.dueDate)
					}
				>
					<CalendarCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Due Date
					</span>
					<div
						className="flex-1 min-w-0"
						onClick={(e) =>
							editingField === "dueDate" && e.stopPropagation()
						}
					>
						{editingField === "dueDate" ? (
							<Popover
								open={true}
								onOpenChange={(open) => {
									if (!open) cancelEditing();
								}}
							>
								<PopoverTrigger asChild>
									<button className="text-sm text-primary hover:text-primary/80">
										{editDateValue
											? formatDate(
													editDateValue.getTime()
												)
											: "Select date..."}
									</button>
								</PopoverTrigger>
								<PopoverContent
									className="w-auto p-0"
									align="start"
								>
									<Calendar
										mode="single"
										selected={editDateValue}
										onSelect={(date) => {
											if (date) {
												saveField(
													"dueDate",
													date.getTime()
												);
											}
										}}
									/>
								</PopoverContent>
							</Popover>
						) : (
							<span
								className={`text-sm ${
									currentStatus === "overdue"
										? "text-red-600 dark:text-red-400 font-medium"
										: "text-foreground"
								}`}
							>
								{invoice.dueDate ? (
									formatDate(invoice.dueDate)
								) : (
									<span className="text-muted-foreground italic">
										Not set
									</span>
								)}
							</span>
						)}
					</div>
					{editingField !== "dueDate" && renderPencil()}
				</div>

				{/* Invoice No. (read-only) */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Invoice No.
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground font-mono">
							{invoice.invoiceNumber || invoiceId.slice(-6)}
						</span>
					</div>
				</div>

				{/* Issued Date (read-only) */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<CalendarCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Issued Date
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatDate(invoice.issuedDate)}
						</span>
					</div>
				</div>

				{/* Created (read-only) */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Created
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatDate(invoice._creationTime)}
						</span>
					</div>
				</div>

				{/* Paid (conditional) */}
				{invoice.paidAt && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Paid
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-green-600 dark:text-green-400 font-medium">
								{formatDate(invoice.paidAt)}
							</span>
						</div>
					</div>
				)}
			</div>

			<Separator className="my-4" />

			{/* Client & Project Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Client & Project
			</h3>
			{client ? (
				<div className="space-y-0">
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Client
						</span>
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
								<span className="text-sm text-muted-foreground w-28 shrink-0">
									Contact
								</span>
								<div className="flex-1 min-w-0">
									<span className="text-sm text-foreground">
										{primaryContact.firstName}{" "}
										{primaryContact.lastName}
									</span>
								</div>
							</div>
							{primaryContact.email && (
								<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
									<Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
									<span className="text-sm text-muted-foreground w-28 shrink-0">
										Email
									</span>
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
									<span className="text-sm text-muted-foreground w-28 shrink-0">
										Phone
									</span>
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
							<span className="text-sm text-muted-foreground w-28 shrink-0">
								Address
							</span>
							<div className="flex-1 min-w-0">
								<span className="text-sm text-foreground">
									{[
										primaryProperty.streetAddress,
										primaryProperty.city,
										[
											primaryProperty.state,
											primaryProperty.zipCode,
										]
											.filter(Boolean)
											.join(" "),
									]
										.filter(Boolean)
										.join(", ")}
								</span>
							</div>
						</div>
					)}

					{project && (
						<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
							<FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
							<span className="text-sm text-muted-foreground w-28 shrink-0">
								Project
							</span>
							<div className="flex-1 min-w-0">
								<Link
									href={`/projects/${project._id}`}
									className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
								>
									{project.title}
								</Link>
								<div className="mt-1">
									<ProminentStatusBadge
										status={project.status}
										size="default"
										showIcon={false}
										entityType="project"
									/>
								</div>
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

			{/* Invoice Financials Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Invoice Financials
			</h3>
			<div className="space-y-0">
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Subtotal
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatCurrency(invoice.subtotal)}
						</span>
					</div>
				</div>

				{invoice.discountAmount != null && invoice.discountAmount > 0 && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<Percent className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Discount
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-red-600 dark:text-red-400">
								-{formatCurrency(invoice.discountAmount)}
							</span>
						</div>
					</div>
				)}

				{invoice.taxAmount != null && invoice.taxAmount > 0 && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<Receipt className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Tax
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-foreground">
								{formatCurrency(invoice.taxAmount)}
							</span>
						</div>
					</div>
				)}

				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0 font-medium">
						Total
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground font-medium">
							{formatCurrency(invoice.total)}
						</span>
					</div>
				</div>
			</div>

			<Separator className="my-4" />

			{/* Generated PDF Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Generated PDF
			</h3>
			<div className="py-2">
				{selectedDocumentUrl ? (
					<div className="space-y-4">
						{selectedDocument && (
							<div className="flex items-center gap-2 mb-2">
								<Badge variant="outline" className="text-xs">
									v{selectedDocument.version}
								</Badge>
							</div>
						)}
						<div className="h-48 bg-gray-50 dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
							<iframe
								src={selectedDocumentUrl}
								className="w-full h-full"
								title="PDF Preview"
								style={{ border: "none" }}
							/>
						</div>

						<div className="flex gap-2">
							<a
								href={selectedDocumentUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="flex-1"
							>
								<Button
									intent="outline"
									size="sm"
									className="w-full"
								>
									<Eye className="h-4 w-4 mr-2" />
									View
								</Button>
							</a>
							<Button
								intent="outline"
								size="sm"
								className="w-full flex-1"
								onClick={onDownloadPdf}
							>
								<Download className="h-4 w-4 mr-2" />
								Download
							</Button>
						</div>

						{allDocumentVersions &&
							allDocumentVersions.length > 1 && (
								<div className="pt-2 border-t border-gray-200 dark:border-gray-700">
									<Button
										intent="outline"
										size="sm"
										className="w-full"
										onClick={onToggleVersionHistory}
									>
										<History className="h-4 w-4 mr-2" />
										{showVersionHistory
											? "Hide"
											: "Show"}{" "}
										Version History (
										{allDocumentVersions.length})
									</Button>

									{showVersionHistory && (
										<div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
											{allDocumentVersions.map(
												(version) => (
													<button
														key={version._id}
														onClick={() => {
															onSelectVersion(
																version._id ===
																	latestDocument?._id
																	? null
																	: version._id
															);
														}}
														className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
															selectedVersionId ===
																version._id ||
															(!selectedVersionId &&
																version._id ===
																	latestDocument?._id)
																? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
																: "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
														}`}
													>
														<div className="flex items-center justify-between">
															<div className="flex items-center gap-2">
																<Clock className="h-3 w-3 text-gray-400" />
																<span className="font-medium">
																	Version{" "}
																	{
																		version.version
																	}
																</span>
																{version._id ===
																	latestDocument?._id && (
																	<Badge
																		variant="default"
																		className="text-xs"
																	>
																		Latest
																	</Badge>
																)}
															</div>
															<span className="text-xs text-gray-500">
																{new Date(
																	version.generatedAt
																).toLocaleDateString()}{" "}
																{new Date(
																	version.generatedAt
																).toLocaleTimeString(
																	[],
																	{
																		hour: "2-digit",
																		minute: "2-digit",
																	}
																)}
															</span>
														</div>
													</button>
												)
											)}
										</div>
									)}
								</div>
							)}
					</div>
				) : (
					<div className="text-center py-6">
						<FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
							No PDF generated yet
						</p>
						<Button
							intent="outline"
							size="sm"
							onClick={onGeneratePdf}
						>
							<FileText className="h-4 w-4 mr-2" />
							Generate PDF
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
