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
let rerunRequested = false;
// Bumped on reset so a fetch that was in flight at sign-out can't emit the
// previous user's tickets over the cleared state.
let generation = 0;

function emit(next: SupportTicketsState) {
	state = next;
	for (const listener of listeners) listener();
}

export function refreshSupportTickets(): Promise<void> {
	if (typeof window === "undefined") return Promise.resolve();
	if (inflight) {
		// Don't swallow a refresh that races an in-flight one — the identity
		// effect can land mid-fetch and its results must not be the stale
		// anonymous-session list. Re-run once the current fetch settles.
		rerunRequested = true;
		return inflight;
	}
	inflight = (async () => {
		do {
			rerunRequested = false;
			const startedGeneration = generation;
			// Keep the current list on screen while a manual refresh runs.
			emit({
				status: state.status === "ready" ? "ready" : "loading",
				tickets: state.tickets,
			});
			const available = await waitForSupportAvailable();
			if (generation !== startedGeneration) continue;
			if (!available) {
				emit({ status: "unavailable", tickets: [] });
				continue;
			}
			const tickets = await getSupportTickets();
			if (generation !== startedGeneration) continue;
			if (tickets === null) {
				emit({ status: "error", tickets: state.tickets });
			} else {
				emit({ status: "ready", tickets });
			}
		} while (rerunRequested);
	})().finally(() => {
		inflight = null;
	});
	return inflight;
}

/** Sign-out: drop the previous user's tickets. */
export function resetSupportTickets() {
	generation += 1;
	emit(INITIAL_STATE);
}

/** Test-only snapshot of the store state. */
export function supportTicketsSnapshot(): SupportTicketsState {
	return state;
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
