import {
	addCalendarDays,
	type ProjectRecurrenceRule as RecurrenceRule,
} from "@onetool/backend/convex/lib/projectRecurrence";

export type { RecurrenceRule };

export type RecurrencePreset =
	| "daily"
	| "weekly"
	| "biweekly"
	| "monthly"
	| "yearly"
	| "custom";

export type RecurrenceFormValue = {
	preset: RecurrencePreset;
	frequency: RecurrenceRule["frequency"];
	interval: number;
	weekdays: number[];
	monthlyMode: "monthDays" | "ordinal";
	monthDays: number[];
	ordinal: number;
	ordinalWeekday: number;
	months: number[];
	endKind: "never" | "until" | "count";
	until: string;
	count: number;
};

export const DEFAULT_RECURRENCE_FORM: RecurrenceFormValue = {
	preset: "weekly",
	frequency: "weekly",
	interval: 1,
	weekdays: [],
	monthlyMode: "monthDays",
	monthDays: [],
	ordinal: 1,
	ordinalWeekday: 1,
	months: [],
	endKind: "never",
	until: "",
	count: 12,
};

export const MAX_DURATION_DAYS = 365;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTH_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const ORDINAL_WORD: Record<number, string> = {
	1: "first",
	2: "second",
	3: "third",
	4: "fourth",
	5: "fifth",
	[-1]: "last",
};

function parseKey(dateKey: string) {
	const [year, month, day] = dateKey.split("-").map(Number);
	return { year, month, day, date: new Date(Date.UTC(year, month - 1, day)) };
}

function ordinalSuffix(day: number): string {
	const mod100 = day % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
	const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th";
	return `${day}${suffix}`;
}

function joinList(items: string[]): string {
	if (items.length <= 1) return items.join("");
	if (items.length === 2) return `${items[0]} and ${items[1]}`;
	return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function anchorParts(anchorDateKey: string) {
	const { year, month, day, date } = parseKey(anchorDateKey);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		day,
		month,
		weekday: date.getUTCDay(),
		ordinal: Math.ceil(day / 7),
		isLastWeekOfMonth: day + 7 > lastDay,
	};
}

export function applyPreset(
	value: RecurrenceFormValue,
	preset: RecurrencePreset,
): RecurrenceFormValue {
	if (preset === "custom") return { ...value, preset };
	const frequency = preset === "biweekly" ? "weekly" : preset;
	return {
		...value,
		preset,
		frequency,
		interval: preset === "biweekly" ? 2 : 1,
	};
}

export function inferPreset(
	rule: Pick<RecurrenceRule, "frequency" | "interval">,
): RecurrencePreset {
	if (rule.frequency === "weekly" && rule.interval === 2) return "biweekly";
	if (rule.interval === 1) return rule.frequency;
	return "custom";
}

export type MonthlyChoice = "day" | "ordinal" | "last" | "custom";

export function monthlyChoiceOptions(
	anchorDateKey: string,
	frequency: RecurrenceRule["frequency"],
): Array<{ value: MonthlyChoice; label: string }> {
	const anchor = anchorParts(anchorDateKey);
	const weekday = WEEKDAY_LONG[anchor.weekday];
	const monthPrefix =
		frequency === "yearly" ? `${MONTH_SHORT[anchor.month - 1]} ` : "the ";
	const options: Array<{ value: MonthlyChoice; label: string }> = [
		{ value: "day", label: `${monthPrefix}${ordinalSuffix(anchor.day)}` },
		{
			value: "ordinal",
			label: `the ${ORDINAL_WORD[anchor.ordinal]} ${weekday}`,
		},
	];
	if (anchor.isLastWeekOfMonth)
		options.push({ value: "last", label: `the last ${weekday}` });
	options.push({ value: "custom", label: "Specific dates or weekday…" });
	return options;
}

export function monthlyChoice(
	value: RecurrenceFormValue,
	anchorDateKey: string,
): MonthlyChoice {
	const anchor = anchorParts(anchorDateKey);
	if (value.monthlyMode === "monthDays") {
		return value.monthDays.length === 1 && value.monthDays[0] === anchor.day
			? "day"
			: "custom";
	}
	if (value.ordinalWeekday !== anchor.weekday) return "custom";
	if (value.ordinal === anchor.ordinal) return "ordinal";
	if (value.ordinal === -1 && anchor.isLastWeekOfMonth) return "last";
	return "custom";
}

export function applyMonthlyChoice(
	value: RecurrenceFormValue,
	choice: MonthlyChoice,
	anchorDateKey: string,
): RecurrenceFormValue {
	const anchor = anchorParts(anchorDateKey);
	switch (choice) {
		case "day":
			return { ...value, monthlyMode: "monthDays", monthDays: [anchor.day] };
		case "ordinal":
			return {
				...value,
				monthlyMode: "ordinal",
				ordinal: anchor.ordinal,
				ordinalWeekday: anchor.weekday,
			};
		case "last":
			return {
				...value,
				monthlyMode: "ordinal",
				ordinal: -1,
				ordinalWeekday: anchor.weekday,
			};
		case "custom":
			return value;
	}
}

// Anchor-derived selections follow the start date; explicit customizations stay put.
export function reanchorRecurrenceForm(
	value: RecurrenceFormValue,
	previousAnchorKey: string,
	nextAnchorKey: string,
): RecurrenceFormValue {
	if (previousAnchorKey === nextAnchorKey) return value;
	const previous = anchorParts(previousAnchorKey);
	const next = anchorParts(nextAnchorKey);
	let result = value;
	if (
		value.weekdays.length === 1 &&
		value.weekdays[0] === previous.weekday
	)
		result = { ...result, weekdays: [next.weekday] };
	const choice = monthlyChoice(value, previousAnchorKey);
	if (choice !== "custom")
		result = applyMonthlyChoice(result, choice, nextAnchorKey);
	return result;
}

