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
	/** The business's IANA timezone. Falls back to the visitor's when unset. */
	timezone?: string;
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
const getServerWeekdayIndex = () => null;

/** Today's weekday in `timezone`, or the visitor's own when it is unset/invalid. */
function weekdayIndexIn(timezone?: string): number {
	if (!timezone) return new Date().getDay();
	try {
		const name = new Intl.DateTimeFormat("en-US", {
			weekday: "long",
			timeZone: timezone,
		})
			.format(new Date())
			.toLowerCase();
		const index = DAY_NAMES.indexOf(name);
		return index === -1 ? new Date().getDay() : index;
	} catch {
		// A stored zone Intl doesn't recognise shouldn't blank the hours line.
		return new Date().getDay();
	}
}

/**
 * Today's hours, resolved against the BUSINESS's day when the org has a
 * timezone set — so an out-of-area visitor doesn't see the wrong day — and
 * against the visitor's own clock otherwise.
 */
export function OpenToday({
	schedule,
	byAppointmentOnly,
	timezone,
}: OpenTodayProps) {
	const weekdayIndex = useSyncExternalStore(
		noopSubscribe,
		() => weekdayIndexIn(timezone),
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
