"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	ArrowRight,
	CheckCircle2,
	ChevronRight,
	Circle,
	ClipboardList,
	FileSignature,
	FileText,
} from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { IconTile } from "@/components/reui/icon-tile";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import { useOrgToday } from "@/hooks/use-org-today";
import type { Task } from "@/types/task";
import {
	invoiceUrgency,
	quoteUrgency,
	taskUrgency,
	useAttentionQueue,
	type AttentionQueue as QueueData,
} from "./use-attention-queue";

const COMPACT_ROWS = 3;

type ColumnKey = "tasks" | "invoices" | "quotes";

const COLUMNS: Array<{
	key: ColumnKey;
	label: string;
	icon: typeof ClipboardList;
	href: string;
	emptyLabel: string;
}> = [
	{
		key: "tasks",
		label: "Tasks",
		icon: ClipboardList,
		href: "/tasks",
		emptyLabel: "No tasks due",
	},
	{
		key: "invoices",
		label: "Invoices",
		icon: FileText,
		href: "/invoices",
		emptyLabel: "Nothing to chase",
	},
	{
		key: "quotes",
		label: "Quotes",
		icon: FileSignature,
		href: "/quotes",
		emptyLabel: "No quotes waiting",
	},
];

function UrgencyLabel({ label, overdue }: { label: string; overdue: boolean }) {
	if (overdue) {
		return (
			<StatusBadge status="overdue" size="sm" className="shrink-0">
				{label}
			</StatusBadge>
		);
	}
	return (
		<span className="shrink-0 text-xs text-muted-foreground">{label}</span>
	);
}

/** Urgency-tinted icon tile: overdue rows read red at a glance. */
function RowTile({
	icon: Icon,
	overdue,
}: {
	icon: typeof ClipboardList;
	overdue: boolean;
}) {
	return (
		<IconTile
			variant={overdue ? "soft" : "outline"}
			size="sm"
			className={cn(
				"shrink-0",
				overdue ? "text-destructive" : "text-muted-foreground"
			)}
		>
			<Icon aria-hidden="true" />
		</IconTile>
	);
}

function TaskCheckbox({ task }: { task: Task }) {
	const [isUpdating, setIsUpdating] = useState(false);
	const completeTask = useMutation(api.tasks.complete);
	const updateTask = useMutation(api.tasks.update);
	const isCompleted = task.status === "completed";

	const toggle = async () => {
		if (isUpdating) return;
		setIsUpdating(true);
		try {
			if (isCompleted) {
				await updateTask({ id: task._id as Id<"tasks">, status: "pending" });
			} else {
				await completeTask({ id: task._id as Id<"tasks"> });
			}
		} finally {
			setIsUpdating(false);
		}
	};

	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={isCompleted}
			aria-label={
				isCompleted
					? `Mark ${task.title} as not complete`
					: `Mark ${task.title} as complete`
			}
			onClick={toggle}
			disabled={isUpdating}
			// The ::before expands the hit area to 44px without moving the glyph.
			className={cn(
				"relative shrink-0 rounded-full transition-colors before:absolute before:-inset-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isUpdating && "cursor-not-allowed opacity-50"
			)}
		>
			{isCompleted ? (
				<CheckCircle2 className="size-5 text-success" />
			) : (
				<Circle className="size-5 text-muted-foreground hover:text-foreground" />
			)}
		</button>
	);
}

function taskMeta(queue: QueueData, task: Task): string {
	return task.description || queue.getClientName(task.clientId);
}

