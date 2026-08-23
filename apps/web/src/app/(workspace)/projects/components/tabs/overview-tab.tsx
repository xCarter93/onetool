"use client";

import React, { useState, useRef, useEffect } from "react";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { MentionSection } from "@/components/shared/mention-section";
import { Separator } from "@/components/ui/separator";
import { HighlightMetricGrid } from "@/components/shared/highlight-metric-grid";
import { RelatedRecordsFrame } from "@/components/shared/related-records-frame";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, DollarSign, CheckCircle, FileText, Receipt, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { ProjectScheduleCalendar } from "../project-schedule-calendar";

interface OverviewTabProps {
	projectId: Id<"projects">;
	projectTitle: string;
	projectDescription?: string;
	projectType: "one-off" | "recurring";
	startDate?: number;
	endDate?: number;
	tasks: Doc<"tasks">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
	invoices: Doc<"invoices">[] | undefined;
}

// start/end dates are stored as UTC-midnight epochs; format in UTC so the day never shifts.
function formatDate(timestamp?: number) {
	if (!timestamp) return "\u2014";
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function sortedByNewest<T extends { _creationTime: number }>(
	items: T[] | undefined
): T[] {
	if (!items) return [];
	return [...items].sort((a, b) => b._creationTime - a._creationTime);
}

export function OverviewTab({
	projectId,
	projectTitle,
	projectDescription,
	projectType,
	startDate,
	endDate,
	tasks,
	quotes,
	invoices,
}: OverviewTabProps) {
	const toast = useToast();
	const updateProject = useMutation(api.projects.update);
	const [isEditingDescription, setIsEditingDescription] = useState(false);
	const [descriptionValue, setDescriptionValue] = useState("");
	const descriptionRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (isEditingDescription && descriptionRef.current) {
			descriptionRef.current.focus();
			descriptionRef.current.selectionStart = descriptionRef.current.value.length;
		}
	}, [isEditingDescription]);

	const startEditingDescription = () => {
		setDescriptionValue(projectDescription || "");
		setIsEditingDescription(true);
	};

	const cancelEditingDescription = () => {
		setIsEditingDescription(false);
		setDescriptionValue("");
	};

	const saveDescription = async () => {
		try {
			await updateProject({
				id: projectId,
				description: descriptionValue || undefined,
			});
			toast.success("Updated", "Description saved.");
			cancelEditingDescription();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save";
			toast.error("Error", message);
		}
	};

	const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			saveDescription();
		}
		if (e.key === "Escape") {
			cancelEditingDescription();
		}
	};

	const activeTasks =
		tasks?.filter((t) => t.status === "pending" || t.status === "in-progress").length ?? 0;
	const totalQuoted =
		quotes?.reduce((sum, q) => sum + (q.total || 0), 0) ?? 0;
	const approvedQuotes =
		quotes?.filter((q) => q.status === "approved").length ?? 0;

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
				<HighlightMetricGrid
					metrics={[
						{
							icon: ClipboardList,
							label: "Active Tasks",
							value: activeTasks,
							description: "Tasks not yet completed",
						},
						{
							icon: DollarSign,
							label: "Total Quoted",
							value: formatCurrency(totalQuoted),
							description: "Sum of all quotes on this project",
						},
						{
							icon: CheckCircle,
							label: "Approved Quotes",
							value: approvedQuotes,
							description: "Quotes accepted by the client",
						},
					]}
				/>
			</div>

			<Separator className="my-6" />

			{/* Schedule */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
					Schedule
				</h3>

				{/* Description — full-width, click to edit */}
				<div
					className="mb-4 text-sm rounded-md -mx-2 px-2 py-2 transition-colors group cursor-pointer hover:bg-muted/50"
					onClick={() => !isEditingDescription && startEditingDescription()}
				>
					<span className="text-muted-foreground">Description</span>
					{isEditingDescription ? (
						<div className="mt-1" onClick={(e) => e.stopPropagation()}>
							<textarea
								ref={descriptionRef}
								value={descriptionValue}
								onChange={(e) => setDescriptionValue(e.target.value)}
								onKeyDown={handleDescriptionKeyDown}
								rows={3}
								className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
								placeholder="Add a description..."
							/>
							<div className="flex items-center justify-between mt-1.5">
								<span className="text-xs text-muted-foreground">Enter to save, Shift+Enter for new line, Esc to cancel</span>
								<div className="flex items-center gap-1">
									<button
										onClick={saveDescription}
										className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
									>
										Save
									</button>
									<button
										onClick={cancelEditingDescription}
										className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
									>
										Cancel
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="flex items-start gap-2 mt-1">
							<div className="flex-1 min-w-0">
								{projectDescription ? (
									<p className="text-foreground font-medium whitespace-pre-wrap">{projectDescription}</p>
								) : (
									<p className="text-muted-foreground italic">Add a description...</p>
								)}
							</div>
							<Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
						</div>
					)}
				</div>

				{/* Date info row */}
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-4">
					<div>
						<span className="text-muted-foreground">Type</span>
						<p className="mt-1 text-foreground font-medium capitalize">
							{projectType === "one-off" ? "One-off" : "Recurring"}
						</p>
					</div>
					<div>
						<span className="text-muted-foreground">Start Date</span>
						<p className="mt-1 text-foreground font-medium">
							{formatDate(startDate)}
						</p>
					</div>
					<div>
						<span className="text-muted-foreground">End Date</span>
						<p className="mt-1 text-foreground font-medium">
							{formatDate(endDate)}
						</p>
					</div>
				</div>

				{/* Calendar — keyed so soft-navigating between projects remounts it
				    (its initial month is computed once from the project range) */}
				<ProjectScheduleCalendar
					key={projectId}
					startDate={startDate}
					endDate={endDate}
					tasks={tasks}
					quotes={quotes}
					invoices={invoices}
				/>
			</div>

			<Separator className="my-6" />

			<RelatedRecordsFrame
				sections={[
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
					entityType="project"
					entityId={projectId}
					entityName={projectTitle}
					hideCardWrapper
					pageSize={5}
				/>
			</div>
		</div>
	);
}
