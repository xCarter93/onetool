import React from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	fontFamily,
	radii,
	recordTint,
	STATUS,
	touch,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { formatClockLabel, type AgendaTask } from "@/lib/agenda";

interface NextUpCardProps {
	task: AgendaTask;
	updating: boolean;
	onToggle: () => void;
	onOpen: () => void;
	/** Team scope initials chip; undefined in Me scope. */
	assignee?: { initials: string; name: string };
}

/**
 * The day's lead object — the first still-open timed job, promoted out of the
 * timeline into a card (Jobber's next-visit card, Zocdoc's "Up next"). It owns
 * the moment below the ink hero, so the time is the headline, not row metadata.
 *
 * It carries the SAME checkbox contract as `AgendaRow`: checking off the current
 * job is the field worker's most frequent action, and a tap-to-open-only card
 * would make the lead object harder to finish than the row it replaced.
 *
 * `selectNextUp` guarantees this only renders when the anchored day is today and
 * an open timed job remains, so there is no gating to repeat here.
 */
export function NextUpCard({
	task,
	updating,
	onToggle,
	onOpen,
	assignee,
}: NextUpCardProps) {
	const t = useTokens();
	const timeLabel = formatClockLabel(task.startTime);
	const endLabel = formatClockLabel(task.endTime);
	// Status-as-text, not a pill — Daybook grammar. "Pending" is the unremarkable
	// default and would just add a word to every card.
	const status =
		task.status && task.status !== "pending"
			? STATUS[task.status as keyof typeof STATUS]
			: undefined;

	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: t.card,
					borderColor: t.line,
					borderLeftColor: recordTint.task.fg,
				},
			]}
		>
			<Pressable
				onPress={onOpen}
				style={styles.body}
				accessibilityRole="button"
				accessibilityLabel={[
					"Next up",
					timeLabel,
					task.title,
					task.context,
					status?.label,
					assignee && `assigned to ${assignee.name}`,
				]
					.filter(Boolean)
					.join(", ")}
			>
				<View style={styles.eyebrowRow}>
					<Text style={[styles.eyebrow, { color: t.faint }]}>NEXT UP</Text>
					{status ? (
						<Text style={[styles.status, { color: status.c }]}>
							{status.label}
						</Text>
					) : null}
				</View>

				<View style={styles.timeRow}>
					<Text style={[styles.time, { color: t.ink }]}>
						{timeLabel ?? "Anytime"}
					</Text>
					{endLabel ? (
						<Text style={[styles.until, { color: t.sub }]}>till {endLabel}</Text>
					) : null}
				</View>

				<Text
					style={[styles.title, { color: t.ink }]}
					numberOfLines={2}
				>
					{task.title}
				</Text>
				{task.context ? (
					<Text style={[styles.context, { color: t.sub }]} numberOfLines={1}>
						{task.context}
					</Text>
				) : null}
			</Pressable>

			{/* Sibling of the body, never nested — two intents, two targets. */}
			<View style={styles.side}>
				<Pressable
					onPress={onToggle}
					disabled={updating}
					hitSlop={6}
					style={styles.checkTarget}
					accessibilityRole="checkbox"
					accessibilityState={{ checked: false, disabled: updating }}
					accessibilityLabel={`Mark ${task.title} done`}
				>
					{updating ? (
						<ActivityIndicator size="small" color={t.sub} />
					) : (
						<View style={[styles.box, { borderColor: t.checkbox }]} />
					)}
				</Pressable>
				{assignee ? (
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
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		borderWidth: 1,
		borderLeftWidth: 3,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	body: {
		flex: 1,
		minWidth: 0,
		paddingVertical: 13,
		paddingLeft: 14,
		paddingRight: 6,
		gap: 2,
	},
	eyebrowRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 8,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
	},
	status: {
		fontFamily: fontFamily.semibold,
		fontSize: type.micro,
	},
	timeRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 7,
		marginTop: 3,
	},
	time: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h1,
		letterSpacing: tracking.title,
	},
	until: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginTop: 3,
	},
	context: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	side: {
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingRight: 8,
	},
	checkTarget: {
		width: touch.min,
		height: touch.min,
		alignItems: "center",
		justifyContent: "center",
	},
	box: {
		width: 24,
		height: 24,
		borderRadius: radii.xs,
		borderWidth: 1.5,
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
