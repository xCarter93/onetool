import { describe, expect, it, vi } from "vitest";

let inFlight = 0;

vi.mock("expo-sqlite", () => {
	const conn = {
		execSync: () => {},
		getFirstSync: () => ({ user_version: 1 }),
		async withExclusiveTransactionAsync(task: (txn: unknown) => Promise<void>) {
			// Mirrors SQLite with busy_timeout 0: a second writer connection fails instead of waiting.
			if (inFlight > 0) throw new Error("database is locked");
			inFlight++;
			try {
				await task({ runAsync: () => new Promise((r) => setTimeout(r, 5)) });
			} finally {
				inFlight--;
			}
		},
	};
	return { openDatabaseSync: () => conn };
});

describe("db writes", () => {
	it("serializes concurrent write transactions instead of racing for the lock", async () => {
		const { writeCache } = await import("./db");
		const writes = Array.from({ length: 10 }, (_, i) => writeCache("p", `k${i}`, { i }, i));
		await expect(Promise.all(writes)).resolves.toBeDefined();
	});
});
