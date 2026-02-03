"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { MentionSection } from "@/components/shared/mention-section";
import { Separator } from "@/components/ui/separator";
import { StyledCard, StyledCardContent } from "@/components/ui/styled";
import { FolderOpen, DollarSign, TrendingUp, Pencil, Check, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface OverviewTabProps {
	projects: Doc<"projects">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
	notes: string;
	clientId: string;
	clientName: string;
}

function formatCurrency(cents: number) {
	return "$" + (cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function formatDate(timestamp?: number) {
	if (!timestamp) return "—";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function RelatedAccordion({
	label,
	count,
	children,
}: {
	label: string;
	count: number;
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="border border-border rounded-lg">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-lg"
			>
				<div className="flex items-center gap-2">
					<ChevronRight
						className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
					/>
					<span className="text-sm font-medium text-foreground">{label}</span>
				</div>
				<span className="text-xs text-muted-foreground tabular-nums">{count}</span>
			</button>
			{isOpen && (
				<div className="px-3 pb-3">
					{children}
				</div>
			)}
		</div>
	);
}

export function OverviewTab({
	projects,
	quotes,
	invoices,
	notes,
	clientId,
	clientName,
}: OverviewTabProps) {
	const toast = useToast();
	const updateClient = useMutation(api.clients.update);
	const [isEditingNotes, setIsEditingNotes] = useState(false);
	const [editNotesValue, setEditNotesValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (isEditingNotes && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.selectionStart = textareaRef.current.value.length;
		}
	}, [isEditingNotes]);

	const startEditingNotes = () => {
		setEditNotesValue(notes);
		setIsEditingNotes(true);
	};

	const cancelEditingNotes = () => {
		setIsEditingNotes(false);
		setEditNotesValue("");
	};

	const saveNotes = async () => {
		try {
			await updateClient({
				id: clientId as Id<"clients">,
				notes: editNotesValue || undefined,
			});
			toast.success("Updated", "Notes saved.");
			setIsEditingNotes(false);
			setEditNotesValue("");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save notes";
			toast.error("Error", message);
		}
	};

	const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			saveNotes();
		}
		if (e.key === "Escape") {
			cancelEditingNotes();
		}
	};

	const activeProjects =
		projects?.filter(
			(p) => p.status === "in-progress" || p.status === "planned"
		).length ?? 0;
	const outstanding =
		invoices
			?.filter((inv) => inv.status !== "paid")
			.reduce((sum, inv) => sum + inv.total, 0) ?? 0;
	const totalRevenue =
		invoices?.reduce((sum, inv) => sum + inv.total, 0) ?? 0;

	return (
		<div>
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Overview
				</h3>
			</div>
			<Separator className="mb-4" />

			{/* Highlights */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
					Highlights
				</h3>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<StyledCard>
						<StyledCardContent className="flex items-center gap-3 p-4">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
								<FolderOpen className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-2xl font-bold text-foreground">
									{activeProjects}
								</p>
								<p className="text-xs text-muted-foreground">
									Active Projects
								</p>
							</div>
						</StyledCardContent>
					</StyledCard>
					<StyledCard>
						<StyledCardContent className="flex items-center gap-3 p-4">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
								<DollarSign className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-2xl font-bold text-foreground">
									${outstanding.toLocaleString()}
								</p>
								<p className="text-xs text-muted-foreground">
									Outstanding
								</p>
							</div>
						</StyledCardContent>
					</StyledCard>
					<StyledCard>
						<StyledCardContent className="flex items-center gap-3 p-4">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
								<TrendingUp className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-2xl font-bold text-foreground">
									${totalRevenue.toLocaleString()}
								</p>
								<p className="text-xs text-muted-foreground">
									Total Revenue
								</p>
							</div>
						</StyledCardContent>
					</StyledCard>
				</div>
			</div>

			<Separator className="my-6" />

			{/* Notes - inline editable */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
					Notes
				</h3>
				{isEditingNotes ? (
					<div className="space-y-2">
						<textarea
							ref={textareaRef}
							value={editNotesValue}
							onChange={(e) => setEditNotesValue(e.target.value)}
							onKeyDown={handleNotesKeyDown}
							rows={5}
							className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
							placeholder="Add notes about this client..."
						/>
						<div className="flex items-center gap-1.5">
							<button
								onClick={saveNotes}
								className="p-1 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
								aria-label="Save notes"
							>
								<Check className="h-4 w-4" />
							</button>
							<button
								onClick={cancelEditingNotes}
								className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
								aria-label="Cancel"
							>
								<X className="h-4 w-4" />
							</button>
							<span className="text-xs text-muted-foreground ml-1">Cmd+Enter to save, Esc to cancel</span>
						</div>
					</div>
				) : notes ? (
					<button
						onClick={startEditingNotes}
						className="w-full text-left bg-muted/30 rounded-lg p-4 group/notes cursor-pointer hover:bg-muted/50 transition-colors"
					>
						<div className="flex items-start gap-2">
							<p className="text-sm text-foreground line-clamp-3 flex-1">
								{notes}
							</p>
							<Pencil className="h-3 w-3 text-muted-foreground/0 group-hover/notes:text-muted-foreground transition-colors shrink-0 mt-0.5" />
						</div>
					</button>
				) : (
					<button
						onClick={startEditingNotes}
						className="w-full text-left group/notes cursor-pointer"
					>
						<p className="text-sm text-muted-foreground py-2 flex items-center gap-2">
							<span>Click to add notes...</span>
							<Pencil className="h-3 w-3 text-muted-foreground/0 group-hover/notes:text-muted-foreground transition-colors" />
						</p>
					</button>
				)}
			</div>

			<Separator className="my-6" />

			{/* Related Entities */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
					Related
				</h3>
				<div className="space-y-2">
					<RelatedAccordion
						label="Projects"
						count={projects?.length ?? 0}
					>
						{projects && projects.length > 0 ? (
							<div className="border border-border rounded-lg overflow-hidden">
								<table className="w-full text-sm">
									<thead>
										<tr className="bg-muted/40">
											<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
												Title
											</th>
											<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
												Status
											</th>
											<th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
												Created
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{projects.slice(0, 5).map((project) => (
											<tr
												key={project._id}
												className="hover:bg-muted/30 transition-colors"
											>
												<td className="px-3 py-2">
													<Link
														href={`/projects/${project._id}`}
														className="text-sm text-primary hover:text-primary/80 font-medium"
													>
														{project.title}
													</Link>
												</td>
												<td className="px-3 py-2">
													<ProminentStatusBadge
														status={project.status}
														size="default"
														showIcon={false}
														entityType="project"
													/>
												</td>
												<td className="px-3 py-2 text-right text-muted-foreground">
													{formatDate(project._creationTime)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								{projects.length > 5 && (
									<div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center">
										+{projects.length - 5} more
									</div>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground py-2">
								No projects yet
							</p>
						)}
					</RelatedAccordion>

					<RelatedAccordion
						label="Quotes"
						count={quotes?.length ?? 0}
					>
						{quotes && quotes.length > 0 ? (
							<div className="border border-border rounded-lg overflow-hidden">
								<table className="w-full text-sm">
									<thead>
										<tr className="bg-muted/40">
											<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
												Quote #
											</th>
											<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
												Status
											</th>
											<th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
												Total
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{quotes.slice(0, 5).map((quote) => (
											<tr
												key={quote._id}
												className="hover:bg-muted/30 transition-colors"
											>
												<td className="px-3 py-2">
													<Link
														href={`/quotes/${quote._id}`}
														className="text-sm text-primary hover:text-primary/80 font-medium"
													>
														{quote.quoteNumber || quote.title || "Untitled"}
													</Link>
												</td>
												<td className="px-3 py-2">
													<ProminentStatusBadge
														status={quote.status}
														size="default"
														showIcon={false}
														entityType="quote"
													/>
												</td>
												<td className="px-3 py-2 text-right text-foreground">
													{formatCurrency(quote.total)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								{quotes.length > 5 && (
									<div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center">
										+{quotes.length - 5} more
									</div>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground py-2">
								No quotes yet
							</p>
						)}
					</RelatedAccordion>

					<RelatedAccordion
						label="Invoices"
						count={invoices?.length ?? 0}
					>
						{invoices && invoices.length > 0 ? (
							<div className="border border-border rounded-lg overflow-hidden">
								<table className="w-full text-sm">
									<thead>
										<tr className="bg-muted/40">
											<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
												Invoice #
											</th>
											<th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
												Status
											</th>
											<th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
												Total
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{invoices.slice(0, 5).map((invoice) => (
											<tr
												key={invoice._id}
												className="hover:bg-muted/30 transition-colors"
											>
												<td className="px-3 py-2">
													<Link
														href={`/invoices/${invoice._id}`}
														className="text-sm text-primary hover:text-primary/80 font-medium"
													>
														{invoice.invoiceNumber}
													</Link>
												</td>
												<td className="px-3 py-2">
													<ProminentStatusBadge
														status={invoice.status}
														size="default"
														showIcon={false}
														entityType="invoice"
													/>
												</td>
												<td className="px-3 py-2 text-right text-foreground">
													{formatCurrency(invoice.total)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								{invoices.length > 5 && (
									<div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center">
										+{invoices.length - 5} more
									</div>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground py-2">
								No invoices yet
							</p>
						)}
					</RelatedAccordion>
				</div>
			</div>

			<Separator className="my-6" />

			{/* Team Communication */}
			<div>
				<MentionSection
					entityType="client"
					entityId={clientId}
					entityName={clientName}
					hideCardWrapper
					pageSize={5}
				/>
			</div>
		</div>
	);
}
