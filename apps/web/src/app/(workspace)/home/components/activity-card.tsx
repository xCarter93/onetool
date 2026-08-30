"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, Search } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Timeline } from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { cn } from "@/lib/utils";
import { resolveNotificationHref } from "@/lib/notification-utils";
import ActivityItem, {
	ActivityTimelineItem,
	type ActivityWithUser,
} from "./activity-item";

const COMPACT_ITEMS = 5;
const SHEET_PAGE_SIZE = 40;
const SHEET_MAX_ITEMS = 200;
const ESTIMATED_ROW_HEIGHT = 76;

type EntityFilter =
	| "all"
	| "client"
	| "project"
	| "quote"
	| "invoice"
	| "payment"
	| "task"
	| "user";

const ENTITY_FILTERS: Array<{ value: EntityFilter; label: string }> = [
	{ value: "all", label: "All activity" },
	{ value: "client", label: "Clients" },
	{ value: "project", label: "Projects" },
	{ value: "quote", label: "Quotes" },
	{ value: "invoice", label: "Invoices" },
	{ value: "payment", label: "Payments" },
	{ value: "task", label: "Tasks" },
	{ value: "user", label: "Team" },
];

function activityHref(activity: ActivityWithUser): string | null {
	return resolveNotificationHref({
		entityType: activity.entityType as
			| "client"
			| "project"
			| "quote"
			| "invoice"
			| "task",
		entityId: activity.entityId,
	});
}

function ActivityRow({
	activity,
	isLast,
}: {
	activity: ActivityWithUser;
	isLast: boolean;
}) {
	const href = activityHref(activity);
	const router = useRouter();

	if (!href) {
		return (
			<ul className="pl-1">
				<ActivityItem activity={activity} isLast={isLast} />
			</ul>
		);
	}

	// Clickable wrapper instead of an overlay link: an overlay would swallow
	// hover for the change-diff tooltips inside ActivityItem (and an anchor
	// around it would break <ul> content rules).
	const navigate = () => router.push(href as Route);
	return (
		<div
			role="link"
			tabIndex={0}
			aria-label={`Open ${activity.entityName}`}
			onClick={(event) => {
				const target = event.target as HTMLElement;
				if (target.closest("a,button,[role='button']")) return;
				navigate();
			}}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				navigate();
			}}
			className="cursor-pointer rounded-md transition-colors duration-150 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
		>
			<ul className="pl-1">
				<ActivityItem activity={activity} isLast={isLast} />
			</ul>
		</div>
	);
}

function ActivitySheet() {
	const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
	const [search, setSearch] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	const { results, status, loadMore } = usePaginatedQuery(
		api.activities.feed,
		entityFilter === "all" ? {} : { entityType: entityFilter },
		{ initialNumItems: SHEET_PAGE_SIZE }
	);

	const items = useMemo(() => {
		const capped = results.slice(0, SHEET_MAX_ITEMS) as ActivityWithUser[];
		const term = search.trim().toLowerCase();
		if (!term) return capped;
		return capped.filter((item) =>
			item.entityName.toLowerCase().includes(term)
		);
	}, [results, search]);

	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: 8,
		getItemKey: (index) => items[index]?._id ?? index,
	});

	// Keep pulling pages until the cap is reached; the text filter is applied
	// client-side, so a sparse match set still needs the backlog loaded.
	const lastVirtualItem = virtualizer.getVirtualItems().at(-1);
	useEffect(() => {
		if (status !== "CanLoadMore") return;
		if (results.length >= SHEET_MAX_ITEMS) return;
		// A filter with zero matches so far still has backlog to search through.
		if (
			items.length > 0 &&
			(!lastVirtualItem || lastVirtualItem.index < items.length - 5)
		)
			return;
		loadMore(SHEET_PAGE_SIZE);
	}, [status, results.length, items.length, lastVirtualItem, loadMore]);

	const isLoading = status === "LoadingFirstPage";

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex gap-2 border-b border-border px-5 pb-4">
				<Select
					value={entityFilter}
					onValueChange={(value) => setEntityFilter(value as EntityFilter)}
				>
					<SelectTrigger className="w-40" aria-label="Filter by record type">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ENTITY_FILTERS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="relative min-w-0 flex-1">
					<Search
						className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search by record name"
						aria-label="Search loaded activity by record name"
						className="pl-8"
					/>
				</div>
			</div>

			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				{isLoading ? (
					<div className="space-y-4">
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="flex items-start gap-3">
								<Skeleton className="size-8 shrink-0 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-3.5 w-3/4" />
									<Skeleton className="h-3 w-1/3" />
								</div>
							</div>
						))}
					</div>
				) : items.length === 0 ? (
					<EmptyState
						illustration={search ? "no-filter-match" : "activity-none"}
						title={search ? "No matches" : "No activity yet"}
						description={
							search
								? "No loaded activity mentions that record."
								: "Activity shows up here as you work."
						}
						className="min-h-[240px] justify-center"
					/>
				) : (
					<div
						className="relative w-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const activity = items[virtualRow.index];
							return (
								<div
									key={activity._id}
									ref={virtualizer.measureElement}
									data-index={virtualRow.index}
									className="absolute left-0 top-0 w-full"
									style={{ transform: `translateY(${virtualRow.start}px)` }}
								>
									<ActivityRow
										activity={activity}
										isLast={virtualRow.index === items.length - 1}
									/>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

export function ActivityCard({ className }: { className?: string }) {
	const isOrgSwitching = useIsOrgSwitching();
	const feed = useQuery(api.activities.feed, {
		paginationOpts: { numItems: COMPACT_ITEMS, cursor: null },
	});

	const isLoading = isOrgSwitching || feed === undefined;
	const activities = (feed?.page ?? []) as ActivityWithUser[];

	return (
		<Frame className={cn("w-full", className)}>
			<FramePanel className="flex grow flex-col gap-4">
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-base font-semibold text-foreground">
						Recent activity
					</h3>
					<Sheet>
						<SheetTrigger
							render={
								<Button variant="ghost" size="sm" className="-me-2 shrink-0" />
							}
						>
							View all
							<ArrowRight className="ml-1 size-4" aria-hidden="true" />
						</SheetTrigger>
						<SheetContent
							side="right"
							className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
						>
							<SheetHeader className="px-5 py-4 text-left">
								<SheetTitle>Activity</SheetTitle>
								<SheetDescription>
									Everything that happened in your workspace, newest first.
								</SheetDescription>
							</SheetHeader>
							<ActivitySheet />
						</SheetContent>
					</Sheet>
				</div>

				{isLoading ? (
					<div className="space-y-4">
						{Array.from({ length: COMPACT_ITEMS }).map((_, i) => (
							<div key={i} className="flex items-start gap-3">
								<Skeleton className="size-8 shrink-0 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-3.5 w-3/4" />
									<Skeleton className="h-3 w-1/3" />
								</div>
							</div>
						))}
					</div>
				) : activities.length === 0 ? (
					<EmptyState
						illustration="activity-none"
						title="No recent activity"
						description="Activity will appear here as you work."
						className="min-h-[220px] justify-center"
					/>
				) : (
					<Timeline
						role="list"
						// value 0 = no completed steps: keeps the connector at the subtle tint
						value={0}
						className="px-1 py-1"
					>
						{activities.map((activity, index) => (
							<ActivityTimelineItem
								key={activity._id}
								activity={activity}
								step={index + 1}
							/>
						))}
					</Timeline>
				)}
			</FramePanel>
		</Frame>
	);
}
