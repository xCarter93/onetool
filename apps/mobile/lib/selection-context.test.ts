import { describe, expect, it } from "vitest";
import {
	sameRef,
	selectionReducer,
	type SelectionAction,
	type SelectionState,
} from "./selection-context";

// Pure unit test of the iPad selectionReducer. Locks the per-pane selection
// contract the master-detail panes depend on: independent panes, pane-switch
// persistence, {kind,id} refs, and reducer purity (no mutation).

const EMPTY: SelectionState = { work: null, money: null, activity: null };

describe("selectionReducer", () => {
	it("select('work', ref) sets work, leaves activity null", () => {
		const next = selectionReducer(EMPTY, {
			type: "select",
			tab: "work",
			value: { kind: "client", id: "c1" },
		});
		expect(next).toEqual({
			work: { kind: "client", id: "c1" },
			money: null,
			activity: null,
		});
	});

	it("keeps work + activity selections independent", () => {
		const afterActivity = selectionReducer(EMPTY, {
			type: "select",
			tab: "activity",
			value: { kind: "invoice", id: "i1" },
		});
		const afterWork = selectionReducer(afterActivity, {
			type: "select",
			tab: "work",
			value: { kind: "client", id: "c1" },
		});
		expect(afterWork).toEqual({
			work: { kind: "client", id: "c1" },
			money: null,
			activity: { kind: "invoice", id: "i1" },
		});
	});

	it("switching active pane does NOT clear the other pane's selection", () => {
		// Select in activity, then work, then re-select in work — the activity ref
		// must still be intact (pane-switch persistence, issue #11).
		let state = selectionReducer(EMPTY, {
			type: "select",
			tab: "activity",
			value: { kind: "quote", id: "q1" },
		});
		state = selectionReducer(state, {
			type: "select",
			tab: "work",
			value: { kind: "client", id: "c1" },
		});
		state = selectionReducer(state, {
			type: "select",
			tab: "work",
			value: { kind: "project", id: "p2" },
		});
		expect(state.activity).toEqual({ kind: "quote", id: "q1" });
		expect(state.work).toEqual({ kind: "project", id: "p2" });
	});

	it("clear('work') nulls work without touching activity", () => {
		const seeded: SelectionState = {
			work: { kind: "client", id: "c1" },
			money: null,
			activity: { kind: "project", id: "p1" },
		};
		const next = selectionReducer(seeded, { type: "clear", tab: "work" });
		expect(next).toEqual({
			work: null,
			money: null,
			activity: { kind: "project", id: "p1" },
		});
	});

	it("re-selecting a pane overwrites the whole ref, kind included", () => {
		// The pre-§6 shape had one slot per entity, so a quote and an invoice could
		// coexist. One Work slot means a later pick must fully replace the earlier
		// one — a stale `kind` would render the WRONG detail body.
		const afterQuote = selectionReducer(EMPTY, {
			type: "select",
			tab: "work",
			value: { kind: "quote", id: "q1" },
		});
		expect(afterQuote.work).toEqual({ kind: "quote", id: "q1" });

		const afterInvoice = selectionReducer(afterQuote, {
			type: "select",
			tab: "work",
			value: { kind: "invoice", id: "i1" },
		});
		expect(afterInvoice.work).toEqual({ kind: "invoice", id: "i1" });
	});

	it("is pure: does not mutate its input and returns a new reference", () => {
		const frozen = Object.freeze({
			work: null,
			money: null,
			activity: null,
		}) as SelectionState;
		const action: SelectionAction = {
			type: "select",
			tab: "work",
			value: { kind: "client", id: "c1" },
		};
		// Mutating a frozen object throws in strict mode — passing the assertion
		// proves the reducer never wrote to the input.
		const next = selectionReducer(frozen, action);
		expect(next).not.toBe(frozen);
		expect(frozen).toEqual({ work: null, money: null, activity: null });
	});
});

describe("sameRef", () => {
	it("matches structurally, not by reference", () => {
		// The list pane rebuilds row refs every render, so === would never hit and
		// the selected row would never highlight.
		expect(
			sameRef({ kind: "client", id: "c1" }, { kind: "client", id: "c1" }),
		).toBe(true);
	});

	it("distinguishes same id under a different kind", () => {
		// Convex ids are per-table, so a quote and an invoice CAN share an id string.
		expect(
			sameRef({ kind: "quote", id: "x1" }, { kind: "invoice", id: "x1" }),
		).toBe(false);
	});

	it("distinguishes different ids of the same kind", () => {
		expect(
			sameRef({ kind: "project", id: "p1" }, { kind: "project", id: "p2" }),
		).toBe(false);
	});

	it("is false when either side is null — nothing selected matches nothing", () => {
		expect(sameRef(null, { kind: "client", id: "c1" })).toBe(false);
		expect(sameRef({ kind: "client", id: "c1" }, null)).toBe(false);
		expect(sameRef(null, null)).toBe(false);
	});
});
