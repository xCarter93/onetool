import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	absoluteDayLabel,
	buildActivityFeed,
	compactRelativeTime,
	dayLabel,
	groupByDay,
	humanizeEventType,
	knownActivityTypes,
	linkForActivity,
	toActivityDisplay,
	type ActivityFeedInput,
} from "./activity-feed";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/**
 * LOCAL midnight, deliberately not Date.UTC — activity.timestamp is an instant,
 * so the feed buckets on the viewer's local day. Fixtures built in UTC would
 * make these assertions pass only in a UTC runner.
 */
const localMidnight = (y: number, m: number, d: number) =>
	new Date(y, m - 1, d).getTime();
const localDayStart = (ms: number) => {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
};

// 2026-07-22, local midnight. July avoids every DST transition.
const TODAY = localMidnight(2026, 7, 22);
const NOW = TODAY + 14 * HOUR; // 14:00 local

const act = (
	over: Partial<ActivityFeedInput> & { _id: string },
): ActivityFeedInput => ({
	activityType: "quote_approved",
	entityType: "quote",
	entityId: "q1",
	entityName: "Quote 1042",
	description: "Quote approved by Acme Co",
	timestamp: NOW,
	...over,
});

describe("humanizeEventType", () => {
	it("turns a snake_case event into a sentence", () => {
		expect(humanizeEventType("invoice_paid")).toBe("Invoice paid");
		expect(humanizeEventType("member_permissions_updated")).toBe(
			"Member permissions updated",
		);
	});

	it("never returns an empty or undefined label", () => {
		expect(humanizeEventType("")).toBe("Activity");
		expect(humanizeEventType("___")).toBe("Activity");
		expect(humanizeEventType(undefined as unknown as string)).toBe("Activity");
	});
});

describe("linkForActivity", () => {
	it("maps the four entity types that have mobile detail routes", () => {
		expect(linkForActivity("client", "c1")).toEqual({
			pathname: "/clients/[clientId]",
			params: { clientId: "c1" },
		});
		expect(linkForActivity("project", "p1")).toEqual({
			pathname: "/projects/[projectId]",
			params: { projectId: "p1" },
		});
		expect(linkForActivity("quote", "q1")).toEqual({
			pathname: "/quote/[id]",
			params: { id: "q1" },
		});
		expect(linkForActivity("invoice", "i1")).toEqual({
			pathname: "/invoice/[id]",
			params: { id: "i1" },
		});
	});

	it("returns null for entities with no route, and for a missing id", () => {
		expect(linkForActivity("payment", "pay1")).toBeNull();
		expect(linkForActivity("user", "u1")).toBeNull();
		expect(linkForActivity("organization", "o1")).toBeNull();
		expect(linkForActivity("wormhole", "w1")).toBeNull();
		expect(linkForActivity("quote", "")).toBeNull();
		expect(linkForActivity("quote", "   ")).toBeNull();
	});
});

describe("toActivityDisplay", () => {
	it("maps a known event to icon, status, tint and link", () => {
		const row = toActivityDisplay(act({ _id: "a1" }));
		expect(row).toMatchObject({
			id: "a1",
			icon: "CircleCheck",
			description: "Quote approved by Acme Co",
			recordName: "Quote 1042",
			tint: "quote",
			status: "approved",
			link: { pathname: "/quote/[id]", params: { id: "q1" } },
			timestamp: NOW,
		});
	});

	it("maps every schema activityType it claims to know", () => {
		for (const type of knownActivityTypes()) {
			const row = toActivityDisplay(act({ _id: type, activityType: type }));
			expect(row.icon).not.toBe("Activity");
		}
	});

	it("degrades an UNKNOWN activityType to the generic Activity icon, no status", () => {
		const row = toActivityDisplay(
			act({
				_id: "a2",
				activityType: "invoice_teleported",
				description: "Invoice teleported to the moon",
			}),
		);
		expect(row.icon).toBe("Activity");
		expect(row.status).toBeNull();
		// Still deep-links, because the ENTITY type is known.
		expect(row.link).toEqual({ pathname: "/quote/[id]", params: { id: "q1" } });
		expect(row.description).toBe("Invoice teleported to the moon");
	});

	it("degrades an UNKNOWN entityType to no tint and no link", () => {
		const row = toActivityDisplay(
			act({ _id: "a3", entityType: "spaceship", activityType: "nope" }),
		);
		expect(row.tint).toBeNull();
		expect(row.link).toBeNull();
	});

	it("never renders undefined or empty strings for a hollow record", () => {
		const row = toActivityDisplay({
			_id: "",
			activityType: "",
			entityType: "",
			entityId: "",
			entityName: "",
			description: "",
			timestamp: Number.NaN,
		});
		expect(row.description).toBe("Activity");
		expect(row.recordName).toBe("Record");
		expect(row.id).toBe("activity-0");
		expect(row.timestamp).toBe(0);
		expect(row.icon).toBe("Activity");
		expect(JSON.stringify(row)).not.toContain("undefined");
	});

	it("falls back to a humanized event label when description is blank", () => {
		const row = toActivityDisplay(
			act({ _id: "a4", activityType: "invoice_paid", description: "   " }),
		);
		expect(row.description).toBe("Invoice paid");
	});

	it("truncates a runaway description instead of letting it blow up the row", () => {
		const row = toActivityDisplay(
			act({ _id: "a5", description: "x".repeat(500) }),
		);
		expect(row.description.length).toBeLessThanOrEqual(143);
		expect(row.description.endsWith("...")).toBe(true);
	});
});

