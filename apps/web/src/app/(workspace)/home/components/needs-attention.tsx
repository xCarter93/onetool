"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@/components/ui/collapsible";
import {
	ChevronRight,
	Circle,
	CheckCircle2,
	AlertTriangle,
	Calendar,
	CalendarDays,
	FileText,
	FileSignature,
} from "lucide-react";
import Link from "next/link";
import { Task } from "@/types/task";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysLate(dateTimestamp: number): number {
	const today = new Date();
	const todayUTC = Date.UTC(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);
	return Math.floor((todayUTC - dateTimestamp) / (24 * 60 * 60 * 1000));
}

function formatCurrency(cents: number): string {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

function formatTime(time?: string): string | null {
	if (!time) return null;
	const [hours, minutes] = time.split(":");
	const hour = parseInt(hours);
	const ampm = hour >= 12 ? "PM" : "AM";
	const displayHour = hour % 12 || 12;
	return `${displayHour}:${minutes} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

interface AttentionTaskRowProps {
	task: Task;
	clientName: string;
	isOverdue: boolean;
	onStatusChange: (taskId: Id<"tasks">, newStatus: Task["status"]) => void;
	isUpdating: boolean;
}

function AttentionTaskRow({
	task,
	clientName,
	isOverdue,
	onStatusChange,
	isUpdating,
}: AttentionTaskRowProps) {
	const isCompleted = task.status === "completed";
	const daysLate = isOverdue ? getDaysLate(task.date) : 0;

	const handleToggle = () => {
		if (isUpdating) return;
		const newStatus = isCompleted ? "pending" : "completed";
		onStatusChange(task._id, newStatus);
	};

	const timeContext = isOverdue
		? `${daysLate} day${daysLate !== 1 ? "s" : ""} late`
		: formatTime(task.startTime) ?? "";

	return (
		<div
			className={cn(
				"flex items-center gap-2 py-2 px-2 rounded-md transition-colors duration-150",
				isOverdue && !isCompleted && "bg-red-50/30 dark:bg-red-900/10",
				isCompleted && "opacity-60",
			)}
		>
			<button
				role="checkbox"
				aria-checked={isCompleted}
				aria-label={`Mark ${task.title} as complete`}
				onClick={handleToggle}
				disabled={isUpdating}
				className={cn(
					"shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					isUpdating && "opacity-50 cursor-not-allowed",
				)}
			>
				{isCompleted ? (
					<CheckCircle2 className="h-5 w-5 text-green-600" />
				) : (
					<Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
				)}
			</button>

			<span
				className={cn(
					"text-sm font-medium truncate flex-1",
					isCompleted && "line-through text-muted-foreground",
				)}
			>
				{task.title}
			</span>

			<span className="text-xs text-muted-foreground truncate max-w-[140px]">
				{clientName}
			</span>

			<span
				className={cn(
					"text-xs text-right w-[100px] shrink-0",
					isOverdue
						? "text-red-600 font-medium dark:text-red-400"
						: "text-muted-foreground",
				)}
			>
				{timeContext}
			</span>
		</div>
	);
}

interface AttentionInvoiceRowProps {
	invoice: Doc<"invoices">;
	clientName: string;
}

function AttentionInvoiceRow({ invoice, clientName }: AttentionInvoiceRowProps) {
	const daysOverdue = getDaysLate(invoice.dueDate);

	return (
		<Link
			href={`/invoices/${invoice._id}`}
			className="flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors duration-150 bg-red-50/30 dark:bg-red-900/10"
		>
			<FileText className="h-4 w-4 text-red-500 shrink-0" />

			<span className="text-sm font-medium w-[80px] shrink-0">
				{invoice.invoiceNumber}
			</span>

			<span className="text-xs text-muted-foreground truncate flex-1">
				{clientName}
			</span>

			<span className="text-xs text-red-600 dark:text-red-400 text-right w-[100px] shrink-0">
				{formatCurrency(invoice.total)}
			</span>

			<span className="text-xs text-muted-foreground text-right w-[90px] shrink-0">
				{daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
			</span>
		</Link>
	);
}

interface AttentionQuoteRowProps {
	quote: Doc<"quotes">;
	clientName: string;
}

function AttentionQuoteRow({ quote, clientName }: AttentionQuoteRowProps) {
	const daysSinceSent = quote.sentAt ? getDaysLate(quote.sentAt) : 0;

	return (
		<Link
			href={`/quotes/${quote._id}`}
			className="flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors duration-150"
		>
			<FileSignature className="h-4 w-4 text-amber-500 shrink-0" />

			<span className="text-sm font-medium w-[80px] shrink-0">
				{quote.quoteNumber ?? "Draft"}
			</span>

			<span className="text-xs text-muted-foreground truncate flex-1">
				{clientName}
			</span>

			<span className="text-xs text-foreground text-right w-[100px] shrink-0">
				{formatCurrency(quote.total)}
			</span>

			<span className="text-xs text-amber-600 dark:text-amber-400 text-right w-[90px] shrink-0">
				Sent {daysSinceSent} day{daysSinceSent !== 1 ? "s" : ""} ago
			</span>
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

interface AttentionSectionProps {
	title: string;
	count: number;
	icon: React.ReactNode;
	defaultOpen: boolean;
	viewMoreHref: string;
	children: React.ReactNode;
	totalItems: number;
	subHeader?: React.ReactNode;
}

function AttentionSection({
	title,
	count,
	icon,
	defaultOpen,
	viewMoreHref,
	children,
	totalItems,
	subHeader,
}: AttentionSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const overflow = totalItems - 5;

	if (count === 0) return null;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 group/trigger">
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
						open && "rotate-90",
					)}
				/>
				{icon}
				<span className="text-[13px] font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">({count})</span>
			</CollapsibleTrigger>

			{subHeader && <div className="pl-7 pb-1">{subHeader}</div>}

			<CollapsibleContent className="overflow-hidden">
				<div className="pl-2 space-y-0.5">
					{children}
					{overflow > 0 && (
						<Link
							href={viewMoreHref}
							className="block text-xs text-primary hover:text-primary/80 font-medium py-1.5 pl-2"
						>
							View {overflow} more
						</Link>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NeedsAttention() {
	// Data fetching -- 4 parallel queries + clients for name resolution
	const overdueTasks = useQuery(api.tasks.getOverdue, {});
	const upcomingTasks = useQuery(api.tasks.getUpcoming, { daysAhead: 7 });
	const overdueInvoices = useQuery(api.invoices.getOverdue, {});
	const awaitingQuotes = useQuery(api.quotes.getAwaitingSigning, {});
	const clients = useQuery(api.clients.list, {});

	// Task mutations
	const [updatingTasks, setUpdatingTasks] = useState<Set<Id<"tasks">>>(
		new Set(),
	);
	const completeTaskMutation = useMutation(api.tasks.complete);
	const updateTaskMutation = useMutation(api.tasks.update);

	const handleStatusChange = async (
		taskId: Id<"tasks">,
		newStatus: Task["status"],
	) => {
		setUpdatingTasks((prev) => new Set(prev).add(taskId));
		try {
			if (newStatus === "completed") {
				await completeTaskMutation({ id: taskId });
			} else {
				await updateTaskMutation({ id: taskId, status: newStatus });
			}
		} catch (error) {
			console.error("Error updating task:", error);
		} finally {
			setUpdatingTasks((prev) => {
				const s = new Set(prev);
				s.delete(taskId);
				return s;
			});
		}
	};

	// Client name resolver
	const getClientName = (clientId?: Id<"clients">): string => {
		if (!clientId) return "No Client";
		return clients?.find((c) => c._id === clientId)?.companyName ?? "Unknown Client";
	};

	// Loading state
	const isLoading =
		overdueTasks === undefined ||
		upcomingTasks === undefined ||
		overdueInvoices === undefined ||
		awaitingQuotes === undefined;

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-6 w-48" />
				{[1, 2, 3, 4].map((i) => (
					<Skeleton
						key={i}
						className="h-10 w-full rounded-lg"
						style={{ opacity: 1 - (i - 1) * 0.2 }}
					/>
				))}
			</div>
		);
	}

	// Frontend date splitting for upcoming tasks
	const today = new Date();
	const todayUTC = Date.UTC(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);
	const tomorrowUTC = todayUTC + 86400000;

	const todayTasks = (upcomingTasks ?? []).filter(
		(t) => t.date >= todayUTC && t.date < tomorrowUTC,
	);
	const thisWeekTasks = (upcomingTasks ?? []).filter(
		(t) => t.date >= tomorrowUTC,
	);

	// Sort overdue by days late descending (most late first)
	const sortedOverdueTasks = [...(overdueTasks ?? [])].sort(
		(a, b) => a.date - b.date,
	);
	const sortedOverdueInvoices = [...(overdueInvoices ?? [])].sort(
		(a, b) => a.dueDate - b.dueDate,
	);

	// Sort today tasks by startTime
	const sortedTodayTasks = [...todayTasks].sort((a, b) => {
		if (!a.startTime && !b.startTime) return 0;
		if (!a.startTime) return 1;
		if (!b.startTime) return -1;
		return a.startTime.localeCompare(b.startTime);
	});

	// Sort this week tasks by date
	const sortedThisWeekTasks = [...thisWeekTasks].sort(
		(a, b) => a.date - b.date,
	);

	// Sort awaiting quotes by sentAt ascending (most days since sent first)
	const sortedAwaitingQuotes = [...(awaitingQuotes ?? [])] as Doc<"quotes">[];
	sortedAwaitingQuotes.sort((a, b) => {
		return (a.sentAt ?? 0) - (b.sentAt ?? 0);
	});

	// Counts
	const overdueTaskCount = sortedOverdueTasks.length;
	const overdueInvoiceCount = sortedOverdueInvoices.length;
	const overdueSectionCount = overdueTaskCount + overdueInvoiceCount;
	const todayCount = sortedTodayTasks.length;
	const thisWeekCount = sortedThisWeekTasks.length;
	const awaitingCount = sortedAwaitingQuotes.length;
	const totalCount =
		overdueSectionCount + todayCount + thisWeekCount + awaitingCount;
	const totalOverdueForBadge = overdueTaskCount + overdueInvoiceCount;

	// Invoice aggregate for overdue section sub-header
	const overdueInvoiceTotal = sortedOverdueInvoices.reduce(
		(sum, inv) => sum + inv.total,
		0,
	);

	// Empty state
	if (totalCount === 0) {
		return (
			<div className="space-y-4">
				<div>
					<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						Needs Attention
					</p>
					<p className="text-sm font-medium mt-1">
						Needs Attention (0)
					</p>
				</div>
				<div
					role="status"
					className="flex flex-col items-center justify-center min-h-[200px] py-12"
				>
					<div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full">
						<CheckCircle2 className="h-8 w-8 text-muted-foreground" />
					</div>
					<h3 className="text-lg font-medium mt-4">
						You&apos;re all caught up
					</h3>
					<p className="text-sm text-muted-foreground mt-1 max-w-sm text-center">
						No overdue items, tasks, or pending signatures need your
						attention right now.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Header */}
			<div>
				<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
					Needs Attention
				</p>
				<div className="flex items-center gap-2 mt-1">
					<p className="text-sm font-medium">
						Needs Attention ({totalCount})
					</p>
					{totalOverdueForBadge > 0 && (
						<Badge
							className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
							aria-label={`${totalOverdueForBadge} overdue items`}
						>
							{totalOverdueForBadge} overdue
						</Badge>
					)}
				</div>
			</div>

			{/* Sections */}
			<div className="space-y-3">
				{/* Overdue section */}
				<AttentionSection
					title="Overdue"
					count={overdueSectionCount}
					icon={
						<AlertTriangle className="h-3.5 w-3.5 text-red-500" />
					}
					defaultOpen={true}
					viewMoreHref="/tasks"
					totalItems={overdueSectionCount}
					subHeader={
						overdueInvoiceCount > 0 ? (
							<span className="text-xs text-muted-foreground">
								{overdueInvoiceCount} overdue &mdash;{" "}
								{formatCurrency(overdueInvoiceTotal)}{" "}
								outstanding
							</span>
						) : undefined
					}
				>
					{sortedOverdueTasks.slice(0, 5).map((task) => (
						<AttentionTaskRow
							key={task._id}
							task={task}
							clientName={getClientName(task.clientId)}
							isOverdue={true}
							onStatusChange={handleStatusChange}
							isUpdating={updatingTasks.has(task._id)}
						/>
					))}
					{sortedOverdueInvoices
						.slice(0, Math.max(0, 5 - overdueTaskCount))
						.map((invoice) => (
							<AttentionInvoiceRow
								key={invoice._id}
								invoice={invoice}
								clientName={getClientName(invoice.clientId)}
							/>
						))}
				</AttentionSection>

				{/* Today section */}
				<AttentionSection
					title="Today"
					count={todayCount}
					icon={<Calendar className="h-3.5 w-3.5 text-foreground" />}
					defaultOpen={true}
					viewMoreHref="/tasks"
					totalItems={todayCount}
				>
					{sortedTodayTasks.slice(0, 5).map((task) => (
						<AttentionTaskRow
							key={task._id}
							task={task}
							clientName={getClientName(task.clientId)}
							isOverdue={false}
							onStatusChange={handleStatusChange}
							isUpdating={updatingTasks.has(task._id)}
						/>
					))}
				</AttentionSection>

				{/* This Week section */}
				<AttentionSection
					title="This Week"
					count={thisWeekCount}
					icon={
						<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
					}
					defaultOpen={false}
					viewMoreHref="/tasks"
					totalItems={thisWeekCount}
				>
					{sortedThisWeekTasks.slice(0, 5).map((task) => (
						<AttentionTaskRow
							key={task._id}
							task={task}
							clientName={getClientName(task.clientId)}
							isOverdue={false}
							onStatusChange={handleStatusChange}
							isUpdating={updatingTasks.has(task._id)}
						/>
					))}
				</AttentionSection>

				{/* Awaiting Signature section */}
				<AttentionSection
					title="Awaiting Signature"
					count={awaitingCount}
					icon={
						<FileSignature className="h-3.5 w-3.5 text-amber-500" />
					}
					defaultOpen={false}
					viewMoreHref="/quotes"
					totalItems={awaitingCount}
				>
					{sortedAwaitingQuotes.slice(0, 5).map((quote) => (
						<AttentionQuoteRow
							key={quote._id}
							quote={quote}
							clientName={getClientName(quote.clientId)}
						/>
					))}
				</AttentionSection>
			</div>
		</div>
	);
}

export default NeedsAttention;
