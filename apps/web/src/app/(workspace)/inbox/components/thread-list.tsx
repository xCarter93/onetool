"use client";

import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";
import {
	ChevronDown,
	ChevronRight,
	Inbox as InboxIcon,
	Search,
	X,
} from "lucide-react";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { StyledSegmentedControl } from "@/components/ui/styled/styled-segmented-control";
import { cn } from "@/lib/utils";
import type {
	DisplayGroup,
	InboxFilter,
	InboxThread,
} from "../lib/inbox-utils";

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
	groups: DisplayGroup[];
	filter: InboxFilter;
	onFilterChange: (filter: InboxFilter) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	selectedThreadId: Id<"emailThreads"> | null;
	onSelect: (threadId: Id<"emailThreads">) => void;
	onToggleGroup: (key: string) => void;
}

export function ThreadList({
	loading,
	groups,
	filter,
	onFilterChange,
	searchQuery,
	onSearchChange,
	selectedThreadId,
	onSelect,
	onToggleGroup,
}: ThreadListProps) {
	const searching = searchQuery.trim().length > 0;

	return (
		<>
			<div className="sticky top-0 z-10 shrink-0 space-y-3 border-b border-border bg-card px-4 pb-3 pt-4">
				<h1 className="text-lg font-semibold tracking-tight">Inbox</h1>

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

				<StyledSegmentedControl
					value={filter}
					onValueChange={onFilterChange}
					options={FILTER_OPTIONS}
				/>
			</div>

			<div className="flex-1 overflow-y-auto min-h-0">
				{loading ? (
					<ThreadListSkeleton />
				) : groups.length === 0 ? (
					<div className="flex h-full items-center p-4">
						<Empty className="border-none">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									{searching ? (
										<Search aria-hidden="true" />
									) : (
										<InboxIcon aria-hidden="true" />
									)}
								</EmptyMedia>
								<EmptyTitle>
									{searching ? "No matches" : EMPTY_COPY[filter].title}
								</EmptyTitle>
								<EmptyDescription>
									{searching
										? `Nothing matches “${searchQuery.trim()}”.`
										: EMPTY_COPY[filter].description}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				) : (
					<div className="py-1">
						{groups.map((group) => (
							<section key={group.key} aria-label={group.contactName}>
								<GroupHeader
									group={group}
									onToggle={() => onToggleGroup(group.key)}
								/>
								{group.expanded && (
									<ul>
										{group.threads.map((thread) => (
											<li key={thread.threadDocId}>
												<ThreadRow
													thread={thread}
													selected={
														selectedThreadId === thread.threadDocId
													}
													onSelect={onSelect}
												/>
											</li>
										))}
									</ul>
								)}
							</section>
						))}
					</div>
				)}
			</div>
		</>
	);
}

function GroupHeader({
	group,
	onToggle,
}: {
	group: DisplayGroup;
	onToggle: () => void;
}) {
	const Chevron = group.expanded ? ChevronDown : ChevronRight;
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={group.expanded}
			className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
		>
			<Chevron
				aria-hidden="true"
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
			<span className="truncate text-sm font-medium text-foreground">
				{group.contactName}
			</span>
			{group.clientName && (
				<span className="truncate text-xs text-muted-foreground">
					· {group.clientName}
				</span>
			)}
			<span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
				{group.unreadCount > 0 && (
					<span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
						{group.unreadCount}
					</span>
				)}
				<span className="text-[11px] tabular-nums text-muted-foreground">
					{group.threads.length}
				</span>
			</span>
		</button>
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
	return (
		<button
			type="button"
			onClick={() => onSelect(thread.threadDocId)}
			aria-current={selected ? "true" : undefined}
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 border-l-2 py-1.5 pl-8 pr-3 text-left transition-colors duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
				selected
					? "border-l-primary bg-accent"
					: "border-l-transparent hover:bg-accent/60"
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					unread ? "bg-primary" : "bg-transparent"
				)}
			/>
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline justify-between gap-2">
					<span
						className={cn(
							"truncate text-sm",
							unread ? "font-semibold text-foreground" : "text-foreground"
						)}
					>
						{thread.subject || "(no subject)"}
					</span>
					<span className="shrink-0 text-[11px] text-muted-foreground">
						{formatDistanceToNow(new Date(thread.lastMessageAt), {
							addSuffix: true,
						})}
					</span>
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
		<div className="space-y-2 p-3">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex items-center gap-2">
					<Skeleton className="size-3.5 rounded" />
					<Skeleton className="h-3.5 w-2/3" />
					<Skeleton className="ml-auto h-3.5 w-6" />
				</div>
			))}
		</div>
	);
}
