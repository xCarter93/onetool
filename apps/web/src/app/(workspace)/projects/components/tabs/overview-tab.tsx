"use client";

import React, { useState, useRef, useEffect } from "react";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { MentionSection } from "@/components/shared/mention-section";
import { Separator } from "@/components/ui/separator";
import { HighlightMetricGrid } from "@/components/shared/highlight-metric-grid";
import { RelatedRecordsFrame } from "@/components/shared/related-records-frame";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, DollarSign, CheckCircle, FileText, Receipt, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/money";

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

function formatDate(timestamp?: number) {
	if (!timestamp) return "\u2014";
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

function getCalendarDays(date: Date) {
	const year = date.getFullYear();
	const month = date.getMonth();
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const startingDayOfWeek = firstDay.getDay();
	const daysInMonth = lastDay.getDate();

	const days: Array<number | null> = [];
	for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
	for (let day = 1; day <= daysInMonth; day++) days.push(day);
	while (days.length < 42) days.push(null);
	return days;
}

function formatDisplayDate(timestamp?: number) {
	if (!timestamp) return "Not set";
	return new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
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

	const initialCalendarDate = startDate
		? new Date(startDate)
		: new Date();
	const [calendarDate, setCalendarDate] = useState(
		new Date(initialCalendarDate.getFullYear(), initialCalendarDate.getMonth(), 1)
	);

	const handleCalendarNavigation = (direction: "prev" | "next") => {
		setCalendarDate((prev) => {
			const next = new Date(prev);
			next.setMonth(next.getMonth() + (direction === "next" ? 1 : -1));
			return next;
		});
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

				{/* Calendar */}
				<div className="relative overflow-hidden rounded-2xl p-6 shadow-sm border border-gray-200/60 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-black/5 dark:ring-white/10">
					<div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
					<div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

					<div className="flex items-center justify-between mb-6">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">
							{calendarDate.toLocaleDateString("en-US", {
								month: "long",
								year: "numeric",
							})}
						</h3>
						<div className="flex gap-2 rounded-lg bg-gray-50/80 dark:bg-white/5 p-1 ring-1 ring-inset ring-gray-200/70 dark:ring-white/10 shadow-sm">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => handleCalendarNavigation("prev")}
							>
								<svg
									className="w-4 h-4 mr-1"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M15 19l-7-7 7-7"
									/>
								</svg>
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => handleCalendarNavigation("next")}
							>
								<svg
									className="w-4 h-4 ml-1"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-7 gap-1.5">
						{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
							(day) => (
								<div
									key={day}
									className="text-center text-[11px] uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400 py-3 border-b border-gray-100/80 dark:border-white/5"
								>
									{day}
								</div>
							)
						)}

						{getCalendarDays(calendarDate).map((day, index) => {
							const isCurrentMonth = day !== null;
							const today = new Date();
							const isToday =
								isCurrentMonth &&
								day === today.getDate() &&
								calendarDate.getMonth() === today.getMonth() &&
								calendarDate.getFullYear() === today.getFullYear();

							let isStart = false;
							let isEnd = false;
							let isInRange = false;

							const currentDayDate = day
								? new Date(
										calendarDate.getFullYear(),
										calendarDate.getMonth(),
										day
									)
								: null;
							if (currentDayDate) currentDayDate.setHours(0, 0, 0, 0);

							if (day && startDate && currentDayDate) {
								const start = new Date(startDate);
								start.setHours(0, 0, 0, 0);
								isStart = currentDayDate.getTime() === start.getTime();

								if (endDate && !isStart) {
									const end = new Date(endDate);
									end.setHours(0, 0, 0, 0);
									isInRange =
										currentDayDate > start && currentDayDate < end;
								}
							}

							if (day && endDate && currentDayDate) {
								const end = new Date(endDate);
								end.setHours(0, 0, 0, 0);
								isEnd = currentDayDate.getTime() === end.getTime();
							}

							const hasEvent = isStart || isEnd;

							return (
								<div
									key={index}
									className={`
										relative h-11 flex items-center justify-center text-sm rounded-lg
										${isCurrentMonth ? "text-gray-900 dark:text-white" : "text-gray-300 dark:text-gray-600"}
										${hasEvent ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40 font-medium" : ""}
										${isInRange ? "bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100 font-medium" : ""}
										${isToday && !hasEvent && !isInRange ? "ring-1 ring-amber-500/60 text-amber-600 dark:text-amber-300 bg-amber-500/10" : ""}
									`}
									title={
										isStart
											? "Project Start"
											: isEnd
												? "Project End"
												: isInRange
													? "Within project range"
													: ""
									}
								>
									{day || ""}
									{hasEvent && (
										<div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-white/70 dark:bg-white/80" />
									)}
								</div>
							);
						})}
					</div>

					<div className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-gray-200/80 dark:border-white/10 text-xs">
						{startDate && (
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 bg-blue-600 rounded" />
								<span className="text-xs text-gray-500 dark:text-gray-400">
									Start: {formatDisplayDate(startDate)}
								</span>
							</div>
						)}
						{endDate && (
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 bg-blue-600 rounded" />
								<span className="text-xs text-gray-500 dark:text-gray-400">
									End: {formatDisplayDate(endDate)}
								</span>
							</div>
						)}
					</div>
				</div>
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
