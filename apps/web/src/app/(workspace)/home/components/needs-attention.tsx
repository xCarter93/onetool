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
	ClipboardList,
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

function getDaysUntil(dateTimestamp: number): number {
	const today = new Date();
	const todayUTC = Date.UTC(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);
	return Math.floor((dateTimestamp - todayUTC) / (24 * 60 * 60 * 1000));
}

function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(amount);
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

interface TaskRowProps {
	task: Task;
	clientName: string;
	onStatusChange: (taskId: Id<"tasks">, newStatus: Task["status"]) => void;
	isUpdating: boolean;
	isLast: boolean;
}

function TaskRow({
	task,
	clientName,
	onStatusChange,
	isUpdating,
	isLast,
}: TaskRowProps) {
	const isCompleted = task.status === "completed";
	const daysLate = getDaysLate(task.date);
	const isOverdue = daysLate > 0;
	const daysUntil = getDaysUntil(task.date);

	const handleToggle = () => {
		if (isUpdating) return;
		const newStatus = isCompleted ? "pending" : "completed";
		onStatusChange(task._id, newStatus);
	};

	const timeLabel = isOverdue
		? `${daysLate} day${daysLate !== 1 ? "s" : ""} late`
		: daysUntil === 0
			? formatTime(task.startTime) ?? "Today"
			: `In ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`;

	return (
		<div
			className={cn(
				"flex items-start gap-3 py-3 px-3 hover:bg-muted/30 transition-colors duration-150",
				!isLast && "border-b border-border",
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
					"shrink-0 mt-0.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					isUpdating && "opacity-50 cursor-not-allowed",
				)}
			>
				{isCompleted ? (
					<CheckCircle2 className="h-5 w-5 text-green-600" />
				) : (
					<Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />
				)}
			</button>

			<div className="flex-1 min-w-0">
				{/* Line 1: Title + urgency */}
				<div className="flex items-center justify-between gap-2">
					<span
						className={cn(
							"text-sm font-medium truncate",
							isCompleted && "line-through text-muted-foreground",
						)}
					>
						{task.title}
					</span>
					<span
						className={cn(
							"text-xs shrink-0",
							isOverdue
								? "text-red-600 font-medium dark:text-red-400"
								: "text-muted-foreground",
						)}
					>
						{timeLabel}
					</span>
				</div>
				{/* Line 2: Description (truncated) or client name */}
				<p className="text-xs text-muted-foreground mt-0.5 truncate">
					{task.description || clientName}
				</p>
			</div>
		</div>
	);
}

interface InvoiceRowProps {
	invoice: Doc<"invoices"> & { earliestPaymentDueDate?: number };
	clientName: string;
	isLast: boolean;
}

