import React from "react";
import { CalendarCheck } from "lucide-react-native";
import { EmptyPanel } from "@/components/canvas";
import { Button } from "@/components/ui";
import { UPCOMING_DAYS } from "@/lib/agenda";

export type ScheduleEmptyVariant =
	/** This day is clear, but there IS work elsewhere in the window. */
	| "clear-day"
	/** A clear weekend — worth naming, so the blank screen reads as intended. */
	| "day-off"
	/** Nothing at all across the whole rolling window. */
	| "no-work";

const COPY: Record<ScheduleEmptyVariant, { title: string; body: string }> = {
	"clear-day": { title: "Nothing scheduled", body: "This day is clear." },
	"day-off": { title: "Day off", body: "Nothing booked this weekend." },
	"no-work": {
		title: "Nothing on the books",
		body: `No work scheduled for the next ${UPCOMING_DAYS} days.`,
	},
};

interface ScheduleEmptyProps {
	variant: ScheduleEmptyVariant;
	onNewTask: () => void;
}

/** The schedule's composed empty state — the same bordered panel in both views. */
export function ScheduleEmpty({ variant, onNewTask }: ScheduleEmptyProps) {
	const copy = COPY[variant];
	return (
		<EmptyPanel
			icon={CalendarCheck}
			title={copy.title}
			body={copy.body}
			action={<Button title="New task" onPress={onNewTask} />}
		/>
	);
}
