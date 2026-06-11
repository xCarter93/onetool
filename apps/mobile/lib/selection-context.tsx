import React, { createContext, useContext, useReducer } from "react";

// Per-tab iPad selection state. Held here (not in the route) so a selected
// detail id survives device rotation (RESP-03). Mounted BELOW the Convex
// key={convexKey} boundary (inside the iPad branch of (tabs)/_layout.tsx) so an
// org switch remounts this provider and resets selection (T-26-04).
//
// Tab-switch policy (deterministic, issue #11): switching activeTab does NOT
// clear another tab's stored id. Each tab's selection is independent and
// PERSISTS until explicitly cleared, so returning to a tab restores its last
// selection — matching rotation continuity. Only select()/clear() mutate state.

export type SelectionTab = "clients" | "projects" | "money";

export type MoneySelection = { kind: "quote" | "invoice"; id: string };

export type SelectionState = {
	clients: string | null;
	projects: string | null;
	money: MoneySelection | null;
};

const initialState: SelectionState = {
	clients: null,
	projects: null,
	money: null,
};

// Discriminated action union — clients/projects carry a bare id, money carries
// the {kind,id} pair so the host can route to the quote vs invoice body.
export type SelectionAction =
	| { type: "select"; tab: "clients"; value: string }
	| { type: "select"; tab: "projects"; value: string }
	| { type: "select"; tab: "money"; value: MoneySelection }
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

// Typed select() overloads keep the money {kind,id} asymmetry honest at callsites.
interface SelectionContextValue {
	state: SelectionState;
	select: {
		(tab: "clients", value: string): void;
		(tab: "projects", value: string): void;
		(tab: "money", value: MoneySelection): void;
	};
	clear: (tab: SelectionTab) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(selectionReducer, initialState);

	const select = ((tab: SelectionTab, value: string | MoneySelection) => {
		dispatch({ type: "select", tab, value } as SelectionAction);
	}) as SelectionContextValue["select"];

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
