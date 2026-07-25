import React from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Check } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";
import { formatClockLabel, type AgendaTask } from "@/lib/agenda";

const BOX = 22;
// Time column width + gap — the indent titles and context lines share.
const TIME_COL = 65;

interface AgendaRowProps {
	task: AgendaTask;
	completed: boolean;
	updating: boolean;
	last: boolean;
	onToggle: () => void;
	onOpen: () => void;
	/** Assignee chip (Team scope). Undefined = no chip. */
	assignee?: { initials: string; name: string };
}

/**
 * One line of Today's agenda. The checkbox and the row body are SEPARATE tap
 * targets — checking off a job and opening it are different intents, and a
 * single row-wide handler makes the common one (checking off) risky.
 */
export function AgendaRow({
	task,
	completed,
	updating,
	last,
	onToggle,
	onOpen,
	assignee,
}: AgendaRowProps) {
	const t = useTokens();
	const done = completed || task.status === "completed";
	const cancelled = task.status === "cancelled";
	const timeLabel = formatClockLabel(task.startTime);
	const muted = done || cancelled;

	return (
		<View
			style={[
				styles.row,
				!last && { borderBottomWidth: 1, borderBottomColor: t.lineSoft },
			]}
		>
			<Pressable
				onPress={onToggle}
				disabled={updating || cancelled}
				hitSlop={6}
				style={styles.checkTarget}
				accessibilityRole="checkbox"
				accessibilityState={{ checked: done, disabled: cancelled }}
				accessibilityLabel={
					done ? `Mark ${task.title} not done` : `Mark ${task.title} done`
				}
			>
				{updating ? (
					<ActivityIndicator size="small" color={t.sub} />
				) : (
					<View
						style={[
							styles.box,
							{
								borderColor: done ? t.primarySolid : t.checkbox,
								backgroundColor: done ? t.primarySolid : "transparent",
							},
						]}
					>
						{done ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
					</View>
				)}
			</Pressable>

			<Pressable
				onPress={onOpen}
				style={styles.body}
				accessibilityRole="button"
				accessibilityLabel={[
					task.title,
					timeLabel,
					// The chip only shows initials — the full name belongs here.
					assignee && `assigned to ${assignee.name}`,
				]
					.filter(Boolean)
					.join(", ")}
			>
				<View style={styles.titleLine}>
					{timeLabel ? (
						<Text style={[styles.time, { color: muted ? t.faint : t.sub }]}>
							{timeLabel}
						</Text>
					) : null}
					<Text
						style={[
							styles.title,
							{
								color: muted ? t.faint : t.ink,
								textDecorationLine: muted ? "line-through" : "none",
							},
						]}
						numberOfLines={1}
					>
						{task.title}
					</Text>
				</View>
				{task.context ? (
					<Text
						style={[
							styles.context,
							// Align under the title, which is itself offset only when timed.
							{ color: t.sub, marginLeft: timeLabel ? TIME_COL : 0 },
						]}
						numberOfLines={1}
					>
						{task.context}
					</Text>
				) : null}
			</Pressable>

			{assignee ? (
				// Announced via the body label; the chip itself is decoration.
				<View
					style={[styles.assignee, { backgroundColor: t.secondary }]}
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					<Text style={[styles.assigneeText, { color: t.frostedInk }]}>
						{assignee.initials}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: touch.min,
		paddingRight: 14,
	},
	// 44pt tap target around a 22px glyph.
	checkTarget: {
		width: touch.min,
		height: touch.min,
		alignItems: "center",
		justifyContent: "center",
	},
	box: {
		width: BOX,
		height: BOX,
		borderRadius: radii.xs,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	body: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
		paddingVertical: 9,
	},
	titleLine: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 7,
	},
	time: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
		// Keeps titles left-aligned down the column whether or not a row is timed.
		minWidth: 58,
	},
	title: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
	context: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		marginTop: 2,
	},
	assignee: {
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 8,
	},
	assigneeText: {
		fontFamily: fontFamily.semibold,
		fontSize: 10,
	},
});
