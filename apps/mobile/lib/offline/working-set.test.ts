import { describe, expect, it } from "vitest";
import { selectWorkingSet } from "./working-set";

const empty = { calendar: null, sentQuotes: [], overdueInvoices: [], recents: [] };

describe("selectWorkingSet", () => {
	it("puts the day's tasks and projects before linked records and recents", () => {
		const refs = selectWorkingSet({
			calendar: {
				tasks: [{ id: "t1", clientId: "c1", projectId: "p2" }],
				projects: [{ id: "p1", clientId: "c2" }],
			},
			sentQuotes: [{ _id: "q1" }],
			overdueInvoices: [{ _id: "i1" }],
			recents: [{ kind: "client", id: "c9" }],
		});
		expect(refs.map((r) => `${r.kind}:${r.id}`)).toEqual([
			"task:t1",
			"project:p1",
			"project:p2",
			"client:c2",
			"client:c1",
			"quote:q1",
			"invoice:i1",
			"client:c9",
		]);
	});

	it("dedupes and ignores unknown recent kinds", () => {
		const refs = selectWorkingSet({
			...empty,
			sentQuotes: [{ _id: "q1" }],
			recents: [
				{ kind: "quote", id: "q1" },
				{ kind: "note", id: "n1" },
			],
		});
		expect(refs).toEqual([{ kind: "quote", id: "q1" }]);
	});

	it("caps the set", () => {
		const recents = Array.from({ length: 10 }, (_, i) => ({ kind: "task", id: `t${i}` }));
		expect(selectWorkingSet({ ...empty, recents }, 3)).toHaveLength(3);
	});
});
