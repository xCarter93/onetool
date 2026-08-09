"use client";

import { useSyncExternalStore } from "react";
import { CalendarCheck } from "lucide-react";

interface ScheduleDay {
	day: string;
	open: string;
	close: string;
	isClosed: boolean;
}

interface OpenTodayProps {
	schedule?: ScheduleDay[];
	byAppointmentOnly?: boolean;
}

const DAY_NAMES = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];

/** "17:00" -> "5:00 PM". Returns the input unchanged if it isn't HH:MM. */
function formatTime(value: string): string {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return value;
	const hours = Number(match[1]);
	if (Number.isNaN(hours) || hours > 23) return value;
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${match[2]} ${suffix}`;
}

// The weekday is a client-only fact: the page is cached for 60s, so a
// server-rendered "today" would go stale. Read through useSyncExternalStore
// so it is correct on first client render with no hydration mismatch.
const noopSubscribe = () => () => {};
const getWeekdayIndex = () => new Date().getDay();
const getServerWeekdayIndex = () => null;

/**
 * Today's hours, resolved against the VISITOR's local day.
 *
 * Visitors to a local field-service business are almost always in the same
 * timezone as the business. The org's own timezone is not part of the public
 * payload today; adding it would make this exact.
 */
export function OpenToday({ schedule, byAppointmentOnly }: OpenTodayProps) {
	const weekdayIndex = useSyncExternalStore(
		noopSubscribe,
		getWeekdayIndex,
		getServerWeekdayIndex
	);

	if (byAppointmentOnly) {
		return (
			<span className="inline-flex items-center gap-1.5">
				<CalendarCheck className="size-4 text-success" aria-hidden="true" />
				By appointment only
			</span>
		);
	}

	if (weekdayIndex === null || !schedule?.length) return null;

	const todayName = DAY_NAMES[weekdayIndex];
	const today = schedule.find(
		(entry) => entry.day.trim().toLowerCase() === todayName
	);
	if (!today) return null;

	return (
		<span className="inline-flex items-center gap-1.5">
			<CalendarCheck className="size-4 text-success" aria-hidden="true" />
			{today.isClosed
				? "Closed today"
				: `Open today until ${formatTime(today.close)}`}
		</span>
	);
}
