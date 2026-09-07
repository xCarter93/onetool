import type { AgreementPaymentRule } from "../convex/lib/projectSeriesAgreements";
import type { ProjectRecurrenceRule } from "../convex/lib/projectRecurrence";
import { formatCurrency } from "./format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
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

// Billing periods are stored as "YYYY-MM".
export function formatBillingPeriod(period: string): string {
	const [year, month] = period.split("-").map(Number);
	return `${MONTHS[(month ?? 1) - 1]} ${year}`;
}

export function formatRecurringSchedule(rule: ProjectRecurrenceRule): string {
	const unit = {
		daily: "day",
		weekly: "week",
		monthly: "month",
		yearly: "year",
	}[rule.frequency];
	const cadence =
		rule.interval === 1
			? `${rule.frequency[0]!.toUpperCase()}${rule.frequency.slice(1)}`
			: `Every ${rule.interval} ${unit}s`;
	const selectors = rule.weekdays?.length
		? ` on ${rule.weekdays.map((day) => WEEKDAYS[day]).join(", ")}`
		: rule.monthDays?.length
			? ` on day ${rule.monthDays.join(", ")}`
			: rule.ordinalWeekday
				? ` on the ${rule.ordinalWeekday.ordinal === -1 ? "last" : ["", "first", "second", "third", "fourth", "fifth"][rule.ordinalWeekday.ordinal]} ${WEEKDAYS[rule.ordinalWeekday.weekday]}`
				: "";
	const season = rule.months?.length
		? ` during ${rule.months.map((month) => MONTHS[month - 1]).join(", ")}`
		: "";
	const ending =
		rule.end?.kind === "until"
			? `, through ${rule.end.date}`
			: rule.end?.kind === "count"
				? `, for ${rule.end.count} visits`
				: "";
	return `${cadence}${selectors}${season}${ending}`;
}

const describeDueOffset = (days: number) =>
	days === 0
		? "when issued"
		: `${days} day${days === 1 ? "" : "s"} after issue`;

export function formatRecurringPaymentRule(rule: AgreementPaymentRule): string {
	if (rule.type === "percentage")
		return rule.installments
			.map(
				(item) =>
					`${item.percentage}% due ${describeDueOffset(item.dayOffset)}`,
			)
			.join("; ");
	return [
		...rule.installments.map(
			(item) =>
				`${formatCurrency(item.amount)} due ${describeDueOffset(item.dayOffset)}`,
		),
		`Remaining balance due ${describeDueOffset(rule.balance.dayOffset)}`,
	].join("; ");
}
