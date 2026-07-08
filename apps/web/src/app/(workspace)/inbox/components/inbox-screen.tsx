"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { buildInboxView, type InboxFilter } from "../lib/inbox-utils";
import { ThreadList } from "./thread-list";
import { ThreadView, ThreadViewEmpty } from "./thread-view";

export function InboxScreen() {
	const [filter, setFilter] = useState<InboxFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		() => new Set()
	);
	const [selectedThreadId, setSelectedThreadId] =
		useState<Id<"emailThreads"> | null>(null);

	const threads = useQuery(api.emailThreads.listThreadsByOrg, { filter });

	// Groups collapse by default; search + collapse + the visible row order for
	// keyboard nav all come from one derivation so they never drift apart.
	const { groups, orderedThreads } = useMemo(
		() =>
			buildInboxView(threads ?? [], {
				query: searchQuery,
				expandedGroups,
				selectedThreadId,
			}),
		[threads, searchQuery, expandedGroups, selectedThreadId]
	);

	const toggleGroup = useCallback((key: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const selectedFromList = useMemo(
		() => threads?.find((t) => t.threadDocId === selectedThreadId) ?? null,
		[threads, selectedThreadId]
	);

	// Keep the open thread rendered even when a mutation drops it out of the
	// active filter (mark-read evicts it from "Unread", linking from
	// "Unlinked") — the thread the user just opened must not close itself.
	const fallbackThread = useQuery(
		api.emailThreads.getThread,
		selectedThreadId && threads && !selectedFromList
			? { threadDocId: selectedThreadId }
			: "skip"
	);
	// Hold the last resolved thread so the pane doesn't flash empty for the
	// frames while the fallback query loads right after a filter eviction.
	const lastSelectedRef = useRef<typeof selectedFromList>(null);
	const resolvedThread = selectedFromList ?? fallbackThread ?? null;
	if (resolvedThread && resolvedThread.threadDocId === selectedThreadId) {
		lastSelectedRef.current = resolvedThread;
	}
	const selectedThread =
		resolvedThread ??
		(fallbackThread === undefined &&
		lastSelectedRef.current?.threadDocId === selectedThreadId
			? lastSelectedRef.current
			: null);

	// A completed fallback returning null means the thread is genuinely gone
	// (deleted / inaccessible) — clear the selection so mobile isn't stuck on
	// an empty pane with the list hidden.
	useEffect(() => {
		if (selectedThreadId && !selectedFromList && fallbackThread === null) {
			setSelectedThreadId(null);
		}
	}, [selectedThreadId, selectedFromList, fallbackThread]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (orderedThreads.length === 0) return;
			if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") {
				return;
			}
			// Don't hijack typing in the composer or client search.
			const target = e.target as HTMLElement;
			if (
				target.tagName === "TEXTAREA" ||
				target.tagName === "INPUT" ||
				target.isContentEditable
			) {
				return;
			}

			const currentIndex = orderedThreads.findIndex(
				(t) => t.threadDocId === selectedThreadId
			);

			if (e.key === "Enter") {
				if (currentIndex >= 0) e.preventDefault();
				return;
			}

			e.preventDefault();
			let nextIndex: number;
			if (currentIndex === -1) {
				nextIndex = e.key === "ArrowDown" ? 0 : orderedThreads.length - 1;
			} else {
				nextIndex =
					e.key === "ArrowDown"
						? Math.min(currentIndex + 1, orderedThreads.length - 1)
						: Math.max(currentIndex - 1, 0);
			}
			setSelectedThreadId(orderedThreads[nextIndex]!.threadDocId);
		},
		[orderedThreads, selectedThreadId]
	);

	const hasSelection = selectedThreadId !== null;

	return (
		<div
			// Inset the panes so they clear the floating chrome: the top notch rail
			// (status badge + notifications/settings) and the bottom Assistant notch
			// (fixed, h-10 / 40px, bottom-right). pb-12 keeps the composer above it.
			className="flex h-full min-h-0 gap-3 overflow-hidden px-3 pb-12 pt-3 md:pt-10"
			onKeyDown={handleKeyDown}
		>
			<aside
				className={cn(
					"w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex md:w-[340px] md:shrink-0",
					"min-h-0",
					hasSelection ? "hidden md:flex" : "flex"
				)}
			>
				<ThreadList
					loading={threads === undefined}
					groups={groups}
					filter={filter}
					onFilterChange={setFilter}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					selectedThreadId={selectedThreadId}
					onSelect={setSelectedThreadId}
					onToggleGroup={toggleGroup}
				/>
			</aside>

			<section
				className={cn(
					"min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex",
					"min-h-0",
					hasSelection ? "flex" : "hidden md:flex"
				)}
			>
				{selectedThread ? (
					<ThreadView
						key={selectedThread.threadDocId}
						thread={selectedThread}
						onBack={() => setSelectedThreadId(null)}
						onArchived={() => setSelectedThreadId(null)}
					/>
				) : (
					<ThreadViewEmpty />
				)}
			</section>
		</div>
	);
}
