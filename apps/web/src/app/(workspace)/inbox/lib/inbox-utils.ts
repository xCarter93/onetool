import type { FunctionReturnType } from "convex/server";
import { api } from "@onetool/backend/convex/_generated/api";

// Derived from the generated API so we don't depend on the emailThreads module
// being present in the backend package's exports map.
export type InboxThread = FunctionReturnType<
	typeof api.emailThreads.listThreadsByOrg
>[number];

export type InboxFilter = "all" | "unread" | "unlinked";

/**
 * Flat newest-first list: apply the search query across contact name, client
 * name, and subject. The backend already returns threads newest-first; order
 * is preserved so the visible rows double as the keyboard-nav order.
 */
export function filterThreads(
	threads: InboxThread[],
	query: string
): InboxThread[] {
	const q = query.trim().toLowerCase();
	if (!q) return threads;
	return threads.filter(
		(t) =>
			(t.contact?.name?.toLowerCase().includes(q) ?? false) ||
			(t.contact?.email?.toLowerCase().includes(q) ?? false) ||
			(t.clientName?.toLowerCase().includes(q) ?? false) ||
			(t.subject ?? "").toLowerCase().includes(q)
	);
}

/** Build up-to-two-letter initials from a display name. */
export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
