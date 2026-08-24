import posthog from "posthog-js";
import type { GetMessagesResponse, Ticket } from "posthog-js";

/**
 * PostHog Support (conversations) wrappers. The conversations module loads
 * async from remote config, so every call is null-guarded — the SDK returns
 * null/no-ops until available. The default floating widget stays disabled in
 * PostHog project settings; OneTool renders its own UI (/support + dialogs).
 */

export type SupportIntent = "contact" | "bug" | "feature";

/** D13: PostHog Workflows tag tickets by matching this first line. */
export const SUPPORT_INTENT_PREFIX: Record<SupportIntent, string> = {
	contact: "Support request",
	bug: "Bug report",
	feature: "Feature request",
};

/**
 * Server-verified ticket ownership (hash from api.support.getConversationsIdentity).
 * Survives posthog.reset() on sign-out and works cross-device.
 */
export function setSupportIdentity(distinctId: string, hash: string) {
	posthog.setIdentity(distinctId, hash);
}

export function clearSupportIdentity() {
	posthog.clearIdentity();
}

export function isSupportAvailable(): boolean {
	return posthog.conversations?.isAvailable() ?? false;
}

/** Poll until the conversations module is loaded; false when it never arrives (ad blocker). */
export function waitForSupportAvailable(timeoutMs = 10_000): Promise<boolean> {
	if (isSupportAvailable()) return Promise.resolve(true);
	return new Promise((resolve) => {
		const started = Date.now();
		const interval = window.setInterval(() => {
			if (isSupportAvailable()) {
				window.clearInterval(interval);
				resolve(true);
			} else if (Date.now() - started >= timeoutMs) {
				window.clearInterval(interval);
				resolve(false);
			}
		}, 250);
	});
}

/**
 * sendMessage has no ticket-id parameter — it posts to the manager's mutable
 * "current ticket" — so every operation that moves that pointer (getMessages,
 * sendMessage) runs through this chain. Without it, a getMessages landing
 * between a reply's retarget and its send would post the reply into the wrong
 * conversation.
 */
let conversationChain: Promise<unknown> = Promise.resolve();
function serialized<T>(op: () => Promise<T>): Promise<T> {
	const run = conversationChain.then(op, op);
	conversationChain = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

/**
 * Create a new ticket. Resolves to the ticket id, or null when conversations
 * are unavailable (ad blocker, disabled project, remote config not loaded) or
 * the send fails.
 */
export function sendSupportMessage(
	message: string,
	traits: { name?: string; email?: string }
): Promise<string | null> {
	return serialized(async () => {
		try {
			const response = await posthog.conversations?.sendMessage(
				message,
				traits,
				true
			);
			return response?.ticket_id ?? null;
		} catch {
			return null;
		}
	});
}

/** All of the user's tickets, newest activity first. */
export async function getSupportTickets(): Promise<Ticket[] | null> {
	try {
		const response = await posthog.conversations?.getTickets({ limit: 100 });
		if (!response) return null;
		return [...response.results].sort(
			(a, b) =>
				Date.parse(b.last_message_at ?? b.created_at) -
				Date.parse(a.last_message_at ?? a.created_at)
		);
	} catch {
		return null;
	}
}

export function getSupportMessages(
	ticketId: string
): Promise<GetMessagesResponse | null> {
	// getMessages switches the manager's current ticket — serialize it.
	return serialized(async () => {
		try {
			return (await posthog.conversations?.getMessages(ticketId)) ?? null;
		} catch {
			return null;
		}
	});
}

export async function markSupportTicketRead(ticketId: string): Promise<boolean> {
	try {
		const response = await posthog.conversations?.markAsRead(ticketId);
		return response?.success ?? false;
	} catch {
		return false;
	}
}

/**
 * Reply into an existing ticket: re-target via getMessages(ticketId) (the
 * documented way to switch the current ticket), then send — atomically, so no
 * other targeting call can move the pointer in between.
 */
export function replyToSupportTicket(
	ticketId: string,
	message: string,
	traits: { name?: string; email?: string }
): Promise<boolean> {
	return serialized(async () => {
		try {
			const conversations = posthog.conversations;
			if (!conversations) return false;
			if (conversations.getCurrentTicketId() !== ticketId) {
				await conversations.getMessages(ticketId);
			}
			const response = await conversations.sendMessage(message, traits, false);
			return response?.ticket_id === ticketId;
		} catch {
			return false;
		}
	});
}

/**
 * Per-browser ticket → intent map so the /support list can show intent icons
 * without fetching every thread. Best-effort: tickets created on another
 * device fall back to a generic label until their thread is opened.
 */
const INTENT_STORE_KEY = "onetool.supportTicketIntents";

export function recallTicketIntents(): Record<string, SupportIntent> {
	try {
		const raw = window.localStorage.getItem(INTENT_STORE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, SupportIntent>) : {};
	} catch {
		return {};
	}
}

export function rememberTicketIntent(ticketId: string, intent: SupportIntent) {
	try {
		window.localStorage.setItem(
			INTENT_STORE_KEY,
			JSON.stringify({ ...recallTicketIntents(), [ticketId]: intent })
		);
	} catch {
		// Storage unavailable — the list just shows the generic label.
	}
}

/** Recover the intent from a ticket's opening message (D13 prefix line). */
export function intentFromMessage(content: string): SupportIntent | null {
	const firstLine = content.trimStart().split("\n", 1)[0]?.trim() ?? "";
	for (const [intent, prefix] of Object.entries(SUPPORT_INTENT_PREFIX)) {
		if (firstLine === prefix) return intent as SupportIntent;
	}
	return null;
}
