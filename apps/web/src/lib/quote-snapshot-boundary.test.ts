import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../packages/backend/convex/eventBus", () => {
	throw new Error("The browser quote snapshot imported server event mutations");
});

describe("browser quote snapshot boundary", () => {
	it("loads quote snapshot helpers without evaluating server mutations", async () => {
		const snapshot = await import("@onetool/backend/convex/lib/quoteContentSnapshot");
		expect(snapshot.buildQuoteContentSnapshot).toBeTypeOf("function");
		expect(snapshot.quoteContentSnapshotValidator).toBeDefined();
	});
});
