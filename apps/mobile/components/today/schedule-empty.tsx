import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { Illustration } from "@/components/illustrations";

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
		body: "No work scheduled for the next two weeks.",
	},
};

interface ScheduleEmptyProps {
	variant: ScheduleEmptyVariant;
	onNewTask: () => void;
}

/** The schedule's composed empty state — same frame in both views. */
export function ScheduleEmpty({ variant, onNewTask }: ScheduleEmptyProps) {
	const t = useTokens();
	const copy = COPY[variant];
	return (
		<View style={[styles.empty, { borderColor: t.line }]}>
			<Illustration
				name="all-caught-up"
				knockout={t.bg}
				style={styles.emptyArt}
			/>
			<Text style={[styles.emptyTitle, { color: t.ink }]}>{copy.title}</Text>
			<Text style={[styles.emptyCopy, { color: t.sub }]}>{copy.body}</Text>
			<Button title="New task" onPress={onNewTask} style={styles.emptyAction} />
		</View>
	);
}

const styles = StyleSheet.create({
	empty: {
		alignItems: "center",
		gap: 4,
		borderWidth: 1,
		borderStyle: "dashed",
		borderRadius: radii.card,
		paddingVertical: 30,
		paddingHorizontal: 24,
	},
	emptyArt: {
		marginBottom: 6,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	emptyCopy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	emptyAction: {
		marginTop: 12,
		alignSelf: "stretch",
	},
});
