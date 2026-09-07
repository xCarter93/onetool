import type { ProjectRecurrenceRule as RecurrenceRule } from "@onetool/backend/convex/lib/projectRecurrence";

export type { RecurrenceRule };

export type RecurrenceFormValue = {
	preset: "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";
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

export function applyPreset(
	value: RecurrenceFormValue,
	preset: RecurrenceFormValue["preset"],
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
		preset: "custom",
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

export function describeRecurrence(rule: RecurrenceRule): string {
	const unit = {
		daily: "day",
		weekly: "week",
		monthly: "month",
		yearly: "year",
	}[rule.frequency];
	const cadence =
		rule.interval === 1 ? rule.frequency : `every ${rule.interval} ${unit}s`;
	const selectors = rule.weekdays?.length
		? ` on ${rule.weekdays.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}`
		: rule.monthDays?.length
			? ` on day ${rule.monthDays.join(", ")}`
			: rule.ordinalWeekday
				? ` on the ${rule.ordinalWeekday.ordinal === -1 ? "last" : ["", "first", "second", "third", "fourth", "fifth"][rule.ordinalWeekday.ordinal]} ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][rule.ordinalWeekday.weekday]}`
				: "";
	const ending =
		rule.end?.kind === "until"
			? `, until ${rule.end.date}`
			: rule.end?.kind === "count"
				? `, occurrence limit: ${rule.end.count}`
				: "";
	const season = rule.months?.length
		? ` during ${rule.months.map((month) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]).join(", ")}`
		: "";
	return `${cadence}${selectors}${season}${ending}`;
}
