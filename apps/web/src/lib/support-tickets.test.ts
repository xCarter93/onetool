import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "posthog-js";

const waitForSupportAvailable = vi.fn<() => Promise<boolean>>();
const getSupportTickets = vi.fn<() => Promise<Ticket[] | null>>();

vi.mock("@/lib/support", () => ({
	waitForSupportAvailable: () => waitForSupportAvailable(),
	getSupportTickets: () => getSupportTickets(),
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const TICKET = { id: "t1", unread_count: 1 } as unknown as Ticket;

async function loadStore() {
	vi.resetModules();
	return import("./support-tickets");
}

describe("support-tickets store", () => {
	beforeEach(() => {
		// The store no-ops without a window (edge-runtime has none).
		vi.stubGlobal("window", {});
		waitForSupportAvailable.mockReset();
		getSupportTickets.mockReset();
	});

	it("populates tickets on refresh", async () => {
		const store = await loadStore();
		waitForSupportAvailable.mockResolvedValue(true);
		getSupportTickets.mockResolvedValue([TICKET]);

		await store.refreshSupportTickets();

		expect(store.supportTicketsSnapshot()).toEqual({
			status: "ready",
			tickets: [TICKET],
		});
	});

	it("discards a fetch that was in flight when reset happens (sign-out)", async () => {
		const store = await loadStore();
		waitForSupportAvailable.mockResolvedValue(true);
		const fetch = deferred<Ticket[] | null>();
		getSupportTickets.mockReturnValue(fetch.promise);

		const refresh = store.refreshSupportTickets();
		// Let the loop reach the getSupportTickets await before resetting.
		await Promise.resolve();
		store.resetSupportTickets();
		fetch.resolve([TICKET]);
		await refresh;

		expect(store.supportTicketsSnapshot()).toEqual({
			status: "idle",
			tickets: [],
		});
	});
});
