import type { StoredOp } from "./db";

// Backend's assertExpectedValues compares undefined and null as equal, and null survives the queue's JSON round-trip.
export function expectedValue(value: unknown): unknown {
	return value === undefined ? null : value;
}

function equal(a: unknown, b: unknown): boolean {
	return JSON.stringify(expectedValue(a)) === JSON.stringify(expectedValue(b));
}

export type FieldPatch<T extends Record<string, unknown>> = {
	patch: Partial<T>;
	expectedValues: Partial<T>;
};

/** Only the fields that actually changed, plus their as-loaded values for `expectedValues`. */
export function buildFieldPatch<T extends Record<string, unknown>>(
	loaded: T,
	edited: Partial<T>,
): FieldPatch<T> {
	const patch: Partial<T> = {};
	const expectedValues: Partial<T> = {};
	for (const key of Object.keys(edited) as (keyof T)[]) {
		// Convex drops undefined args, so a cleared optional field can't travel; same as online.
		if (edited[key] === undefined) continue;
		if (!equal(edited[key], loaded[key])) {
			patch[key] = edited[key];
			expectedValues[key] = expectedValue(loaded[key]) as T[keyof T];
		}
	}
	return { patch, expectedValues };
}

export type TaskSavePlan<T extends Record<string, unknown>> = {
	/** True when this save transitions status into "completed" — queue as `tasks.complete`. */
	completeOp: boolean;
	patch: Partial<T>;
	expectedValues: Partial<T>;
};

/**
 * Task edit save splits a completing status change onto `tasks.complete`
 * (server marks route stops, emits events) — any other changed fields still
 * go through `tasks.update` in the same save.
 */
export function planTaskUpdate<T extends { status?: unknown }>(
	loaded: T,
	edited: Partial<T>,
): TaskSavePlan<T> {
	const { patch, expectedValues } = buildFieldPatch(loaded, edited);
	const completing = patch.status === "completed" && loaded.status !== "completed";
	if (!completing) return { completeOp: false, patch, expectedValues };
	const { status: _s, ...restPatch } = patch;
	const { status: _es, ...restExpected } = expectedValues;
	return { completeOp: true, patch: restPatch as Partial<T>, expectedValues: restExpected as Partial<T> };
}

const OVERLAY_SKIP_KEYS = new Set(["id", "expectedValues", "idempotencyKey"]);

type OverlayOp = Pick<StoredOp, "args"> & Partial<Pick<StoredOp, "status">>;

// The server rejected these; showing their values would read as saved.
function rejected(op: OverlayOp): boolean {
	return op.status === "failed" || op.status === "conflict";
}

/**
 * Merges pending field-patch ops onto a loaded record so the detail screen
 * shows the edited value while the write is still in the outbox. Ops apply
 * oldest-first, skip ones the server rejected, and may set optional fields the loaded record doesn't have yet.
 */
export function overlayFields<T extends Record<string, unknown>>(
	base: T,
	ops: OverlayOp[],
): T {
	let result = base;
	for (const op of ops) {
		if (rejected(op)) continue;
		const args = op.args as Record<string, unknown> | null | undefined;
		if (!args || typeof args !== "object") continue;
		for (const key of Object.keys(args)) {
			if (OVERLAY_SKIP_KEYS.has(key)) continue;
			const value = args[key];
			if (result[key] === value) continue;
			result = { ...result, [key]: value };
		}
	}
	return result;
}

/** Task view with queued ops applied: `tasks.complete` sets status, updates overlay their fields. */
export function overlayTaskOps<T extends Record<string, unknown>>(
	base: T,
	ops: (OverlayOp & Pick<StoredOp, "operation">)[],
): T {
	let result = base;
	for (const op of ops) {
		if (rejected(op)) continue;
		result =
			op.operation === "tasks.complete"
				? { ...result, status: "completed" }
				: overlayFields(result, [op]);
	}
	return result;
}
