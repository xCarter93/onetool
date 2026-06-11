import { describe, expect, it } from "vitest";
import {
	selectionReducer,
	type SelectionAction,
	type SelectionState,
} from "./selection-context";

// Pure unit test of the 26-01 selectionReducer. Locks the per-tab selection
// contract the iPad master-detail panes (26-02/03) depend on: independent tabs,
// tab-switch persistence, money {kind,id}, and reducer purity (no mutation).

const EMPTY: SelectionState = { clients: null, projects: null, money: null };

describe("selectionReducer", () => {
	it("select('clients', id) sets clients, leaves projects/money null", () => {
		const next = selectionReducer(EMPTY, {
			type: "select",
			tab: "clients",
			value: "c1",
		});
		expect(next).toEqual({ clients: "c1", projects: null, money: null });
	});

	it("keeps clients + projects selections independent", () => {
		const afterProject = selectionReducer(EMPTY, {
			type: "select",
			tab: "projects",
			value: "p1",
		});
		const afterClient = selectionReducer(afterProject, {
			type: "select",
			tab: "clients",
			value: "c1",
		});
		expect(afterClient).toEqual({
			clients: "c1",
			projects: "p1",
			money: null,
		});
	});

	it("switching active tab does NOT clear the other tab's selection", () => {
		// Select projects, then clients, then re-select a different project —
		// the clients id must still be intact (tab-switch persistence, issue #11).
		let state = selectionReducer(EMPTY, {
			type: "select",
			tab: "projects",
			value: "p1",
		});
		state = selectionReducer(state, {
			type: "select",
			tab: "clients",
			value: "c1",
		});
		state = selectionReducer(state, {
			type: "select",
			tab: "projects",
			value: "p2",
		});
		expect(state.clients).toBe("c1");
		expect(state.projects).toBe("p2");
	});

	it("clear('clients') nulls clients without touching projects", () => {
		const seeded: SelectionState = {
			clients: "c1",
			projects: "p1",
			money: null,
		};
		const next = selectionReducer(seeded, { type: "clear", tab: "clients" });
		expect(next).toEqual({ clients: null, projects: "p1", money: null });
	});

	it("money select stores {kind,id} and overwrites quote → invoice", () => {
		const afterQuote = selectionReducer(EMPTY, {
			type: "select",
			tab: "money",
			value: { kind: "quote", id: "q1" },
		});
		expect(afterQuote.money).toEqual({ kind: "quote", id: "q1" });

		const afterInvoice = selectionReducer(afterQuote, {
			type: "select",
			tab: "money",
			value: { kind: "invoice", id: "i1" },
		});
		expect(afterInvoice.money).toEqual({ kind: "invoice", id: "i1" });
	});

	it("is pure: does not mutate its input and returns a new reference", () => {
		const frozen = Object.freeze({
			clients: null,
			projects: null,
			money: null,
		}) as SelectionState;
		const action: SelectionAction = {
			type: "select",
			tab: "clients",
			value: "c1",
		};
		// Mutating a frozen object throws in strict mode — passing the assertion
		// proves the reducer never wrote to the input.
		const next = selectionReducer(frozen, action);
		expect(next).not.toBe(frozen);
		expect(frozen).toEqual({ clients: null, projects: null, money: null });
	});
});
