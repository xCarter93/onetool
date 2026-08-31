import { describe, it, expect } from "vitest";

import {
	formatCalendarDate,
	localDateToUtcMidnightMs,
	utcMidnightMsToLocalDate,
} from "./dates";

// The suite runs in UTC, so the off-by-one that motivated formatCalendarDate is
// only reproducible by asking Intl for a zone west of UTC directly.
const NEW_YORK = { timeZone: "America/New_York" } as const;

describe("formatCalendarDate", () => {
	const AUG_27 = Date.UTC(2026, 7, 27);

	it("renders the stored calendar day, not the instant", () => {
		expect(formatCalendarDate(AUG_27)).toBe("Aug 27, 2026");
	});

	it("does not slip a day west of UTC", () => {
		// Regression: the payment schedule tab formatted the raw epoch, so a
		// deadline stored as Aug 27 rendered "Aug 26" for every US viewer.
		const naive = new Date(AUG_27).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			...NEW_YORK,
		});
		expect(naive).toBe("Aug 26, 2026");
		expect(formatCalendarDate(AUG_27)).toBe("Aug 27, 2026");
	});

	it("renders an em dash for a missing date", () => {
		expect(formatCalendarDate(undefined)).toBe("—");
		expect(formatCalendarDate(null)).toBe("—");
		expect(formatCalendarDate(0)).toBe("—");
	});

	it("round-trips a picker date through the stored epoch", () => {
		const picked = new Date(2026, 7, 27);
		const stored = localDateToUtcMidnightMs(picked);
		expect(stored).toBe(AUG_27);
		expect(utcMidnightMsToLocalDate(stored).getDate()).toBe(27);
		expect(formatCalendarDate(stored)).toBe("Aug 27, 2026");
	});
});
