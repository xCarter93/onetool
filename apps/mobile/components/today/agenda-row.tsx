import React from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Check } from "lucide-react-native";
import {
	fontFamily,
	radii,
	recordTint,
	touch,
	type,
	useTokens,
} from "@/lib/theme";
import { formatClockLabel, type AgendaTask } from "@/lib/agenda";

const BOX = 22;
/** Left time rail. Fixed so every title starts on the same column, timed or not. */
const RAIL = 58;
/** Record-tint spine width — a hairline bar, never a color block. */
export const SPINE = 3;

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
 * Wraps a non-task row (project `ListRow`s) in the same tinted spine, so the
 * ALL DAY band and the timeline speak one language. Lives here rather than in
 * `ui/list-row.tsx`, which the Today tab does not own.
 */
export function SpinedRow({
	color,
	children,
}: {
	color: string;
	children: React.ReactNode;
}) {
	return <View style={[styles.spined, { borderLeftColor: color }]}>{children}</View>;
}

/**
 * One line of Today's timeline: a record-tint spine and a left time rail
 * (Timepage), then the title block, then the checkbox.
 *
 * The checkbox and the row body are SEPARATE tap targets — checking off a job
 * and opening it are different intents, and a single row-wide handler makes the
 * common one (checking off) risky.
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
	const endLabel = formatClockLabel(task.endTime);
	const muted = done || cancelled;

	return (
		<View
			style={[
				styles.row,
				{ borderLeftColor: muted ? t.line : recordTint.task.fg },
				!last && { borderBottomWidth: 1, borderBottomColor: t.lineSoft },
			]}
		>
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
				<View style={styles.rail}>
					{timeLabel ? (
						<>
							<Text style={[styles.time, { color: muted ? t.faint : t.ink }]}>
								{timeLabel}
							</Text>
							{endLabel ? (
								<Text style={[styles.endTime, { color: t.faint }]}>
									{endLabel}
								</Text>
							) : null}
						</>
					) : (
						<Text style={[styles.endTime, { color: t.faint }]}>Anytime</Text>
					)}
				</View>

				<View style={styles.text}>
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
					{task.context ? (
						<Text
							style={[styles.context, { color: t.sub }]}
							numberOfLines={1}
						>
							{task.context}
						</Text>
					) : null}
				</View>
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
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: touch.min,
		borderLeftWidth: SPINE,
	},
	spined: {
		borderLeftWidth: SPINE,
	},
	body: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingLeft: 11,
		paddingVertical: 9,
	},
	rail: {
		width: RAIL,
	},
	time: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
	},
	endTime: {
		fontFamily: fontFamily.regular,
		fontSize: type.xs,
		marginTop: 1,
	},
	text: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
	context: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		marginTop: 2,
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
	assignee: {
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	assigneeText: {
		fontFamily: fontFamily.semibold,
		fontSize: 10,
	},
});
