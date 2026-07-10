import { describe, it, expect } from "vitest";
import { scanOrgTable } from "./orgScan";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type FakeRow = { _id: string; _creationTime: number };

/**
 * Fake of the one query shape takeOrgPage uses:
 * db.query(t).withIndex("by_org", q => q.eq(...).lte("_creationTime", b)).order("desc").take(n).
 * Rows are served newest-first with a stable per-timestamp tiebreak, like a
 * Convex index. Also counts rows actually read, to assert paging behavior.
 */
function fakeCtx(rows: FakeRow[]) {
	const sorted = [...rows].sort(
		(a, b) => b._creationTime - a._creationTime || b._id.localeCompare(a._id)
	);
	const reads = { total: 0 };
	const db = {
		query: (_table: string) => {
			let bound: number | undefined;
			const range = {
				eq: () => range,
				lte: (_field: string, value: number) => {
					bound = value;
					return range;
				},
			};
			return {
				withIndex: (_name: string, fn: (q: typeof range) => unknown) => {
					fn(range);
					return {
						order: (_dir: string) => ({
							take: (n: number) => {
								const filtered =
									bound === undefined
										? sorted
										: sorted.filter((r) => r._creationTime <= bound!);
								const page = filtered.slice(0, n);
								reads.total += page.length;
								return Promise.resolve(page);
							},
						}),
					};
				},
			};
		},
	};
	return { ctx: { db } as unknown as { db: QueryCtx["db"] }, reads };
}

const ORG = "org1" as Id<"organizations">;

describe("scanOrgTable cursor pagination", () => {
	it("does not skip rows sharing a _creationTime across a page boundary", async () => {
		// Four rows in the same millisecond, page size 2: a strict-lt cursor
		// would return page 1 then find nothing < 100 and drop the other two.
		const { ctx } = fakeCtx([
			{ _id: "a", _creationTime: 100 },
			{ _id: "b", _creationTime: 100 },
			{ _id: "c", _creationTime: 100 },
			{ _id: "d", _creationTime: 100 },
		]);
		const result = await scanOrgTable(ctx, "clients", ORG, { batchSize: 2 });
		expect(result.matches).toHaveLength(4);
		expect(new Set(result.matches.map((r) => r._id)).size).toBe(4);
		expect(result.truncated).toBe(false);
	});

	it("handles a tie group straddling the boundary of distinct timestamps", async () => {
		const { ctx } = fakeCtx([
			{ _id: "a", _creationTime: 300 },
			{ _id: "b", _creationTime: 200 },
			{ _id: "c", _creationTime: 200 },
			{ _id: "d", _creationTime: 100 },
		]);
		const result = await scanOrgTable(ctx, "clients", ORG, { batchSize: 2 });
		expect(result.matches.map((r) => r._id).sort()).toEqual(["a", "b", "c", "d"]);
		expect(result.truncated).toBe(false);
	});

	it("reports truncation when same-timestamp rows remain past the scan cap", async () => {
		const { ctx } = fakeCtx(
			["a", "b", "c", "d", "e"].map((_id) => ({ _id, _creationTime: 100 }))
		);
		const result = await scanOrgTable(ctx, "clients", ORG, {
			batchSize: 2,
			maxScan: 4,
		});
		expect(result.matches).toHaveLength(4);
		expect(result.truncated).toBe(true);
	});

	it("does not report truncation when the cap lands exactly on the last row", async () => {
		const { ctx } = fakeCtx(
			["a", "b", "c", "d"].map((_id) => ({ _id, _creationTime: 100 }))
		);
		const result = await scanOrgTable(ctx, "clients", ORG, {
			batchSize: 2,
			maxScan: 4,
		});
		expect(result.matches).toHaveLength(4);
		expect(result.truncated).toBe(false);
	});

	it("still early-exits on stopBelowCreationTime without marking truncation", async () => {
		const { ctx, reads } = fakeCtx([
			{ _id: "a", _creationTime: 300 },
			{ _id: "b", _creationTime: 250 },
			{ _id: "c", _creationTime: 50 },
			{ _id: "d", _creationTime: 40 },
			{ _id: "e", _creationTime: 30 },
		]);
		const result = await scanOrgTable(ctx, "clients", ORG, {
			batchSize: 2,
			stopBelowCreationTime: 200,
		});
		expect(result.matches.map((r) => r._id)).toEqual(["a", "b"]);
		expect(result.truncated).toBe(false);
		// Page 1 (a,b) + page 2 (boundary re-read b, then c stops the scan) —
		// the early exit means the tail of the table is never read.
		expect(reads.total).toBeLessThanOrEqual(5);
	});

	it("applies the predicate per row across pages", async () => {
		const { ctx } = fakeCtx([
			{ _id: "a", _creationTime: 300 },
			{ _id: "b", _creationTime: 300 },
			{ _id: "c", _creationTime: 300 },
			{ _id: "d", _creationTime: 100 },
		]);
		const result = await scanOrgTable(ctx, "clients", ORG, {
			batchSize: 2,
			predicate: (row) => row._id !== "b",
		});
		expect(result.matches.map((r) => r._id).sort()).toEqual(["a", "c", "d"]);
		expect(result.scanned).toBe(4);
	});
});
