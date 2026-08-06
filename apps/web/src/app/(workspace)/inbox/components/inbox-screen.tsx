"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { filterThreads, type InboxFilter } from "../lib/inbox-utils";
import { ThreadList } from "./thread-list";
import { ThreadView, ThreadViewEmpty } from "./thread-view";
import { NewEmailDialog } from "./new-email-dialog";

interface InboxScreenProps {
	/** Deep link (e.g. from the home dashboard): thread to open on load. */
	initialThreadId?: string | null;
}

export function InboxScreen({ initialThreadId = null }: InboxScreenProps) {
	const [filter, setFilter] = useState<InboxFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedThreadId, setSelectedThreadId] =
		useState<Id<"emailThreads"> | null>(
			(initialThreadId as Id<"emailThreads"> | null) ?? null
		);
	const [composeOpen, setComposeOpen] = useState(false);
	// Per-thread reply drafts (TipTap HTML) so switching threads never loses
	// typed text. Session-only by design.
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	const threads = useQuery(api.emailThreads.listThreadsByOrg, { filter });

	// One derivation feeds both the rendered rows and the keyboard-nav order.
	const visibleThreads = useMemo(
		() => filterThreads(threads ?? [], searchQuery),
		[threads, searchQuery]
	);

	const selectedFromList = useMemo(
		() => threads?.find((t) => t.threadDocId === selectedThreadId) ?? null,
		[threads, selectedThreadId]
	);

	// Subscribe to the selected thread directly for the whole selection: when a
	// mutation evicts it from the active filter (mark-read under "Unread",
	// linking under "Unlinked"), this already-warm result keeps the pane open
	// with no flash and no render-time caching tricks.
	const fetchedThread = useQuery(
		api.emailThreads.getThread,
		selectedThreadId ? { threadDocId: selectedThreadId } : "skip"
	);
	const selectedThread = selectedFromList ?? fetchedThread ?? null;

	// A resolved-null direct fetch means the thread is genuinely gone
	// (deleted / inaccessible) — clear the selection so mobile isn't stuck on
	// an empty pane with the list hidden. Guarded render-time derivation: the
	// guard goes false as soon as the state updates, so this can't loop.
	if (selectedThreadId && !selectedFromList && fetchedThread === null) {
		setSelectedThreadId(null);
	}

	const handleDraftChange = useCallback(
		(threadId: Id<"emailThreads">, html: string) => {
			setDrafts((prev) => {
				if (html) return { ...prev, [threadId]: html };
				if (!(threadId in prev)) return prev;
				const next = { ...prev };
				delete next[threadId];
				return next;
			});
		},
		[]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (visibleThreads.length === 0) return;
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

			const currentIndex = visibleThreads.findIndex(
				(t) => t.threadDocId === selectedThreadId
			);

			if (e.key === "Enter") {
				if (currentIndex >= 0) e.preventDefault();
				return;
			}

			e.preventDefault();
			let nextIndex: number;
			if (currentIndex === -1) {
				nextIndex = e.key === "ArrowDown" ? 0 : visibleThreads.length - 1;
			} else {
				nextIndex =
					e.key === "ArrowDown"
						? Math.min(currentIndex + 1, visibleThreads.length - 1)
						: Math.max(currentIndex - 1, 0);
			}
			setSelectedThreadId(visibleThreads[nextIndex]!.threadDocId);
		},
		[visibleThreads, selectedThreadId]
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
					threads={visibleThreads}
					filter={filter}
					onFilterChange={setFilter}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					selectedThreadId={selectedThreadId}
					onSelect={setSelectedThreadId}
					onCompose={() => setComposeOpen(true)}
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
						draft={drafts[selectedThread.threadDocId] ?? ""}
						onDraftChange={(html) =>
							handleDraftChange(selectedThread.threadDocId, html)
						}
					/>
				) : (
					<ThreadViewEmpty />
				)}
			</section>

			<NewEmailDialog open={composeOpen} onOpenChange={setComposeOpen} />
		</div>
	);
}
