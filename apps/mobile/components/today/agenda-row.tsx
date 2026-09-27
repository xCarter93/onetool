import React, { useRef } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Swipeable, {
	type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Check } from "lucide-react-native";
import {
	fontFamily,
	radii,
	touch,
	type,
	useTokens,
} from "@/lib/theme";
import { formatClockLabel, type AgendaTask } from "@/lib/agenda";
import { useExclusiveSwipe } from "@/lib/swipe-registry";

const BOX = 22;
/** Left time rail. Fixed so every title starts on the same column, timed or not. */
const RAIL = 58;

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
 * One line of Today's timeline: a left time rail (Timepage), then the title block, then the checkbox.
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

	const swipeableRef = useRef<SwipeableMethods>(null);
	const exclusiveSwipe = useExclusiveSwipe(swipeableRef);
	// RNGH #3481: releasing a swipe can fire a spurious onPress on the child.
	const suppressPressUntil = useRef(0);
	const guardedOpen = () => {
		if (Date.now() < suppressPressUntil.current) return;
		onOpen();
	};
	const suppressPress = () => {
		suppressPressUntil.current = Date.now() + 500;
	};
	const swipeToggle = () => {
		swipeableRef.current?.close();
		onToggle();
	};

	const renderRightActions = () => (
		<Pressable
			onPress={swipeToggle}
			style={[
				styles.swipeAction,
				{ backgroundColor: done ? t.checkbox : t.success },
			]}
			accessibilityRole="button"
			accessibilityLabel={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
		>
			<Text style={styles.swipeActionText}>{done ? "Not done" : "Done"}</Text>
		</Pressable>
	);

	const row = (
		<View
			style={[
				styles.row,
				!last && { borderBottomWidth: 1, borderBottomColor: t.lineSoft },
			]}
		>
			<Pressable
				onPress={guardedOpen}
				style={styles.body}
				accessibilityRole="button"
				accessibilityLabel={[
					task.title,
					timeLabel,
					endLabel && `till ${endLabel}`,
					task.context,
					// The chip only shows initials — the full name belongs here.
					assignee && `assigned to ${assignee.name}`,
				]
					.filter(Boolean)
					.join(", ")}
				// Swipe's visible alternative is the checkbox below; this mirrors the
				// same action for VoiceOver users, who can't perform the swipe gesture.
				accessibilityActions={
					cancelled
						? undefined
						: [{ name: "toggleDone", label: done ? "Mark not done" : "Mark done" }]
				}
				onAccessibilityAction={(event) => {
					if (event.nativeEvent.actionName === "toggleDone") onToggle();
				}}
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
					{/* Capped, not resized — a grown circle would collide with the checkbox. */}
					<Text
						style={[styles.assigneeText, { color: t.frostedInk }]}
						maxFontSizeMultiplier={1.2}
					>
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
				accessibilityState={{
					checked: done,
					disabled: updating || cancelled,
				}}
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

	// Cancelled tasks have no toggle, so a reveal that does nothing would confuse.
	if (cancelled) return row;

	return (
		<Swipeable
			ref={swipeableRef}
			friction={2}
			rightThreshold={40}
			overshootRight={false}
			enabled={!updating}
			renderRightActions={renderRightActions}
			onSwipeableWillOpen={() => {
				suppressPress();
				exclusiveSwipe.onOpen();
			}}
			onSwipeableWillClose={suppressPress}
			onSwipeableClose={exclusiveSwipe.onClose}
			onSwipeableOpenStartDrag={suppressPress}
			onSwipeableCloseStartDrag={suppressPress}
		>
			{row}
		</Swipeable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: touch.min,
	},
	body: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingLeft: 14,
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
	swipeAction: {
		width: 96,
		alignItems: "center",
		justifyContent: "center",
	},
	swipeActionText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
		color: "#fff",
	},
});
