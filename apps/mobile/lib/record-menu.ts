import type { WorkChipKind } from "@/lib/work-search";

// ============================================================================
// Work-tab long-press menu. Pure — no React, no RN — so the action list a
// record gets is unit-testable without mounting anything.
// ============================================================================

export type RecordMenuAction =
	| { type: "open"; label: string }
	| { type: "toggle-done"; label: string; done: boolean };

export type RecordMenuInput = {
	kind: WorkChipKind;
	/** Task rows only — current done state, overlay-aware. */
	done?: boolean;
};

/** The long-press menu for one Work row: "Open", plus the done toggle for tasks. */
export function buildRecordMenuActions(input: RecordMenuInput): RecordMenuAction[] {
	const actions: RecordMenuAction[] = [{ type: "open", label: "Open" }];

	if (input.kind === "task" && input.done !== undefined) {
		actions.push({
			type: "toggle-done",
			label: input.done ? "Mark not done" : "Mark done",
			done: input.done,
		});
	}

	return actions;
}