function AttentionItem({
	href,
	title,
	meta,
	amount,
	urgency,
	icon,
	checkbox,
}: {
	href?: string;
	title: string;
	meta: string;
	amount?: string;
	urgency: { label: string; overdue: boolean };
	icon?: typeof ClipboardList;
	checkbox?: React.ReactNode;
}) {
	// Elevated card matching FramePanel's language; overdue reads as a whole-card
	// soft destructive treatment (side-stripes are banned by anti-slop).
	const itemClass = urgency.overdue
		? "border-destructive/30 bg-destructive/5 shadow-xs dark:bg-destructive/10"
		: "bg-card shadow-xs";

	const body = (
		<>
			<ItemContent className="min-w-0">
				<ItemTitle className="w-full">
					<span className="truncate text-sm font-medium">{title}</span>
				</ItemTitle>
				<ItemDescription className="truncate text-xs">{meta}</ItemDescription>
			</ItemContent>
			<ItemActions className="flex-col items-end gap-1 self-center">
				{amount !== undefined && (
					<span className="text-sm font-semibold tabular-nums leading-none">
						{amount}
					</span>
				)}
				<UrgencyLabel {...urgency} />
			</ItemActions>
		</>
	);

	// An interactive leading control can't live inside an anchor, so the link
	// wraps only the row body when a checkbox is present.
	if (checkbox) {
		return (
			<Item variant="outline" size="xs" className={itemClass}>
				{checkbox}
				{href ? (
					<Link
						href={href as Route}
						className="flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					>
						{body}
					</Link>
				) : (
					body
				)}
			</Item>
		);
	}

	return (
		<Item
			variant="outline"
			size="xs"
			className={itemClass}
			render={href ? <Link href={href as Route} /> : undefined}
		>
			{icon && <RowTile icon={icon} overdue={urgency.overdue} />}
			{body}
		</Item>
	);
}

function ColumnRows({
	queue,
	column,
	limit,
	withCheckbox,
}: {
	queue: QueueData;
	column: ColumnKey;
	limit?: number;
	withCheckbox?: boolean;
}) {
	const orgToday = useOrgToday();
	let rows: React.ReactNode;
	if (column === "tasks") {
		const tasks = limit ? queue.tasks.slice(0, limit) : queue.tasks;
		rows = tasks.map((task) => {
			const urgency = taskUrgency(task);
			return (
				<AttentionItem
					key={task._id}
					href="/tasks"
					title={task.title}
					meta={taskMeta(queue, task)}
					urgency={urgency}
					icon={withCheckbox ? undefined : ClipboardList}
					checkbox={withCheckbox ? <TaskCheckbox task={task} /> : undefined}
				/>
			);
		});
	} else if (column === "invoices") {
		const invoices = limit ? queue.invoices.slice(0, limit) : queue.invoices;
		rows = invoices.map((invoice) => {
			const urgency = invoiceUrgency(invoice, orgToday);
			return (
				<AttentionItem
					key={invoice._id}
					href={`/invoices/${invoice._id}`}
					title={invoice.invoiceNumber}
					meta={queue.getClientName(invoice.clientId)}
					amount={formatCurrency(invoice.remainingBalance ?? invoice.total)}
					urgency={urgency}
					icon={FileText}
				/>
			);
		});
	} else {
		const quotes = limit ? queue.quotes.slice(0, limit) : queue.quotes;
		rows = quotes.map((quote) => {
			const urgency = quoteUrgency(quote);
			return (
				<AttentionItem
					key={quote._id}
					href={`/quotes/${quote._id}`}
					title={quote.quoteNumber ?? "Draft"}
					meta={queue.getClientName(quote.clientId)}
					amount={formatCurrency(quote.total)}
					urgency={urgency}
					icon={FileSignature}
				/>
			);
		});
	}

	return <div className="flex flex-col gap-1.5">{rows}</div>;
}

