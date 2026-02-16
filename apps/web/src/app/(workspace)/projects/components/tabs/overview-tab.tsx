"use client";

import { useState } from "react";
import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { MentionSection } from "@/components/shared/mention-section";
import { Separator } from "@/components/ui/separator";
import { StyledCard, StyledCardContent } from "@/components/ui/styled";
import { Button } from "@/components/ui/button";
import { ClipboardList, DollarSign, CheckCircle } from "lucide-react";
import Link from "next/link";

interface OverviewTabProps {
	projectId: Id<"projects">;
	projectTitle: string;
	projectType: "one-off" | "recurring";
	startDate?: number;
	endDate?: number;
	tasks: Doc<"tasks">[] | undefined;
	quotes: Doc<"quotes">[] | undefined;
}

function formatCurrency(amount: number) {
	return "$" + amount.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
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
	projectType,
	startDate,
	endDate,
	tasks,
	quotes,
}: OverviewTabProps) {
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
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border/40">
					Highlights
				</h3>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<StyledCard>
						<StyledCardContent className="flex items-center gap-3 p-4">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
								<ClipboardList className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-2xl font-bold text-foreground">
									{activeTasks}
								</p>
								<p className="text-xs text-muted-foreground">
									Active Tasks
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
									{formatCurrency(totalQuoted)}
								</p>
								<p className="text-xs text-muted-foreground">
									Total Quoted
								</p>
							</div>
						</StyledCardContent>
					</StyledCard>
					<StyledCard>
						<StyledCardContent className="flex items-center gap-3 p-4">
							<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
								<CheckCircle className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-2xl font-bold text-foreground">
									{approvedQuotes}
								</p>
								<p className="text-xs text-muted-foreground">
									Approved Quotes
								</p>
							</div>
						</StyledCardContent>
					</StyledCard>
				</div>
			</div>

			<Separator className="my-6" />

			{/* Schedule */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border/40">
					Schedule
				</h3>

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
								intent="outline"
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
								intent="outline"
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

			{/* Related Quotes */}
			<div>
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border/40">
					Related Quotes
				</h3>
				{quotes && quotes.length > 0 ? (
					<div className="overflow-y-auto max-h-[320px] rounded-lg border border-border/60 divide-y divide-border/40">
						{sortedByNewest(quotes).map((quote) => (
							<Link
								key={quote._id}
								href={`/quotes/${quote._id}`}
								className="flex flex-col gap-1 px-3 py-2.5 hover:bg-muted/50 transition-colors group"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
										{quote.quoteNumber || quote.title || "Untitled"}
									</span>
									<ProminentStatusBadge
										status={quote.status || "draft"}
										size="default"
										showIcon={false}
										entityType="quote"
									/>
								</div>
								<span className="text-[11px] text-muted-foreground/70 tabular-nums">
									{formatCurrency(quote.total || 0)}
								</span>
							</Link>
						))}
					</div>
				) : (
					<div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
						<p className="text-sm text-muted-foreground/50">
							No quotes yet
						</p>
					</div>
				)}
			</div>

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