describe("dayLabel", () => {
	it("labels today and yesterday", () => {
		expect(dayLabel(TODAY, NOW)).toBe("Today");
		expect(dayLabel(TODAY - DAY, NOW)).toBe("Yesterday");
	});

	it("falls back to an absolute date from two days back", () => {
		expect(dayLabel(TODAY - 2 * DAY, NOW)).toBe("Jul 20");
	});

	it("adds the year only when it differs from now", () => {
		expect(absoluteDayLabel(localMidnight(2026, 1, 3), NOW)).toBe("Jan 3");
		expect(absoluteDayLabel(localMidnight(2025, 12, 31), NOW)).toBe(
			"Dec 31, 2025",
		);
	});

	it("is stable no matter the time-of-day inside `now`", () => {
		expect(dayLabel(TODAY, TODAY)).toBe("Today");
		expect(dayLabel(TODAY, TODAY + 23 * HOUR + 59 * MIN)).toBe("Today");
	});

	it("flips at the local day boundary, not one millisecond early", () => {
		// The last instant of yesterday is still "Yesterday"; local midnight is "Today".
		expect(dayLabel(localDayStart(TODAY - 1), NOW)).toBe("Yesterday");
		expect(dayLabel(localDayStart(TODAY), NOW)).toBe("Today");
	});
});

describe("compactRelativeTime", () => {
	it("uses minutes, then hours, then day language", () => {
		expect(compactRelativeTime(NOW, NOW)).toBe("now");
		expect(compactRelativeTime(NOW - 30_000, NOW)).toBe("now");
		expect(compactRelativeTime(NOW - 14 * MIN, NOW)).toBe("14m");
		expect(compactRelativeTime(NOW - 59 * MIN, NOW)).toBe("59m");
		expect(compactRelativeTime(NOW - 3 * HOUR, NOW)).toBe("3h");
		expect(compactRelativeTime(NOW - 13 * HOUR, NOW)).toBe("13h");
	});

	it("says Yesterday for the previous local day and Nd within the week", () => {
		expect(compactRelativeTime(NOW - DAY, NOW)).toBe("Yesterday");
		expect(compactRelativeTime(NOW - 3 * DAY, NOW)).toBe("3d");
		expect(compactRelativeTime(NOW - 6 * DAY, NOW)).toBe("6d");
	});

	it("switches to an absolute date at a week out", () => {
		expect(compactRelativeTime(NOW - 7 * DAY, NOW)).toBe("Jul 15");
		expect(
			compactRelativeTime(localMidnight(2025, 11, 4) + 12 * HOUR, NOW),
		).toBe("Nov 4, 2025");
	});

	it("does not produce negative stamps for a future/skewed timestamp", () => {
		expect(compactRelativeTime(NOW + 5 * MIN, NOW)).toBe("now");
	});
});

