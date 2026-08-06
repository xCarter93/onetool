"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectValue,
	SelectItem,
} from "@/components/ui/select";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { Separator } from "@/components/ui/separator";
import { DatePicker } from "@/components/ui/date-picker";
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
	Type,
	Pencil,
	Lock,
	Check,
	X,
	FileText,
	Eye,
	Download,
	History,
	Clock,
	AlertTriangle,
	RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/hooks/use-permissions";
import { formatCurrency } from "@/lib/money";
import {
	localDateToUtcMidnightMs,
	utcMidnightMsToLocalDate,
} from "@/lib/dates";

type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

function formatDate(timestamp?: number) {
	if (!timestamp) return "\u2014";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/** Stored UTC-midnight calendar dates re-projected so the local render shows the right day. */
function formatCalendarDate(timestamp?: number) {
	if (!timestamp) return "\u2014";
	return formatDate(utcMidnightMsToLocalDate(timestamp).getTime());
}

const STATUS_OPTIONS = [
	{ value: "draft", label: "Draft" },
	{ value: "sent", label: "Sent" },
	{ value: "approved", label: "Approved" },
	{ value: "declined", label: "Declined" },
	{ value: "expired", label: "Expired" },
];

type EditingField = "title" | "status" | "validUntil" | null;

interface QuoteDetailSidebarProps {
	quote: Doc<"quotes">;
	quoteId: Id<"quotes">;
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
	/** Quote content changed after the newest PDF was stored. */
	isPdfStale: boolean;
	onDownloadPdf: () => void;
	selectedVersionId: Id<"documents"> | null;
	onSelectVersion: (id: Id<"documents"> | null) => void;
	showVersionHistory: boolean;
	onToggleVersionHistory: () => void;
}

export function QuoteDetailSidebar({
	quote,
	quoteId,
	client,
	project,
	primaryContact,
	primaryProperty,
	latestDocument,
	allDocumentVersions,
	selectedDocument,
	selectedDocumentUrl,
	onGeneratePdf,
	isPdfStale,
	onDownloadPdf,
	selectedVersionId,
	onSelectVersion,
	showVersionHistory,
	onToggleVersionHistory,
}: QuoteDetailSidebarProps) {
	const toast = useToast();
	const updateQuote = useMutation(api.quotes.update);

	const { can, isLoading: permissionsLoading } = usePermissions();
	const canModify = can("quotes", "modify");
	// Without the documents grant the PDF queries are skipped forever, so
	// `undefined` there means "no access", not "still loading".
	const canViewDocuments = can("documents");
	const showReadOnly = !permissionsLoading && !canModify;
	// Editable rows get the interactive affordance; read-only rows sit flat.
	const rowClass = `flex items-start gap-3 py-2.5 -mx-2 px-2 rounded-md transition-colors${
		canModify ? " group hover:bg-muted/50 cursor-pointer" : ""
	}`;

	const [editingField, setEditingField] = useState<EditingField>(null);
	const [editValue, setEditValue] = useState("");
	const [editDateValue, setEditDateValue] = useState<Date | undefined>(
		undefined
	);

	const startEditing = (field: EditingField, currentValue: string) => {
		if (!canModify) return;
		setEditingField(field);
		setEditValue(currentValue);
	};

	const startEditingDate = (
		field: "validUntil",
		currentTimestamp?: number
	) => {
		if (!canModify) return;
		setEditingField(field);
		setEditDateValue(
			currentTimestamp ? utcMidnightMsToLocalDate(currentTimestamp) : undefined
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
			await updateQuote({
				id: quoteId,
				[field]: value,
			});
			const labels: Record<string, string> = {
				title: "Title",
				status: "Status",
				validUntil: "Valid until",
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

	const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (editValue.trim()) {
				saveField("title", editValue.trim());
			}
		}
		if (e.key === "Escape") {
			cancelEditing();
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

	const renderPencil = () =>
		canModify ? (
			<Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto mt-0.5" />
		) : null;

	return (
		<div className="px-5 py-4">
			{/* Record Details Section */}
			<div className="mb-3 flex items-center justify-between gap-2">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Record Details
				</h3>
				{showReadOnly && (
					<Badge variant="secondary" className="gap-1">
						<Lock className="h-3 w-3" />
						Read Only
					</Badge>
				)}
			</div>
			<div className="space-y-0">
				{/* Title */}
				<div
					className={rowClass}
					onClick={() =>
						editingField !== "title" &&
						startEditing("title", quote.title || "")
					}
				>
					<Type className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Title
					</span>
					<div
						className="flex-1 min-w-0"
						onClick={(e) =>
							editingField === "title" && e.stopPropagation()
						}
					>
						{editingField === "title" ? (
							<input
								type="text"
								value={editValue}
								onChange={(e) => setEditValue(e.target.value)}
								onKeyDown={handleTitleKeyDown}
								autoFocus
								className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
								placeholder="Quote title..."
							/>
						) : (
							<span className="text-sm text-foreground font-medium">
								{quote.title || "Untitled Quote"}
							</span>
						)}
					</div>
					{editingField === "title"
						? renderActions(() => {
								if (editValue.trim())
									saveField("title", editValue.trim());
							})
						: renderPencil()}
				</div>

				{/* Status */}
				<div
					className={rowClass}
					onClick={() =>
						editingField !== "status" &&
						startEditing("status", quote.status)
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
							<Select
								value={editValue}
								onValueChange={(value) => setEditValue(value as string)}
							>
								<SelectTrigger className="h-8">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUS_OPTIONS.map((opt) => (
										<SelectItem
											key={opt.value}
											value={opt.value}
										>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<ProminentStatusBadge
								status={quote.status}
								size="default"
								showIcon={false}
								entityType="quote"
							/>
						)}
					</div>
					{editingField === "status"
						? renderActions(() =>
								saveField("status", editValue as QuoteStatus)
							)
						: renderPencil()}
				</div>

				{/* Valid Until */}
				<div
					className={rowClass}
					onClick={() =>
						editingField !== "validUntil" &&
						startEditingDate("validUntil", quote.validUntil)
					}
				>
					<CalendarCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Valid Until
					</span>
					<div
						className="flex-1 min-w-0"
						onClick={(e) =>
							editingField === "validUntil" &&
							e.stopPropagation()
						}
					>
						{editingField === "validUntil" ? (
							<DatePicker
								open={true}
								onOpenChange={(open) => {
									if (!open) cancelEditing();
								}}
								value={editDateValue}
								onChange={(date) => {
									if (date) {
										saveField(
											"validUntil",
											localDateToUtcMidnightMs(date)
										);
									}
								}}
								formatDate={(date) => formatDate(date.getTime())}
								placeholder="Select date..."
								className="h-8"
							/>
						) : (
							<span className="text-sm text-foreground">
								{quote.validUntil ? (
									formatCalendarDate(quote.validUntil)
								) : (
									<span className="text-muted-foreground italic">
										Not set
									</span>
								)}
							</span>
						)}
					</div>
					{editingField !== "validUntil" && renderPencil()}
				</div>

				{/* Quote Number - Read only */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Quote No.
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground font-mono">
							{quote.quoteNumber || quoteId.slice(-6)}
						</span>
					</div>
				</div>

				{/* Created - Read only */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Created
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatDate(quote._creationTime)}
						</span>
					</div>
				</div>

				{/* Sent - Conditional */}
				{quote.sentAt && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Sent
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-foreground">
								{formatDate(quote.sentAt)}
							</span>
						</div>
					</div>
				)}

				{/* Approved - Conditional */}
				{quote.approvedAt && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Approved
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-foreground">
								{formatDate(quote.approvedAt)}
							</span>
						</div>
					</div>
				)}
			</div>

			<Separator className="my-4" />

			{/* Client & Project Information Section */}
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
							</div>
						</div>
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

			{/* Quote Financials Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Quote Financials
			</h3>
			<div className="space-y-0">
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">
						Subtotal
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-sm text-foreground">
							{formatCurrency(quote.subtotal)}
						</span>
					</div>
				</div>

				{quote.discountEnabled && quote.discountAmount && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<Percent className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Discount
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-red-600 dark:text-red-400">
								-
								{quote.discountType === "percentage"
									? `${quote.discountAmount}%`
									: formatCurrency(quote.discountAmount)}
							</span>
						</div>
					</div>
				)}

				{quote.taxEnabled && quote.taxAmount && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<Receipt className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">
							Tax
						</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-foreground">
								{formatCurrency(quote.taxAmount)}
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
							{formatCurrency(quote.total)}
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
				{latestDocument === null ? (
					<div className="rounded-lg border border-border bg-background/60 p-4">
						<div className="flex items-start gap-3">
							<FileText
								className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5"
								aria-hidden="true"
							/>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium text-foreground">
									No PDF yet
								</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Generate one to send this quote.
								</p>
								<Button
									variant="outline"
									size="sm"
									className="mt-3"
									onClick={onGeneratePdf}
									disabled={!canModify}
								>
									<FileText className="h-4 w-4" aria-hidden="true" />
									Generate PDF
								</Button>
							</div>
						</div>
					</div>
				) : latestDocument === undefined ? (
					<div className="rounded-lg border border-border bg-background/60 p-4">
						<p className="text-sm text-muted-foreground">
							{canViewDocuments
								? "Checking for a generated PDF…"
								: "You do not have access to this quote's documents."}
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{isPdfStale ? (
							<div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
								<div className="flex items-start gap-3">
									<AlertTriangle
										className="h-5 w-5 text-warning shrink-0 mt-0.5"
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium text-foreground">
											PDF v{latestDocument.version} is out of date
										</p>
										<p className="mt-1 text-sm text-muted-foreground">
											Line items changed since it was generated.
											Regenerate before you send.
										</p>
										<Button
											variant="outline"
											size="sm"
											className="mt-3"
											onClick={onGeneratePdf}
											disabled={!canModify}
										>
											<RefreshCw
												className="h-4 w-4"
												aria-hidden="true"
											/>
											Regenerate
										</Button>
									</div>
								</div>
							</div>
						) : (
							<div className="rounded-lg border border-border bg-background/60 p-4">
								<div className="flex items-start gap-3">
									<FileText
										className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5"
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium text-foreground">
											Quote PDF v{latestDocument.version}
										</p>
										<p className="mt-1 text-sm text-muted-foreground">
											Generated{" "}
											{formatDate(latestDocument._creationTime)}
										</p>
										<div className="mt-3 flex flex-wrap gap-2">
											<Button
												size="sm"
												variant="outline"
												onClick={onDownloadPdf}
												disabled={!selectedDocumentUrl}
											>
												<Download
													className="h-4 w-4"
													aria-hidden="true"
												/>
												Download
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={onGeneratePdf}
												disabled={!canModify}
											>
												<RefreshCw
													className="h-4 w-4"
													aria-hidden="true"
												/>
												Regenerate
											</Button>
										</div>
									</div>
								</div>
							</div>
						)}

						{selectedDocumentUrl && (
							<>
								{selectedDocument &&
									selectedDocument._id !== latestDocument._id && (
										<Badge variant="outline" className="text-xs">
											Viewing v{selectedDocument.version}
										</Badge>
									)}
								<div className="h-48 overflow-hidden rounded-lg border border-border bg-muted/40">
									<iframe
										src={selectedDocumentUrl}
										className="w-full h-full"
										title="PDF preview"
										style={{ border: "none" }}
									/>
								</div>
								<a
									href={selectedDocumentUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="block"
								>
									<Button
										variant="outline"
										size="sm"
										className="w-full"
									>
										<Eye className="h-4 w-4" aria-hidden="true" />
										Open in new tab
									</Button>
								</a>
							</>
						)}

						{allDocumentVersions && allDocumentVersions.length > 1 && (
							<div className="pt-2 border-t border-border">
								<Button
									variant="outline"
									size="sm"
									className="w-full"
									onClick={onToggleVersionHistory}
								>
									<History className="h-4 w-4" aria-hidden="true" />
									{showVersionHistory ? "Hide" : "Show"} version history (
									{allDocumentVersions.length})
								</Button>

								{showVersionHistory && (
									<div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
										{allDocumentVersions.map((version) => {
											const isActive =
												selectedVersionId === version._id ||
												(!selectedVersionId &&
													version._id === latestDocument._id);
											return (
												<button
													key={version._id}
													onClick={() => {
														onSelectVersion(
															version._id === latestDocument._id
																? null
																: version._id
														);
													}}
													aria-pressed={isActive}
													className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
														isActive
															? "border-primary/40 bg-primary/10"
															: "border-border bg-background/60 hover:bg-muted/60"
													}`}
												>
													<div className="flex items-center justify-between gap-2">
														<div className="flex items-center gap-2">
															<Clock
																className="h-3 w-3 text-muted-foreground"
																aria-hidden="true"
															/>
															<span className="font-medium">
																Version {version.version}
															</span>
															{version._id === latestDocument._id && (
																<Badge
																	variant="default"
																	className="text-xs"
																>
																	Latest
																</Badge>
															)}
														</div>
														<span className="text-xs text-muted-foreground">
															{formatDate(version.generatedAt)}
														</span>
													</div>
												</button>
											);
										})}
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
