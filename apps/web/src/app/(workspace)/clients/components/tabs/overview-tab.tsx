"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { MentionSection } from "@/components/shared/mention-section";
import { Separator } from "@/components/ui/separator";
import { HighlightMetricGrid } from "@/components/shared/highlight-metric-grid";
import { RelatedRecordsFrame } from "@/components/shared/related-records-frame";
import { FolderOpen, DollarSign, TrendingUp, FileText, Receipt, Pencil, Check, X } from "lucide-react";
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

function formatCurrency(amount: number) {
	return "$" + amount.toLocaleString(undefined, {
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

function sortedByNewest<T extends { _creationTime: number }>(
	items: T[] | undefined
): T[] {
	if (!items) return [];
	return [...items].sort((a, b) => b._creationTime - a._creationTime);
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
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border/40">
					Highlights
				</h3>
				<HighlightMetricGrid
					metrics={[
						{
							icon: FolderOpen,
							label: "Active Projects",
							value: activeProjects,
							description: "Projects currently in progress",
						},
						{
							icon: DollarSign,
							label: "Outstanding",
							value: formatCurrency(outstanding),
							description: "Invoiced but not yet paid",
						},
						{
							icon: TrendingUp,
							label: "Total Revenue",
							value: formatCurrency(totalRevenue),
							description: "Lifetime billed to this client",
						},
					]}
				/>
			</div>

			<Separator className="my-6" />

		{/* Notes - inline editable */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border/40">
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

			<RelatedRecordsFrame
				sections={[
					{
						title: "Projects",
						icon: FolderOpen,
						items: sortedByNewest(projects).map((project) => ({
							id: project._id,
							title: project.title,
							meta: formatDate(project._creationTime),
							status: project.status,
							href: `/projects/${project._id}`,
						})),
					},
					{
						title: "Quotes",
						icon: FileText,
						items: sortedByNewest(quotes).map((quote) => ({
							id: quote._id,
							title: quote.quoteNumber || quote.title || "Untitled",
							meta: formatCurrency(quote.total),
							status: quote.status,
							href: `/quotes/${quote._id}`,
						})),
					},
					{
						title: "Invoices",
						icon: Receipt,
						items: sortedByNewest(invoices).map((invoice) => ({
							id: invoice._id,
							title: invoice.invoiceNumber,
							meta: formatCurrency(invoice.total),
							status: invoice.status,
							href: `/invoices/${invoice._id}`,
						})),
					},
				]}
			/>

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