describe("groupByDay", () => {
	const feed: ActivityFeedInput[] = [
		act({ _id: "mid-today", timestamp: TODAY + 9 * HOUR }),
		act({ _id: "older", timestamp: TODAY - 5 * DAY + 2 * HOUR }),
		act({ _id: "late-today", timestamp: TODAY + 13 * HOUR }),
		act({ _id: "yesterday", timestamp: TODAY - DAY + 7 * HOUR }),
		act({ _id: "early-today", timestamp: TODAY + 1 * HOUR }),
	];

	it("returns nothing for empty input", () => {
		expect(groupByDay([], NOW)).toEqual([]);
		expect(
			groupByDay(undefined as unknown as ActivityFeedInput[], NOW),
		).toEqual([]);
	});

	it("orders days newest-first with the expected labels", () => {
		const sections = groupByDay(feed, NOW);
		expect(sections.map((s) => s.label)).toEqual([
			"Today",
			"Yesterday",
			"Jul 17",
		]);
		expect(sections.map((s) => s.dayStartMs)).toEqual([
			TODAY,
			TODAY - DAY,
			TODAY - 5 * DAY,
		]);
	});

	it("orders rows newest-first WITHIN a day, regardless of input order", () => {
		const sections = groupByDay(feed, NOW);
		expect(sections[0].items.map((i) => i.id)).toEqual([
			"late-today",
			"mid-today",
			"early-today",
		]);
	});

	it("keeps a local-midnight event in its own day, not the previous one", () => {
		const sections = groupByDay(
			[
				act({ _id: "midnight", timestamp: TODAY }),
				act({ _id: "lastms", timestamp: TODAY - 1 }),
			],
			NOW,
		);
		expect(sections.map((s) => s.label)).toEqual(["Today", "Yesterday"]);
		expect(sections[0].items.map((i) => i.id)).toEqual(["midnight"]);
		expect(sections[1].items.map((i) => i.id)).toEqual(["lastms"]);
	});

	it("does not split one local day across two sections", () => {
		const sections = groupByDay(
			[
				act({ _id: "a", timestamp: TODAY }),
				act({ _id: "b", timestamp: TODAY + DAY - 1 }),
			],
			NOW,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].items).toHaveLength(2);
	});

	it("survives a batch full of unknown event types", () => {
		const sections = groupByDay(
			[
				act({ _id: "u1", activityType: "??", entityType: "??" }),
				act({ _id: "u2", activityType: "", entityType: "" }),
			],
			NOW,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].items.every((i) => i.icon === "Activity")).toBe(true);
		expect(sections[0].items.every((i) => i.recordName.length > 0)).toBe(true);
	});
});

describe("buildActivityFeed", () => {
	it("flattens sections into header/row items with unique keys", () => {
		const items = buildActivityFeed(
			[
				act({ _id: "t1", timestamp: TODAY + 5 * HOUR }),
				act({ _id: "y1", timestamp: TODAY - DAY }),
				act({ _id: "y2", timestamp: TODAY - DAY + HOUR }),
			],
			NOW,
		);
		expect(items.map((i) => i.kind)).toEqual([
			"header",
			"row",
			"header",
			"row",
			"row",
		]);
		expect(items[0]).toMatchObject({ label: "Today", count: 1 });
		expect(items[2]).toMatchObject({ label: "Yesterday", count: 2 });
		expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
	});

	it("is empty for empty input", () => {
		expect(buildActivityFeed([], NOW)).toEqual([]);
	});
});

