import { describe, expect, it } from "vitest";
import { buildRecordMenuActions } from "@/lib/record-menu";

describe("buildRecordMenuActions", () => {
	it("gives a client with no contact info just Open", () => {
		const actions = buildRecordMenuActions({ kind: "client" });
		expect(actions.map((a) => a.type)).toEqual(["open"]);
	});

	it("appends a task-only toggle labelled by the current done state", () => {
		expect(
			buildRecordMenuActions({ kind: "task", done: false }).at(-1),
		).toMatchObject({ type: "toggle-done", label: "Mark done", done: false });
		expect(
			buildRecordMenuActions({ kind: "task", done: true }).at(-1),
		).toMatchObject({ type: "toggle-done", label: "Mark not done", done: true });
	});

	it("never adds the toggle for a non-task kind, even if done is set", () => {
		const actions = buildRecordMenuActions({ kind: "client", done: false });
		expect(actions.some((a) => a.type === "toggle-done")).toBe(false);
	});

	it("omits the toggle when a task's done state hasn't resolved yet", () => {
		// Regression: a recents-list task row carries no status at all — must not
		// default to "not done" and offer a toggle that's guessing.
		const actions = buildRecordMenuActions({ kind: "task", done: undefined });
		expect(actions.some((a) => a.type === "toggle-done")).toBe(false);
	});
});