export function serializeRecurrenceRule(
	value: RecurrenceFormValue,
): RecurrenceRule {
	const rule: RecurrenceRule = {
		frequency: value.frequency,
		interval: value.interval,
	};
	if (value.frequency === "weekly") rule.weekdays = [...value.weekdays].sort();
	if (value.frequency === "monthly" || value.frequency === "yearly") {
		if (value.monthlyMode === "monthDays") {
			rule.monthDays = [...value.monthDays].sort((a, b) => a - b);
		} else {
			rule.ordinalWeekday = {
				ordinal: value.ordinal,
				weekday: value.ordinalWeekday,
			};
		}
	}
	if (value.months.length > 0)
		rule.months = [...new Set(value.months)].sort((a, b) => a - b);
	if (value.endKind === "until")
		rule.end = { kind: "until", date: value.until };
	if (value.endKind === "count")
		rule.end = { kind: "count", count: value.count };
	return rule;
}

export function recurrenceRuleToForm(
	rule: RecurrenceRule,
): RecurrenceFormValue {
	return {
		...DEFAULT_RECURRENCE_FORM,
		preset: inferPreset(rule),
		frequency: rule.frequency,
		interval: rule.interval,
		weekdays: rule.weekdays ?? [],
		monthlyMode: rule.ordinalWeekday ? "ordinal" : "monthDays",
		monthDays: rule.monthDays ?? [],
		ordinal: rule.ordinalWeekday?.ordinal ?? 1,
		ordinalWeekday: rule.ordinalWeekday?.weekday ?? 1,
		months: rule.months ?? [],
		endKind: rule.end?.kind ?? "never",
		until: rule.end?.kind === "until" ? rule.end.date : "",
		count: rule.end?.kind === "count" ? rule.end.count : 12,
	};
}

export function validateRecurrenceForm(
	value: RecurrenceFormValue,
): string | null {
	if (
		!Number.isInteger(value.interval) ||
		value.interval < 1 ||
		value.interval > 1000
	)
		return "Interval must be a whole number from 1 to 1,000.";
	if (value.frequency === "weekly" && value.weekdays.length === 0)
		return "Choose at least one weekday.";
	if (
		(value.frequency === "monthly" || value.frequency === "yearly") &&
		value.monthlyMode === "monthDays" &&
		value.monthDays.length === 0
	)
		return "Choose at least one day of the month.";
	if (value.endKind === "until" && !/^\d{4}-\d{2}-\d{2}$/.test(value.until))
		return "Choose a valid end date.";
	if (
		value.endKind === "count" &&
		(!Number.isInteger(value.count) || value.count < 1 || value.count > 10000)
	)
		return "Occurrence count must be a whole number from 1 to 10,000.";
	return null;
}

// Stored durationDays is the start→end offset; the UI shows an inclusive day count.
export function durationCountFromOffset(offset: number | null | undefined) {
	return (offset ?? 0) + 1;
}

export function durationOffsetFromCount(count: number): number {
	return count - 1;
}

export function validateDurationCount(count: number): string | null {
	if (!Number.isInteger(count) || count < 1 || count > MAX_DURATION_DAYS)
		return `Duration must be a whole number from 1 to ${MAX_DURATION_DAYS} days.`;
	return null;
}

function describeSelectors(rule: RecurrenceRule): string {
	if (rule.weekdays?.length)
		return ` on ${rule.weekdays.map((day) => WEEKDAY_SHORT[day]).join(", ")}`;
	if (rule.monthDays?.length)
		return ` on the ${joinList(rule.monthDays.map(ordinalSuffix))}`;
	if (rule.ordinalWeekday)
		return ` on the ${ORDINAL_WORD[rule.ordinalWeekday.ordinal]} ${WEEKDAY_LONG[rule.ordinalWeekday.weekday]}`;
	return "";
}

function describeEnding(rule: RecurrenceRule): string {
	if (rule.end?.kind === "until") {
		const { date } = parseKey(rule.end.date);
		return `Ends ${date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone: "UTC",
		})}.`;
	}
	if (rule.end?.kind === "count")
		return `Ends after ${rule.end.count} visit${rule.end.count === 1 ? "" : "s"}.`;
	return "Never ends.";
}

export function describeRecurrence(
	rule: RecurrenceRule,
	options: { durationCount?: number } = {},
): string {
	const unit = {
		daily: "day",
		weekly: "week",
		monthly: "month",
		yearly: "year",
	}[rule.frequency];
	const cadence =
		rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
	const season = rule.months?.length
		? ` in ${rule.months.map((month) => MONTH_SHORT[month - 1]).join(", ")}`
		: "";
	const sentences = [`${cadence}${season}${describeSelectors(rule)}.`];
	if (options.durationCount !== undefined && options.durationCount > 1)
		sentences.push(`Each visit lasts ${options.durationCount} days.`);
	sentences.push(describeEnding(rule));
	return sentences.join(" ");
}

export function formatVisitRange(
	dateKey: string,
	durationCount: number,
): string {
	const start = parseKey(dateKey);
	if (durationCount <= 1)
		return start.date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone: "UTC",
		});
	const end = parseKey(addCalendarDays(dateKey, durationCount - 1));
	const short = (parts: ReturnType<typeof parseKey>) =>
		parts.date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	if (start.year !== end.year)
		return `${short(start)}, ${start.year} – ${short(end)}, ${end.year}`;
	if (start.month !== end.month)
		return `${short(start)} – ${short(end)}, ${start.year}`;
	return `${MONTH_SHORT[start.month - 1]} ${start.day}–${end.day}, ${start.year}`;
}
