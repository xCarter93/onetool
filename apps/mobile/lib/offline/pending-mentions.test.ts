import { describe, expect, it } from "vitest";
import { pendingMentions } from "./pending-mentions";
import type { StoredOp } from "./db";

function op(id: number, args: unknown, capturedAt = 1000): Pick<StoredOp, "id" | "args" | "capturedAt"> {
	return { id, args, capturedAt };
}

describe("pendingMentions", () => {
	it("shapes a queued mention as a not-yet-sent feed row", () => {
		const items = pendingMentions([op(1, { message: "On my way", entityType: "project", entityId: "p1" })], "Sam");
		expect(items).toEqual([
			{
				_id: "pending-1",
				message: "On my way",
				createdAt: 1000,
				authorType: "user",
				authorName: "Sam",
				hasAttachments: false,
				pending: true,
			},
		]);
	});

	it("preserves op order across multiple pending mentions", () => {
		const items = pendingMentions(
			[op(1, { message: "First" }, 1000), op(2, { message: "Second" }, 2000)],
			"Sam",
		);
		expect(items.map((i) => i.message)).toEqual(["First", "Second"]);
	});

	it("skips an op with no message field", () => {
		const items = pendingMentions([op(1, { entityType: "project" })], "Sam");
		expect(items).toEqual([]);
	});

	it("returns an empty list for no ops", () => {
		expect(pendingMentions([], "Sam")).toEqual([]);
	});
});