// ----------------------------------------------------------------------------
// Regression: instants bucket on the LOCAL day, never on the UTC day.
//
// activity.timestamp is Date.now() (an instant), unlike task.date which is a
// UTC-midnight date-id. Every assertion below FAILS if this module reverts to
// utcDayStartMs. The zone is forced so the bug is reachable regardless of where
// the suite runs — a UTC runner would make these vacuously green.
// ----------------------------------------------------------------------------
describe("local-day bucketing (TZ-forced regressions)", () => {
	const originalTZ = process.env.TZ;

	// UTC-4 in July, so a local evening is already "tomorrow" in UTC.
	beforeAll(() => {
		process.env.TZ = "America/New_York";
	});
	afterAll(() => {
		if (originalTZ === undefined) delete process.env.TZ;
		else process.env.TZ = originalTZ;
	});

	it("confirms the forced zone is actually applied", () => {
		// Guard: without this, a runtime that ignored the TZ change would let every
		// assertion below pass for the wrong reason.
		expect(new Date(Date.UTC(2026, 6, 26, 1, 0)).getHours()).toBe(21);
	});

	it("calls a 3-hour-old evening event Today, not Yesterday", () => {
		// 2026-07-25 18:00 EDT === 2026-07-25 22:00 UTC.
		const evening = Date.UTC(2026, 6, 25, 22, 0);
		// Viewed at 21:00 EDT === 2026-07-26 01:00 UTC — a DIFFERENT UTC day.
		const viewedAt = Date.UTC(2026, 6, 26, 1, 0);

		expect(compactRelativeTime(evening, viewedAt)).toBe("3h");
		const sections = groupByDay(
			[act({ _id: "evening", timestamp: evening })],
			viewedAt,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].label).toBe("Today"); // UTC bucketing says "Yesterday"
		expect(sections[0].dayStartMs).toBe(Date.UTC(2026, 6, 25, 4, 0)); // local midnight
	});

	it("keeps one local evening's events in ONE section across the UTC midnight it straddles", () => {
		// 19:00 and 21:00 EDT on Jul 25 land on Jul 25 and Jul 26 in UTC.
		const before = Date.UTC(2026, 6, 25, 23, 0); // 19:00 EDT
		const after = Date.UTC(2026, 6, 26, 1, 0); // 21:00 EDT
		const viewedAt = Date.UTC(2026, 6, 26, 2, 0); // 22:00 EDT, same local day

		const sections = groupByDay(
			[
				act({ _id: "before-utc-midnight", timestamp: before }),
				act({ _id: "after-utc-midnight", timestamp: after }),
			],
			viewedAt,
		);
		// UTC bucketing splits these into "Today" + "Yesterday".
		expect(sections).toHaveLength(1);
		expect(sections[0].label).toBe("Today");
		expect(sections[0].items.map((i) => i.id)).toEqual([
			"after-utc-midnight",
			"before-utc-midnight",
		]);
	});

	it("flips Today to Yesterday at LOCAL midnight, not four hours early", () => {
		const lastMsOfJul25 = Date.UTC(2026, 6, 26, 3, 59, 59, 999); // 23:59:59.999 EDT
		const firstMsOfJul26 = Date.UTC(2026, 6, 26, 4, 0); // 00:00 EDT Jul 26
		const viewedAt = Date.UTC(2026, 6, 26, 16, 0); // 12:00 EDT Jul 26

		expect(
			groupByDay([act({ _id: "a", timestamp: lastMsOfJul25 })], viewedAt)[0]
				.label,
		).toBe("Yesterday");
		expect(
			groupByDay([act({ _id: "b", timestamp: firstMsOfJul26 })], viewedAt)[0]
				.label,
		).toBe("Today");
		// Straddling local midnight must produce two sections, newest first.
		const both = groupByDay(
			[
				act({ _id: "a", timestamp: lastMsOfJul25 }),
				act({ _id: "b", timestamp: firstMsOfJul26 }),
			],
			viewedAt,
		);
		expect(both.map((s) => s.label)).toEqual(["Today", "Yesterday"]);
	});

	it("dates absolute labels by the LOCAL calendar day", () => {
		// 21:00 EDT Jul 25 is Jul 26 in UTC; the label must read Jul 25.
		const evening = Date.UTC(2026, 6, 26, 1, 0);
		const tenDaysLater = Date.UTC(2026, 7, 5, 16, 0);
		expect(compactRelativeTime(evening, tenDaysLater)).toBe("Jul 25");
		expect(absoluteDayLabel(evening, tenDaysLater)).toBe("Jul 25");
	});

	it("never mislabels a 3-hour-old event, sweeping every hour of a local day", () => {
		// Zone-agnostic invariant: at any hour, a 3h-old event is Today iff the
		// local hour is >= 3. Catches off-by-one-day bucketing at any UTC offset.
		const midnight = localMidnight(2026, 7, 25);
		for (let h = 0; h < 24; h++) {
			const viewedAt = midnight + h * HOUR;
			const sections = groupByDay(
				[act({ _id: "e", timestamp: viewedAt - 3 * HOUR })],
				viewedAt,
			);
			expect(sections[0].label).toBe(h >= 3 ? "Today" : "Yesterday");
		}
	});
});
