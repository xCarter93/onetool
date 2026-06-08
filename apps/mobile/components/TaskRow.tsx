import React from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Check } from "lucide-react-native";
import { Avatar, Badge } from "@/components/ui";
import { fontFamily, type, useTokens } from "@/lib/theme";

type TaskStatus = "pending" | "in-progress" | "completed" | "cancelled";

interface TaskRowProps {
	title: string;
	dateLabel: string;
	timeLabel?: string;
	clientName?: string;
	status: TaskStatus;
	assigneeText: string;
	assigneeImage?: string | null;
	assigneeName?: string;
	isCompleted: boolean;
	isUpdating: boolean;
	isLast: boolean;
	onToggle: () => void;
	onOpen: () => void;
}

export function TaskRow({
	title,
	dateLabel,
	timeLabel,
	clientName,
	status,
	assigneeText,
	assigneeImage,
	assigneeName,
	isCompleted,
	isUpdating,
	isLast,
	onToggle,
	onOpen,
}: TaskRowProps) {
	const t = useTokens();
	const isCancelled = status === "cancelled";
	const showBadge = status === "in-progress" || status === "cancelled";

	// Checked fill/border MUST be accent (UI-SPEC), never success/green.
	const boxBorder = isCompleted ? t.accent : "#cdd4dd";
	const boxBg = isCompleted ? t.accent : "transparent";

	const titleColor = isCompleted || isCancelled ? t.faint : t.ink;
	const subParts = [dateLabel, timeLabel, clientName].filter(Boolean);

	return (
		<View
			style={[
				styles.row,
				{
					borderBottomWidth: isLast ? 0 : 1,
					borderBottomColor: t.line,
				},
			]}
		>
			<Pressable
				onPress={onToggle}
				hitSlop={10}
				disabled={isUpdating}
				accessibilityRole="button"
				accessibilityLabel={isCompleted ? "Mark not complete" : "Mark complete"}
				style={[styles.box, { borderColor: boxBorder, backgroundColor: boxBg }]}
			>
				{isUpdating ? (
					<ActivityIndicator size="small" color={isCompleted ? "#fff" : t.faint} />
				) : isCompleted ? (
					<Check size={16} color="#fff" strokeWidth={3} />
				) : null}
			</Pressable>

			<Pressable
				onPress={onOpen}
				accessibilityRole="button"
				style={styles.body}
			>
				<Text
					numberOfLines={1}
					style={[
						styles.title,
						{ color: titleColor },
						isCompleted && styles.struck,
					]}
				>
					{title}
				</Text>
				{subParts.length > 0 && (
					<Text numberOfLines={1} style={[styles.subline, { color: t.sub }]}>
						{subParts.join(" · ")}
					</Text>
				)}
				{showBadge && (
					<View style={styles.badgeRow}>
						<Badge status={status} />
					</View>
				)}
			</Pressable>

			<View
				accessibilityLabel={
					assigneeName ? "Assigned to " + assigneeName : "Unassigned"
				}
			>
				<Avatar text={assigneeText} imageUrl={assigneeImage} size={28} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 8,
	},
	box: {
		width: 28,
		height: 28,
		borderRadius: 9,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	body: {
		flex: 1,
		minWidth: 0,
		minHeight: 44,
		justifyContent: "center",
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
	},
	struck: {
		textDecorationLine: "line-through",
	},
	subline: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		marginTop: 2,
	},
	badgeRow: {
		marginTop: 5,
		flexDirection: "row",
	},
});
