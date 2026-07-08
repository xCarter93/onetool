import type { FunctionReturnType } from "convex/server";
import { api } from "@onetool/backend/convex/_generated/api";

// Derived from the generated API so we don't depend on the emailThreads module
// being present in the backend package's exports map.
export type InboxThread = FunctionReturnType<
	typeof api.emailThreads.listThreadsByOrg
>[number];

export type InboxFilter = "all" | "unread" | "unlinked";

/** A contact-keyed group of threads, sorted newest-first within the group. */
export interface ThreadGroup {
	key: string;
	contactName: string;
	clientName: string | null;
	threads: InboxThread[];
	unreadCount: number;
	lastMessageAt: number;
}

/** Stable group key: contactId, else email, else a sentinel. */
export function groupKey(thread: InboxThread): string {
	return thread.contact?.contactId ?? thread.contact?.email ?? "unknown";
}

/**
 * Group threads by contact, sorting threads within a group by recency and the
 * groups themselves by their most-recent thread. Preserves a flattened order
 * for keyboard navigation.
 */
export function groupThreadsByContact(threads: InboxThread[]): ThreadGroup[] {
	const map = new Map<string, ThreadGroup>();

	for (const thread of threads) {
		const key = groupKey(thread);
		const existing = map.get(key);
		if (existing) {
			existing.threads.push(thread);
			existing.unreadCount += thread.unreadCount;
			existing.lastMessageAt = Math.max(
				existing.lastMessageAt,
				thread.lastMessageAt
			);
		} else {
			map.set(key, {
				key,
				contactName: thread.contact?.name?.trim() || "Unknown sender",
				clientName: thread.clientName,
				threads: [thread],
				unreadCount: thread.unreadCount,
				lastMessageAt: thread.lastMessageAt,
			});
		}
	}

	const groups = Array.from(map.values());
	for (const group of groups) {
		group.threads.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
	}
	groups.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
	return groups;
}

/** Flatten grouped threads into the visible top-to-bottom row order. */
export function flattenGroups(groups: ThreadGroup[]): InboxThread[] {
	return groups.flatMap((group) => group.threads);
}

/** A group augmented with its resolved expanded/collapsed state for rendering. */
export interface DisplayGroup extends ThreadGroup {
	expanded: boolean;
}

export interface InboxView {
	groups: DisplayGroup[];
	/** Only threads inside currently-expanded groups, in visible order. */
	orderedThreads: InboxThread[];
	/** Total threads matching the search across all shown groups. */
	totalMatches: number;
}

/**
 * Single source of truth for the left rail: applies the search query (matching
 * contact/client name → whole group, else thread subject → matching threads),
 * resolves each group's expanded state (searching force-expands; a group holding
 * the selected thread stays open; otherwise the manual toggle set decides), and
 * emits the flattened visible-thread order for keyboard navigation.
 */
export function buildInboxView(
	threads: InboxThread[],
	opts: {
		query: string;
		expandedGroups: Set<string>;
		selectedThreadId: string | null;
	}
): InboxView {
	const q = opts.query.trim().toLowerCase();
	const searching = q.length > 0;
	const base = groupThreadsByContact(threads);
	const groups: DisplayGroup[] = [];
	const orderedThreads: InboxThread[] = [];
	let totalMatches = 0;

	for (const group of base) {
		const nameMatch =
			searching &&
			(group.contactName.toLowerCase().includes(q) ||
				(group.clientName?.toLowerCase().includes(q) ?? false));

		let groupThreads = group.threads;
		if (searching && !nameMatch) {
			groupThreads = group.threads.filter((t) =>
				(t.subject ?? "").toLowerCase().includes(q)
			);
			if (groupThreads.length === 0) continue;
		}

		const unreadCount = groupThreads.reduce((n, t) => n + t.unreadCount, 0);
		const expanded =
			searching ||
			opts.expandedGroups.has(group.key) ||
			groupThreads.some((t) => t.threadDocId === opts.selectedThreadId);

		groups.push({ ...group, threads: groupThreads, unreadCount, expanded });
		totalMatches += groupThreads.length;
		if (expanded) orderedThreads.push(...groupThreads);
	}

	return { groups, orderedThreads, totalMatches };
}

/** Build up-to-two-letter initials from a display name. */
export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
