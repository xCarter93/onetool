"use client";

import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { formatDistanceToNowStrict } from "date-fns";
import { PenSquare, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { cn } from "@/lib/utils";
import type { InboxFilter, InboxThread } from "../lib/inbox-utils";

const FILTER_OPTIONS = [
	{ value: "all" as const, label: "All" },
	{ value: "unread" as const, label: "Unread" },
	{ value: "unlinked" as const, label: "Unlinked" },
];

const EMPTY_COPY: Record<InboxFilter, { title: string; description: string }> = {
	all: {
		title: "No conversations",
		description: "Emails from your clients will show up here.",
	},
	unread: {
		title: "No unread conversations",
		description: "You're all caught up.",
	},
	unlinked: {
		title: "No unlinked conversations",
		description: "Every conversation is tied to a client.",
	},
};

interface ThreadListProps {
	loading: boolean;
	threads: InboxThread[];
	filter: InboxFilter;
	onFilterChange: (filter: InboxFilter) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	selectedThreadId: Id<"emailThreads"> | null;
	onSelect: (threadId: Id<"emailThreads">) => void;
	onCompose: () => void;
}

export function ThreadList({
	loading,
	threads,
	filter,
	onFilterChange,
	searchQuery,
	onSearchChange,
	selectedThreadId,
	onSelect,
	onCompose,
}: ThreadListProps) {
	const searching = searchQuery.trim().length > 0;

	return (
		<>
			<div className="sticky top-0 z-10 shrink-0 space-y-3 border-b border-border bg-card px-4 pb-3 pt-4">
				<div className="flex items-center justify-between gap-2">
					<h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
					<Button size="sm" variant="outline" onClick={onCompose}>
						<PenSquare className="size-4" aria-hidden="true" />
						New email
					</Button>
				</div>

				<div className="relative">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search client or subject…"
						aria-label="Search inbox"
						className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-8 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20"
					/>
					{searching && (
						<button
							type="button"
							onClick={() => onSearchChange("")}
							aria-label="Clear search"
							className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center justify-center rounded p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<X className="size-3.5" aria-hidden="true" />
						</button>
					)}
				</div>

				<SegmentedControl
					value={filter}
					onValueChange={onFilterChange}
					options={FILTER_OPTIONS}
				/>
			</div>

			<div className="flex-1 overflow-y-auto min-h-0">
				{loading ? (
					<ThreadListSkeleton />
				) : threads.length === 0 ? (
					<div className="flex h-full items-center p-4">
						<EmptyState
							size="sm"
							illustration={searching ? "no-filter-match" : "messages-none"}
							title={searching ? "No matches" : EMPTY_COPY[filter].title}
							description={
								searching
									? `Nothing matches “${searchQuery.trim()}”.`
									: EMPTY_COPY[filter].description
							}
						/>
					</div>
				) : (
					<ul className="divide-y divide-border/60 py-0.5">
						{threads.map((thread) => (
							<li key={thread.threadDocId}>
								<ThreadRow
									thread={thread}
									selected={selectedThreadId === thread.threadDocId}
									onSelect={onSelect}
								/>
							</li>
						))}
					</ul>
				)}
			</div>
		</>
	);
}

function ThreadRow({
	thread,
	selected,
	onSelect,
}: {
	thread: InboxThread;
	selected: boolean;
	onSelect: (threadId: Id<"emailThreads">) => void;
}) {
	const unread = thread.unreadCount > 0;
	const contactName = thread.contact?.name?.trim() || "Unknown sender";

	return (
		<button
			type="button"
			onClick={() => onSelect(thread.threadDocId)}
			aria-current={selected ? "true" : undefined}
			className={cn(
				"flex w-full cursor-pointer items-start gap-2 border-l-2 py-2 pl-3 pr-3 text-left transition-colors duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
				selected
					? "border-l-primary bg-accent"
					: "border-l-transparent hover:bg-accent/60"
			)}
		>
			{/* Fixed gutter keeps the type rhythm flat: a dot marks unread instead
			    of bolding the whole row. */}
			<span
				aria-hidden="true"
				className={cn(
					"mt-1.5 size-1.5 shrink-0 rounded-full",
					unread ? "bg-primary" : "bg-transparent"
				)}
			/>
			{unread && <span className="sr-only">Unread.</span>}
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline justify-between gap-2">
					<span
						className={cn(
							"truncate text-sm text-foreground",
							unread ? "font-semibold" : "font-medium"
						)}
					>
						{contactName}
						{thread.clientName && (
							<span className="font-normal text-muted-foreground">
								{" "}
								· {thread.clientName}
							</span>
						)}
					</span>
					<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
						{formatDistanceToNowStrict(new Date(thread.lastMessageAt), {
							addSuffix: true,
						})}
					</span>
				</span>
				<span
					className={cn(
						"block truncate text-xs",
						unread ? "font-medium text-foreground" : "text-foreground/80"
					)}
				>
					{thread.subject || "(no subject)"}
				</span>
				<span className="line-clamp-1 block text-xs text-muted-foreground">
					{thread.lastMessageDirection === "outbound" && (
						<span className="text-muted-foreground/70">You: </span>
					)}
					{thread.preview || "No preview available"}
				</span>
			</span>
		</button>
	);
}

function ThreadListSkeleton() {
	return (
		<div className="space-y-1 p-2">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="space-y-1.5 px-2 py-2">
					<div className="flex items-center justify-between gap-2">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-10" />
					</div>
					<Skeleton className="h-3 w-3/4" />
					<Skeleton className="h-3 w-full" />
				</div>
			))}
		</div>
	);
}
