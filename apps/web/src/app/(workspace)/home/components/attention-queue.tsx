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
	Circle,
	ClipboardList,
	FileSignature,
	FileText,
} from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { IconTile } from "@/components/reui/icon-tile";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
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
import type { Task } from "@/types/task";
import {
	invoiceUrgency,
	quoteUrgency,
	taskUrgency,
	useAttentionQueue,
	type AttentionQueue as QueueData,
} from "./use-attention-queue";

const COMPACT_ROWS = 3;
/** Three rows plus their dividers — held constant so the panel never resizes. */
const ROWS_MIN_HEIGHT = "min-h-[9.75rem]";

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

function UrgencyLabel({
	label,
	overdue,
}: {
	label: string;
	overdue: boolean;
}) {
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

function QueueRow({
	href,
	title,
	meta,
	urgency,
	leading,
}: {
	href?: string;
	title: string;
	meta: string;
	urgency: { label: string; overdue: boolean };
	leading?: React.ReactNode;
}) {
	const body = (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-sm font-medium text-foreground">
					{title}
				</span>
				<UrgencyLabel {...urgency} />
			</div>
			<span className="truncate text-xs text-muted-foreground">{meta}</span>
		</div>
	);

	const rowClass =
		"flex h-13 items-center gap-2.5 px-2.5 transition-colors duration-150 hover:bg-muted/40";

	if (!href) {
		return (
			<div className={rowClass}>
				{leading}
				{body}
			</div>
		);
	}

	return (
		<div className={rowClass}>
			{leading}
			<Link
				href={href as Route}
				className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
			>
				{body}
			</Link>
		</div>
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
			className={overdue ? "text-destructive" : "text-muted-foreground"}
		>
			<Icon aria-hidden="true" />
		</IconTile>
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
	let rows: React.ReactNode;
	if (column === "tasks") {
		const tasks = limit ? queue.tasks.slice(0, limit) : queue.tasks;
		rows = tasks.map((task) => {
			const urgency = taskUrgency(task);
			return (
				<QueueRow
					key={task._id}
					href="/tasks"
					title={task.title}
					meta={taskMeta(queue, task)}
					urgency={urgency}
					leading={
						withCheckbox ? (
							<TaskCheckbox task={task} />
						) : (
							<RowTile icon={ClipboardList} overdue={urgency.overdue} />
						)
					}
				/>
			);
		});
	} else if (column === "invoices") {
		const invoices = limit ? queue.invoices.slice(0, limit) : queue.invoices;
		rows = invoices.map((invoice) => {
			const urgency = invoiceUrgency(invoice);
			return (
				<QueueRow
					key={invoice._id}
					href={`/invoices/${invoice._id}`}
					title={`${invoice.invoiceNumber} · ${formatCurrency(invoice.remainingBalance ?? invoice.total)}`}
					meta={queue.getClientName(invoice.clientId)}
					urgency={urgency}
					leading={<RowTile icon={FileText} overdue={urgency.overdue} />}
				/>
			);
		});
	} else {
		const quotes = limit ? queue.quotes.slice(0, limit) : queue.quotes;
		rows = quotes.map((quote) => {
			const urgency = quoteUrgency(quote);
			return (
				<QueueRow
					key={quote._id}
					href={`/quotes/${quote._id}`}
					title={`${quote.quoteNumber ?? "Draft"} · ${formatCurrency(quote.total)}`}
					meta={queue.getClientName(quote.clientId)}
					urgency={urgency}
					leading={<RowTile icon={FileSignature} overdue={urgency.overdue} />}
				/>
			);
		});
	}

	return (
		<div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
			{rows}
		</div>
	);
}

function QueueSheet({ queue }: { queue: QueueData }) {
	return (
		<Sheet>
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
						{queue.overdueCount > 0
							? `, ${queue.overdueCount} overdue`
							: ""}
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="px-5 pb-6">
						{COLUMNS.map((column) => {
							const count = queue.counts[column.key];
							return (
								<section key={column.key} className="pt-5">
									<div className="flex items-center gap-2 pb-1">
										<column.icon
											className="size-4 text-muted-foreground"
											aria-hidden="true"
										/>
										<h3 className="text-sm font-semibold">{column.label}</h3>
										<Badge variant="secondary" size="sm">
											{count}
										</Badge>
										<span className="ml-auto text-xs text-muted-foreground">
											{queue.summaries[column.key]}
										</span>
									</div>
									{count === 0 ? (
										<p className="py-3 text-sm text-muted-foreground">
											{column.emptyLabel}.
										</p>
									) : (
										<ColumnRows
											queue={queue}
											column={column.key}
											withCheckbox
										/>
									)}
								</section>
							);
						})}
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}

export function AttentionQueue() {
	const queue = useAttentionQueue();

	if (queue.isLoading) {
		return (
			<div className="w-full">
				<div className="flex items-center justify-between gap-3 pb-3">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-4 w-28" />
				</div>
				<div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
					{COLUMNS.map((column) => (
						<div key={column.key} className={cn("space-y-2", ROWS_MIN_HEIGHT)}>
							<Skeleton className="h-4 w-24" />
							{Array.from({ length: COMPACT_ROWS }).map((_, i) => (
								<Skeleton key={i} className="h-9 w-full" />
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
				<CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
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
				<QueueSheet queue={queue} />
			</div>

			<div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
				{COLUMNS.map((column) => {
					const count = queue.counts[column.key];
					return (
						<div key={column.key} className="min-w-0">
							<div className="flex items-center gap-2 pb-0.5">
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
							</div>
							{count === 0 ? (
								<p className="pt-1 text-sm text-muted-foreground">
									{column.emptyLabel}.
								</p>
							) : (
								<>
									<p className="truncate pb-1 text-xs text-muted-foreground">
										{queue.summaries[column.key]}
									</p>
									<ColumnRows
										queue={queue}
										column={column.key}
										limit={COMPACT_ROWS}
									/>
								</>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
