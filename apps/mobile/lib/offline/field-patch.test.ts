import { describe, expect, it } from "vitest";
import { buildFieldPatch, overlayFields, planTaskUpdate, overlayTaskOps } from "./field-patch";
import type { StoredOp } from "./db";

describe("buildFieldPatch", () => {
	it("includes only fields that changed", () => {
		const loaded = { title: "Mow lawn", description: "front yard", status: "pending" };
		const edited = { title: "Mow lawn", description: "back yard", status: "pending" };
		const { patch, expectedValues } = buildFieldPatch(loaded, edited);
		expect(patch).toEqual({ description: "back yard" });
		expect(expectedValues).toEqual({ description: "front yard" });
	});

	it("expects null for a field that was unset, so the check survives JSON", () => {
		const loaded: { title: string; description?: string } = { title: "Mow lawn" };
		const { expectedValues } = buildFieldPatch(loaded, { description: "back yard" });
		expect(JSON.parse(JSON.stringify(expectedValues))).toEqual({ description: null });
	});

	it("treats undefined and null as equal, so clearing a field is not a false negative", () => {
		const loaded = { description: null as string | null };
		const edited = { description: undefined };
		expect(buildFieldPatch(loaded, edited).patch).toEqual({});
	});

	it("returns an empty patch when nothing changed", () => {
		const loaded = { title: "Mow lawn" };
		expect(buildFieldPatch(loaded, { title: "Mow lawn" }).patch).toEqual({});
	});
});

describe("planTaskUpdate", () => {
	it("routes a completing status change to tasks.complete alone", () => {
		const plan = planTaskUpdate({ status: "pending", title: "Mow lawn" }, { status: "completed", title: "Mow lawn" });
		expect(plan.completeOp).toBe(true);
		expect(plan.patch).toEqual({});
		expect(plan.expectedValues).toEqual({});
	});

	it("splits a completing status change from other field edits", () => {
		const plan = planTaskUpdate(
			{ status: "pending", title: "Mow lawn" },
			{ status: "completed", title: "Mow lawn and edge" },
		);
		expect(plan.completeOp).toBe(true);
		expect(plan.patch).toEqual({ title: "Mow lawn and edge" });
		expect(plan.expectedValues).toEqual({ title: "Mow lawn" });
	});

	it("does not special-case a status edit that isn't a completion", () => {
		const plan = planTaskUpdate({ status: "pending" }, { status: "in-progress" });
		expect(plan.completeOp).toBe(false);
		expect(plan.patch).toEqual({ status: "in-progress" });
	});

	it("does not re-trigger completeOp when already completed", () => {
		const plan = planTaskUpdate({ status: "completed", title: "Mow lawn" }, { status: "completed", title: "Mow lawn v2" });
		expect(plan.completeOp).toBe(false);
		expect(plan.patch).toEqual({ title: "Mow lawn v2" });
	});
});

function op(args: unknown): Pick<StoredOp, "args"> {
	return { args };
}

describe("overlayFields", () => {
	it("applies a pending patch's fields onto the base record", () => {
		const base = { title: "Mow lawn", description: "front yard", status: "pending" };
		const result = overlayFields(base, [op({ id: "t1", title: "Mow lawn (updated)" })]);
		expect(result).toEqual({ title: "Mow lawn (updated)", description: "front yard", status: "pending" });
	});

	it("applies multiple ops in order, later ops winning", () => {
		const base = { title: "A" };
		const result = overlayFields(base, [op({ id: "t1", title: "B" }), op({ id: "t1", title: "C" })]);
		expect(result.title).toBe("C");
	});

	it("sets an optional field the loaded record didn't have yet", () => {
		const base: { title: string; description?: string } = { title: "A" };
		const result = overlayFields(base, [op({ id: "t1", description: "gate code 4412" })]);
		expect(result).toEqual({ title: "A", description: "gate code 4412" });
	});

	it("skips id/expectedValues/idempotencyKey", () => {
		const base = { id: "orig", title: "A" };
		const result = overlayFields(base, [
			op({ id: "t1", title: "B", expectedValues: { title: "A" }, idempotencyKey: "k" }),
		]);
		expect(result).toEqual({ id: "orig", title: "B" });
	});

	it("returns the base unchanged when there are no ops", () => {
		const base = { title: "A" };
		expect(overlayFields(base, [])).toBe(base);
	});
});

describe("overlayTaskOps", () => {
	it("uses the queued status as the base for a later edit", () => {
		const base = { title: "Mow", status: "pending" };
		const ops = [
			{ operation: "tasks.complete", args: { id: "t1" } },
			{ operation: "tasks.update", args: { id: "t1", title: "Mow lawn", expectedValues: { title: "Mow" } } },
		];
		expect(overlayTaskOps(base, ops)).toEqual({ title: "Mow lawn", status: "completed" });
	});
});

describe("buildFieldPatch clears", () => {
	it("skips cleared optional fields instead of queuing an empty patch", () => {
		expect(buildFieldPatch({ description: "old" }, { description: undefined })).toEqual({
			patch: {},
			expectedValues: {},
		});
	});
});
