import { useSyncExternalStore } from "react";
import type { Ticket } from "posthog-js";
import { getSupportTickets, waitForSupportAvailable } from "@/lib/support";

/**
 * Session-wide support ticket cache (V2-4): one getTickets fetch on workspace
 * load feeds both the "?" unread dot and the /support list — never polled.
 * Refreshed explicitly: identity set, page refresh button, after a send.
 */

export type SupportTicketsStatus =
	| "idle"
	| "loading"
	| "ready"
	| "unavailable"
	| "error";

export interface SupportTicketsState {
	status: SupportTicketsStatus;
	tickets: Ticket[];
}

const INITIAL_STATE: SupportTicketsState = { status: "idle", tickets: [] };

let state: SupportTicketsState = INITIAL_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: SupportTicketsState) {
	state = next;
	for (const listener of listeners) listener();
}

export function refreshSupportTickets(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	if (inflight) return inflight;
	inflight = (async () => {
		// Keep the current list on screen while a manual refresh runs.
		emit({
			status: state.status === "ready" ? "ready" : "loading",
			tickets: state.tickets,
		});
		const available = await waitForSupportAvailable();
		if (!available) {
			emit({ status: "unavailable", tickets: [] });
			return;
		}
		const tickets = await getSupportTickets();
		if (tickets === null) {
			emit({ status: "error", tickets: state.tickets });
		} else {
			emit({ status: "ready", tickets });
		}
	})().finally(() => {
		inflight = null;
	});
	return inflight;
}

/** Sign-out: drop the previous user's tickets. */
export function resetSupportTickets() {
	emit(INITIAL_STATE);
}

/** Reflect a markAsRead immediately without a refetch. */
export function markTicketReadLocally(ticketId: string) {
	if (!state.tickets.some((t) => t.id === ticketId && (t.unread_count ?? 0) > 0)) {
		return;
	}
	emit({
		status: state.status,
		tickets: state.tickets.map((t) =>
			t.id === ticketId ? { ...t, unread_count: 0 } : t
		),
	});
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useSupportTickets(): SupportTicketsState {
	return useSyncExternalStore(
		subscribe,
		() => state,
		() => INITIAL_STATE
	);
}

/** Tickets with unread team replies (resolved included — a reply is a reply). */
export function supportUnreadCount(tickets: Ticket[]): number {
	return tickets.filter((t) => (t.unread_count ?? 0) > 0).length;
}
