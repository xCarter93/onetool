import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	dateIdFromUtcMs,
	localDayStartMs,
	todayDateId,
	utcDayStartMs,
	utcMsFromDateId,
} from "./date";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("date-id round-tripping", () => {
	it("round-trips a date-id through ms and back", () => {
		expect(dateIdFromUtcMs(utcMsFromDateId("2026-07-25"))).toBe("2026-07-25");
		expect(utcMsFromDateId("2026-01-01")).toBe(Date.UTC(2026, 0, 1));
	});

	it("treats utcDayStartMs as a no-op on a well-formed date-id", () => {
		const id = Date.UTC(2026, 6, 25);
		expect(utcDayStartMs(id)).toBe(id);
	});
});

/**
 * The regression that produced `localDayStartMs`. Under UTC bucketing, a
 * western-timezone user's "today" rolled over in the late afternoon: Today
 * opened on tomorrow and that day's in-progress jobs were labelled Overdue.
 *
 * TZ is forced so these fail on any machine, not just a non-UTC one.
 */
describe("instant → date-id uses the LOCAL calendar (TZ-forced)", () => {
	const original = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "America/Los_Angeles";
	});
	afterAll(() => {
		process.env.TZ = original;
	});

	// Guard: if the runtime ignores a TZ reassignment every test below would pass
	// vacuously, so assert the zone actually took effect first.
	it("actually applies the forced timezone", () => {
		expect(new Date(Date.UTC(2026, 6, 26, 3, 0)).getHours()).toBe(20);
	});

	it("keeps a 5:30pm-Pacific instant on the same local day", () => {
		const evening = new Date(2026, 6, 25, 17, 30).getTime();
		expect(iso(localDayStartMs(evening))).toBe("2026-07-25");
		// The old behaviour, kept as an explicit contrast:
		expect(iso(utcDayStartMs(evening))).toBe("2026-07-26");
	});

	it("does not mark a same-day job overdue in the evening", () => {
		const evening = new Date(2026, 6, 25, 17, 30).getTime();
		const job = Date.UTC(2026, 6, 25);
		expect(utcDayStartMs(job) < localDayStartMs(evening)).toBe(false);
		// Under the bug this comparison was true — hence "Overdue".
		expect(utcDayStartMs(job) < utcDayStartMs(evening)).toBe(true);
	});

	it("holds across every hour of a local day", () => {
		for (let hour = 0; hour < 24; hour++) {
			const at = new Date(2026, 6, 25, hour, 0).getTime();
			expect(iso(localDayStartMs(at))).toBe("2026-07-25");
		}
	});

	it("rolls over exactly at local midnight, not before", () => {
		const lastMoment = new Date(2026, 6, 25, 23, 59, 59, 999).getTime();
		const firstMoment = new Date(2026, 6, 26, 0, 0, 0, 0).getTime();
		expect(iso(localDayStartMs(lastMoment))).toBe("2026-07-25");
		expect(iso(localDayStartMs(firstMoment))).toBe("2026-07-26");
	});

	it("derives todayDateId from the local calendar", () => {
		const now = new Date();
		const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		expect(todayDateId()).toBe(expected);
	});
});

// Eastern crosses UTC midnight at 8pm rather than 5pm — same class of bug, and it
// proves the fix isn't tuned to one offset.
describe("instant → date-id in a second timezone", () => {
	const original = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "America/New_York";
	});
	afterAll(() => {
		process.env.TZ = original;
	});

	it("keeps a 9pm-Eastern instant on the same local day", () => {
		const evening = new Date(2026, 6, 25, 21, 0).getTime();
		expect(iso(localDayStartMs(evening))).toBe("2026-07-25");
		expect(iso(utcDayStartMs(evening))).toBe("2026-07-26");
	});
});
