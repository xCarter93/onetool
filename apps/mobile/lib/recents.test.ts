import { describe, expect, it } from "vitest";
import { pushRecent, RECENTS_LIMIT, type RecentRecord } from "./recents";

const rec = (id: string, at = 0): RecentRecord => ({
	kind: "client",
	id,
	title: `Client ${id}`,
	at,
});

describe("pushRecent", () => {
	it("prepends a new entry", () => {
		const out = pushRecent([rec("a", 1)], { kind: "client", id: "b", title: "B" }, 2);
		expect(out.map((r) => r.id)).toEqual(["b", "a"]);
		expect(out[0].at).toBe(2);
	});

	it("moves a re-viewed entry to the front and refreshes its snapshot", () => {
		const out = pushRecent(
			[rec("a", 1), rec("b", 2)],
			{ kind: "client", id: "a", title: "Renamed", sub: "Boston" },
			3
		);
		expect(out.map((r) => r.id)).toEqual(["a", "b"]);
		expect(out[0]).toMatchObject({ title: "Renamed", sub: "Boston", at: 3 });
		expect(out).toHaveLength(2);
	});

	it("treats the same id under a different kind as distinct", () => {
		const out = pushRecent([rec("a")], { kind: "project", id: "a", title: "P" }, 1);
		expect(out).toHaveLength(2);
	});

	it("caps at RECENTS_LIMIT, dropping the oldest", () => {
		let list: RecentRecord[] = [];
		for (let i = 0; i < RECENTS_LIMIT + 3; i++) {
			list = pushRecent(list, { kind: "client", id: `c${i}`, title: `C${i}` }, i);
		}
		expect(list).toHaveLength(RECENTS_LIMIT);
		expect(list[0].id).toBe(`c${RECENTS_LIMIT + 2}`);
		expect(list.some((r) => r.id === "c0")).toBe(false);
	});
});
