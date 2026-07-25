import React, { createContext, useContext, useReducer } from "react";
import type { WorkKind } from "@/lib/work-search";

// Per-pane iPad selection state. Held here (not in the route) so a selected
// detail id survives device rotation (RESP-03). Mounted BELOW the Convex
// key={convexKey} boundary (inside the iPad branch of (tabs)/_layout.tsx) so an
// org switch remounts this provider and resets selection (T-26-04).
//
// SHAPE CHANGE (§6 iPad IA): selection used to be keyed by ENTITY — one slot per
// `clients`/`projects`/`money` rail tab. That only worked while each entity owned
// a tab. The rail now mirrors the iPhone tabs, which are MODES, and a single Work
// tab holds all four record kinds. So a slot is keyed by the *pane that owns a
// detail view* and carries the record's kind alongside its id. Money's old
// {kind,id} asymmetry is gone — every ref is a {kind,id} pair now, which is also
// exactly what `lib/work-search.ts` already models.
//
// Tab-switch policy (deterministic, issue #11) is UNCHANGED: switching panes does
// NOT clear another pane's ref. Work and Activity are independent and PERSIST
// until explicitly cleared, so returning to a pane restores its last selection —
// matching rotation continuity. Only select()/clear() mutate state.

/** A record open in a detail pane. `kind` picks the detail body, `id` the record. */
export type RecordRef = { kind: WorkKind; id: string };

/** Panes that own a detail view. Today and Routes have none. */
export type SelectionTab = "work" | "activity";

export type SelectionState = Record<SelectionTab, RecordRef | null>;

const initialState: SelectionState = {
	work: null,
	activity: null,
};

export type SelectionAction =
	| { type: "select"; tab: SelectionTab; value: RecordRef }
	| { type: "clear"; tab: SelectionTab };

// Named + exported pure reducer so 26-02's unit test can import it directly.
export function selectionReducer(
	state: SelectionState,
	action: SelectionAction,
): SelectionState {
	switch (action.type) {
		case "select":
			return { ...state, [action.tab]: action.value };
		case "clear":
			return { ...state, [action.tab]: null };
		default:
			return state;
	}
}

interface SelectionContextValue {
	state: SelectionState;
	select: (tab: SelectionTab, value: RecordRef) => void;
	clear: (tab: SelectionTab) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(selectionReducer, initialState);

	const select = (tab: SelectionTab, value: RecordRef) =>
		dispatch({ type: "select", tab, value });

	const clear = (tab: SelectionTab) => dispatch({ type: "clear", tab });

	return (
		<SelectionContext.Provider value={{ state, select, clear }}>
			{children}
		</SelectionContext.Provider>
	);
}

export function useSelection(): SelectionContextValue {
	const ctx = useContext(SelectionContext);
	if (!ctx) {
		throw new Error("useSelection must be used within a SelectionProvider");
	}
	return ctx;
}

/** Same record? Drives the list-pane selected-row highlight, where comparing two
 * {kind,id} objects by reference would never match a freshly-built list row. */
export function sameRef(a: RecordRef | null, b: RecordRef | null): boolean {
	if (!a || !b) return false;
	return a.kind === b.kind && a.id === b.id;
}
