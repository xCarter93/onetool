import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: sendMessage posts to the conversations manager's mutable
 * "current ticket". A getMessages for another ticket must not be able to
 * retarget the manager between a reply's own retarget and its send.
 */

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const gate = { current: deferred<void>() };
const events: string[] = [];

const conversations = {
	current: null as string | null,
	isAvailable: () => true,
	getCurrentTicketId: () => conversations.current,
	getMessages: vi.fn(async (ticketId: string) => {
		events.push(`get:${ticketId}`);
		await gate.current.promise;
		conversations.current = ticketId;
		return { results: [] };
	}),
	sendMessage: vi.fn(async () => {
		events.push(`send@${conversations.current}`);
		return { ticket_id: conversations.current };
	}),
};

vi.mock("posthog-js", () => ({ default: { conversations } }));

async function loadSupport() {
	vi.resetModules();
	return import("./support");
}

describe("conversation targeting serialization", () => {
	beforeEach(() => {
		conversations.current = null;
		events.length = 0;
		gate.current = deferred<void>();
		conversations.getMessages.mockClear();
		conversations.sendMessage.mockClear();
	});

	it("a concurrent getSupportMessages cannot retarget an in-flight reply", async () => {
		const support = await loadSupport();

		const reply = support.replyToSupportTicket("A", "hi", {});
		// Fires while reply's retarget is still awaiting the gate.
		const load = support.getSupportMessages("B");
		await Promise.resolve();
		gate.current.resolve();

		expect(await reply).toBe(true);
		await load;
		// The reply's retarget + send completed before B's load ran.
		expect(events).toEqual(["get:A", "send@A", "get:B"]);
	});

	it("a reply queued behind a new-ticket send still targets its own ticket", async () => {
		const support = await loadSupport();
		gate.current.resolve();

		conversations.current = "new-ticket";
		const created = support.sendSupportMessage("new", {});
		const reply = support.replyToSupportTicket("A", "hi", {});

		expect(await created).toBe("new-ticket");
		expect(await reply).toBe(true);
		expect(events).toEqual(["send@new-ticket", "get:A", "send@A"]);
	});
});