function InvoiceRow({ invoice, clientName, isLast }: InvoiceRowProps) {
	const effectiveDueDate = invoice.earliestPaymentDueDate ?? invoice.dueDate;
	const daysUntilDue = getDaysUntil(effectiveDueDate);
	const isOverdue = daysUntilDue < 0;
	const daysOverdue = Math.abs(daysUntilDue);

	const timeLabel = isOverdue
		? `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`
		: daysUntilDue === 0
			? "Due today"
			: `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}`;

	return (
		<Link
			href={`/invoices/${invoice._id}`}
			className={cn(
				"block py-3 px-3 hover:bg-muted/30 transition-colors duration-150",
				!isLast && "border-b border-border",
			)}
		>
			{/* Line 1: Invoice number + client + amount */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium shrink-0">
						{invoice.invoiceNumber}
					</span>
					<span className="text-sm text-muted-foreground truncate">
						{clientName}
					</span>
				</div>
				<span className="text-sm font-semibold shrink-0 max-w-[120px] truncate">
					{formatCurrency(invoice.total)}
				</span>
			</div>
			{/* Line 2: Due date context */}
			<p
				className={cn(
					"text-xs mt-0.5",
					isOverdue
						? "text-red-600 dark:text-red-400"
						: "text-amber-600 dark:text-amber-400",
				)}
			>
				{timeLabel}
			</p>
		</Link>
	);
}

interface QuoteRowProps {
	quote: Doc<"quotes">;
	clientName: string;
	isLast: boolean;
}

function QuoteRow({ quote, clientName, isLast }: QuoteRowProps) {
	const daysUntilExpiry = quote.validUntil
		? getDaysUntil(quote.validUntil)
		: null;
	const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

	const timeLabel =
		daysUntilExpiry === null
			? "Awaiting signature"
			: isExpired
				? `Expired ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) !== 1 ? "s" : ""} ago`
				: daysUntilExpiry === 0
					? "Expires today"
					: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}`;

	return (
		<Link
			href={`/quotes/${quote._id}`}
			className={cn(
				"block py-3 px-3 hover:bg-muted/30 transition-colors duration-150",
				!isLast && "border-b border-border",
			)}
		>
			{/* Line 1: Quote number + client + amount */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium shrink-0">
						{quote.quoteNumber ?? "Draft"}
					</span>
					<span className="text-sm text-muted-foreground truncate">
						{clientName}
					</span>
				</div>
				<span className="text-sm font-semibold shrink-0 max-w-[120px] truncate">
					{formatCurrency(quote.total)}
				</span>
			</div>
			{/* Line 2: Expiry context */}
			<p
				className={cn(
					"text-xs mt-0.5",
					isExpired
						? "text-red-600 dark:text-red-400"
						: "text-amber-600 dark:text-amber-400",
				)}
			>
				{timeLabel}
			</p>
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

interface AttentionSectionProps {
	title: string;
	icon: React.ReactNode;
	summary: string;
	count: number;
	defaultOpen: boolean;
	viewMoreHref: string;
	children: React.ReactNode;
	totalItems: number;
}

function AttentionSection({
	title,
	icon,
	summary,
	count,
	defaultOpen,
	viewMoreHref,
	children,
	totalItems,
}: AttentionSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const overflow = totalItems - 5;

	if (count === 0) return null;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			{/* Header band */}
			<CollapsibleTrigger className="flex items-center w-full py-2.5 px-3 bg-muted/50 rounded-md hover:bg-muted/70 transition-colors duration-150">
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
						open && "rotate-90",
					)}
				/>
				<span className="ml-2 mr-2 shrink-0">{icon}</span>
				<span className="text-[13px] font-semibold">{title}</span>
				<Badge variant="secondary" className="ml-2 text-[11px] px-1.5 py-0">
					{count}
				</Badge>
				<span className="ml-auto text-xs text-muted-foreground">
					{summary}
				</span>
			</CollapsibleTrigger>

			{/* Items */}
			<CollapsibleContent className="overflow-hidden">
				<div className="mt-1">
					{children}
					{overflow > 0 && (
						<Link
							href={viewMoreHref}
							className="block text-xs text-primary hover:text-primary/80 font-medium py-2 px-3"
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
	const overdueTasks = useQuery(api.tasks.getOverdue, {});
	const upcomingTasks = useQuery(api.tasks.getUpcoming, { daysAhead: 7 });
	const overdueInvoices = useQuery(api.invoices.getOverdue, {});
	const awaitingQuotes = useQuery(api.quotes.getAwaitingSigning, {});
	const clients = useQuery(api.clients.list, {});

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

	const getClientName = (clientId?: Id<"clients">): string => {
		if (!clientId) return "No Client";
		return (
			clients?.find((c) => c._id === clientId)?.companyName ??
			"Unknown Client"
		);
	};

	const isLoading =
		overdueTasks === undefined ||
		upcomingTasks === undefined ||
		overdueInvoices === undefined ||
		awaitingQuotes === undefined ||
		clients === undefined;

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-6 w-48" />
				{[1, 2, 3].map((i) => (
					<Skeleton
						key={i}
						className="h-10 w-full rounded-md"
						style={{ opacity: 1 - (i - 1) * 0.25 }}
					/>
				))}
			</div>
		);
	}

	// Merge and sort all tasks by urgency (most overdue first, then today, then upcoming)
	const allTasks = [
		...(overdueTasks ?? []),
		...(upcomingTasks ?? []),
	].sort((a, b) => a.date - b.date);

	// Deduplicate tasks (overdue and upcoming may overlap)
	const seenTaskIds = new Set<string>();
	const dedupedTasks = allTasks.filter((t) => {
		if (seenTaskIds.has(t._id)) return false;
		seenTaskIds.add(t._id);
		return true;
	});

	// Sort invoices by due date (most urgent first)
	const sortedInvoices = [...(overdueInvoices ?? [])].sort(
		(a, b) => a.dueDate - b.dueDate,
	);

	// Sort quotes by validUntil (expiring soonest first)
	const sortedQuotes = [...(awaitingQuotes ?? [])] as Doc<"quotes">[];
	sortedQuotes.sort(
		(a, b) => (a.validUntil ?? Infinity) - (b.validUntil ?? Infinity),
	);

	// Counts
	const taskCount = dedupedTasks.length;
	const invoiceCount = sortedInvoices.length;
	const quoteCount = sortedQuotes.length;
	const totalCount = taskCount + invoiceCount + quoteCount;

	// Task summary
	const overdueTaskCount = dedupedTasks.filter(
		(t) => getDaysLate(t.date) > 0,
	).length;
	const todayTaskCount = dedupedTasks.filter((t) => {
		const d = getDaysUntil(t.date);
		return d === 0;
	}).length;
	const taskSummaryParts: string[] = [];
	if (overdueTaskCount > 0) taskSummaryParts.push(`${overdueTaskCount} overdue`);
	if (todayTaskCount > 0) taskSummaryParts.push(`${todayTaskCount} today`);
	if (taskSummaryParts.length === 0 && taskCount > 0)
		taskSummaryParts.push("this week");
	const taskSummary = taskSummaryParts.join(", ");

	// Invoice summary
	const invoiceTotal = sortedInvoices.reduce((sum, inv) => sum + inv.total, 0);
	const invoiceSummary =
		invoiceCount > 0 ? `${formatCurrency(invoiceTotal)} outstanding` : "";

	// Quote summary
	const expiringQuoteCount = sortedQuotes.filter((q) => {
		const d = q.validUntil ? getDaysUntil(q.validUntil) : null;
		return d !== null && d >= 0 && d <= 3;
	}).length;
	const quoteSummary =
		expiringQuoteCount > 0
			? `${expiringQuoteCount} expiring soon`
			: quoteCount > 0
				? "awaiting response"
				: "";

	// Total overdue count for badge
	const overdueInvoiceCount = sortedInvoices.filter(
		(inv) => getDaysUntil(inv.dueDate) < 0,
	).length;
	const totalOverdue = overdueTaskCount + overdueInvoiceCount;

	// Determine which sections have overdue items (for ordering)
	const sectionsHaveOverdue = {
		tasks: overdueTaskCount > 0,
		invoices: overdueInvoiceCount > 0,
		quotes: sortedQuotes.some(
			(q) => q.validUntil !== undefined && getDaysUntil(q.validUntil) < 0,
		),
	};

	// Build ordered sections: overdue sections first
	type SectionKey = "tasks" | "invoices" | "quotes";
	const sectionOrder: SectionKey[] = ["tasks", "invoices", "quotes"];
	sectionOrder.sort((a, b) => {
		const aOverdue = sectionsHaveOverdue[a] ? 0 : 1;
		const bOverdue = sectionsHaveOverdue[b] ? 0 : 1;
		return aOverdue - bOverdue;
	});

	if (totalCount === 0) {
		return (
			<div className="space-y-4">
				<div>
					<p className="text-sm font-semibold mt-1">
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
					<h3 className="text-lg font-semibold mt-4">
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

	const renderSection = (key: SectionKey) => {
		switch (key) {
			case "tasks":
				return (
					<AttentionSection
						key="tasks"
						title="Tasks"
						icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
						summary={taskSummary}
						count={taskCount}
						defaultOpen={true}
						viewMoreHref="/tasks"
						totalItems={taskCount}
					>
						{dedupedTasks.slice(0, 5).map((task, i) => (
							<TaskRow
								key={task._id}
								task={task}
								clientName={getClientName(task.clientId)}
								onStatusChange={handleStatusChange}
								isUpdating={updatingTasks.has(task._id)}
								isLast={i === Math.min(4, dedupedTasks.length - 1)}
							/>
						))}
					</AttentionSection>
				);
			case "invoices":
				return (
					<AttentionSection
						key="invoices"
						title="Invoices"
						icon={<FileText className="h-4 w-4 text-muted-foreground" />}
						summary={invoiceSummary}
						count={invoiceCount}
						defaultOpen={true}
						viewMoreHref="/invoices"
						totalItems={invoiceCount}
					>
						{sortedInvoices.slice(0, 5).map((invoice, i) => (
							<InvoiceRow
								key={invoice._id}
								invoice={invoice}
								clientName={getClientName(invoice.clientId)}
								isLast={i === Math.min(4, sortedInvoices.length - 1)}
							/>
						))}
					</AttentionSection>
				);
			case "quotes":
				return (
					<AttentionSection
						key="quotes"
						title="Quotes"
						icon={
							<FileSignature className="h-4 w-4 text-muted-foreground" />
						}
						summary={quoteSummary}
						count={quoteCount}
						defaultOpen={true}
						viewMoreHref="/quotes"
						totalItems={quoteCount}
					>
						{sortedQuotes.slice(0, 5).map((quote, i) => (
							<QuoteRow
								key={quote._id}
								quote={quote}
								clientName={getClientName(quote.clientId)}
								isLast={i === Math.min(4, sortedQuotes.length - 1)}
							/>
						))}
					</AttentionSection>
				);
		}
	};

	return (
		<div className="space-y-4">
			{/* Header */}
			<div>
				<div className="flex items-center gap-2 mt-1">
					<p className="text-sm font-semibold">
						Needs Attention ({totalCount})
					</p>
					{totalOverdue > 0 && (
						<Badge
							className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
							aria-label={`${totalOverdue} overdue items`}
						>
							{totalOverdue} overdue
						</Badge>
					)}
				</div>
			</div>

			{/* Sections - ordered by urgency */}
			<div className="space-y-3">
				{sectionOrder.map(renderSection)}
			</div>
		</div>
	);
}

export default NeedsAttention;