function QueueSheet({
	queue,
	open,
	onOpenChange,
}: {
	queue: QueueData;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetTrigger
				render={
					<Button variant="ghost" size="sm" className="-me-2 shrink-0" />
				}
			>
				Open the queue
				<ArrowRight className="ml-1 size-4" aria-hidden="true" />
			</SheetTrigger>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-5 py-4 text-left">
					<SheetTitle>Needs attention</SheetTitle>
					<SheetDescription>
						{queue.counts.total} open item
						{queue.counts.total === 1 ? "" : "s"}
						{queue.overdueCount > 0 ? `, ${queue.overdueCount} overdue` : ""}
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="flex flex-col gap-4 px-5 py-5">
						{COLUMNS.map((column) => {
							const count = queue.counts[column.key];
							return (
								<QueueSheetSection
									key={column.key}
									queue={queue}
									column={column}
									count={count}
								/>
							);
						})}
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}

function QueueSheetSection({
	queue,
	column,
	count,
}: {
	queue: QueueData;
	column: (typeof COLUMNS)[number];
	count: number;
}) {
	const [open, setOpen] = useState(true);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<ChevronRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
						open && "rotate-90"
					)}
					aria-hidden="true"
				/>
				<column.icon
					className="size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<span className="text-sm font-semibold">{column.label}</span>
				<Badge variant="secondary" size="sm">
					{count}
				</Badge>
				<span className="ml-auto truncate text-xs text-muted-foreground">
					{queue.summaries[column.key]}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				{count === 0 ? (
					<p className="px-3 py-3 text-sm text-muted-foreground">
						{column.emptyLabel}.
					</p>
				) : (
					<div className="pt-2">
						<ColumnRows queue={queue} column={column.key} withCheckbox />
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function AttentionQueue() {
	const queue = useAttentionQueue();
	const [sheetOpen, setSheetOpen] = useState(false);

	if (queue.isLoading) {
		return (
			<div className="w-full">
				<div className="flex items-center justify-between gap-3 pb-3">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-28" />
				</div>
				<div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
					{COLUMNS.map((column) => (
						<div key={column.key} className="space-y-2">
							<Skeleton className="h-4 w-24" />
							{Array.from({ length: COMPACT_ROWS }).map((_, i) => (
								<Skeleton key={i} className="h-12 w-full" />
							))}
						</div>
					))}
				</div>
			</div>
		);
	}

	// All clear: one quiet line instead of three empty columns.
	if (queue.counts.total === 0) {
		return (
			<div className="flex w-full items-center gap-2.5">
				<CheckCircle2
					className="size-4 shrink-0 text-success"
					aria-hidden="true"
				/>
				<p className="text-sm text-foreground">
					You&apos;re all caught up.
					<span className="text-muted-foreground">
						{" "}
						Overdue tasks, unpaid invoices, and waiting quotes will show up
						here.
					</span>
				</p>
			</div>
		);
	}

	return (
		<div className="w-full">
			<div className="flex items-center justify-between gap-3 pb-2">
				<div className="flex items-center gap-2">
					<h3 className="text-sm font-semibold text-foreground">
						Needs attention
					</h3>
					<Badge variant="secondary" size="sm">
						{queue.counts.total}
					</Badge>
					{queue.overdueCount > 0 && (
						<StatusBadge
							status="overdue"
							size="sm"
							aria-label={`${queue.overdueCount} overdue items`}
						>
							{queue.overdueCount} overdue
						</StatusBadge>
					)}
				</div>
				<QueueSheet
					queue={queue}
					open={sheetOpen}
					onOpenChange={setSheetOpen}
				/>
			</div>

			<div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
				{COLUMNS.map((column) => {
					const count = queue.counts[column.key];
					const overflow = count - COMPACT_ROWS;
					return (
						<div key={column.key} className="min-w-0">
							<div className="flex items-center gap-2 pb-1.5">
								<column.icon
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									{column.label}
								</span>
								{count > 0 && (
									<Badge variant="secondary" size="xs">
										{count}
									</Badge>
								)}
								<span className="ml-auto truncate text-xs text-muted-foreground">
									{count > 0 ? queue.summaries[column.key] : ""}
								</span>
							</div>
							{count === 0 ? (
								<p className="pt-1 text-sm text-muted-foreground">
									{column.emptyLabel}.
								</p>
							) : (
								<>
									<ColumnRows
										queue={queue}
										column={column.key}
										limit={COMPACT_ROWS}
									/>
									{overflow > 0 && (
										<button
											type="button"
											onClick={() => setSheetOpen(true)}
											className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											+{overflow} more
											<ArrowRight className="size-3" aria-hidden="true" />
										</button>
									)}
								</>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
