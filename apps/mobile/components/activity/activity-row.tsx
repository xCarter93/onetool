import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, icons } from "lucide-react-native";
import {
	fontFamily,
	radii,
	recordTint,
	spacing,
	touch,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { Badge } from "@/components/ui";
import { formatRelativeTime } from "@/lib/notification-utils";
import {
	compactRelativeTime,
	type ActivityDisplay,
	type ActivityIconKey,
} from "@/lib/activity-feed";

// Aliased so the lookup is a plain value (import/namespace can't validate a
// computed key on an imported namespace). The annotation is also the compile-time
// proof that every ActivityIconKey really exists in lucide.
const ICONS: Record<ActivityIconKey, (typeof icons)[keyof typeof icons]> = icons;

/** Day divider between groups of rows. "Today" / "Yesterday" / "Jul 12". */
export function ActivityDayHeader({
	label,
	count,
}: {
	label: string;
	count: number;
}) {
	const t = useTokens();
	return (
		<View
			// Announced as a heading so the day boundary is not silent to VoiceOver.
			accessibilityRole="header"
			accessibilityLabel={`${label}, ${count} ${count === 1 ? "event" : "events"}`}
			style={[styles.dayHeader, { backgroundColor: t.bg }]}
		>
			<Text style={[styles.dayLabel, { color: t.faint }]}>{label}</Text>
			<View style={[styles.dayRule, { backgroundColor: t.lineSoft }]} />
		</View>
	);
}

/**
 * One business event. Tappable only when the underlying record has a mobile
 * detail route (payments / users / the org itself do not) — a row with no
 * destination renders without a chevron and without a button role.
 */
export function ActivityRow({
	activity,
	nowMs,
	onPress,
	last,
}: {
	activity: ActivityDisplay;
	/** Seeded once by the screen; render must stay pure (no Date.now() here). */
	nowMs: number;
	onPress?: () => void;
	last?: boolean;
}) {
	const t = useTokens();
	const Glyph = ICONS[activity.icon];
	const tint = activity.tint ? recordTint[activity.tint] : null;
	const glyphColor = tint?.fg ?? t.sub;
	const stamp = compactRelativeTime(activity.timestamp, nowMs);

	// Spoken label is the full sentence — the "2h" chip is too terse on its own.
	const spoken = [
		activity.description,
		activity.recordName,
		activity.timestamp > 0 ? formatRelativeTime(activity.timestamp) : null,
	]
		.filter(Boolean)
		.join(", ");

	return (
		<Pressable
			onPress={onPress}
			disabled={!onPress}
			accessibilityRole={onPress ? "button" : undefined}
			accessibilityLabel={spoken}
			accessibilityHint={onPress ? "Opens the record" : undefined}
			style={({ pressed }) => [
				styles.row,
				{
					borderBottomColor: t.lineSoft,
					borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
				},
				pressed && styles.pressed,
			]}
		>
			<View
				style={[styles.tile, { backgroundColor: tint?.bg ?? t.secondary }]}
			>
				<Glyph size={17} color={glyphColor} />
			</View>
			<View style={styles.body}>
				<Text style={[styles.description, { color: t.ink }]} numberOfLines={1}>
					{activity.description}
				</Text>
				<View style={styles.metaRow}>
					<Text style={[styles.record, { color: t.sub }]} numberOfLines={1}>
						{activity.recordName}
					</Text>
					{activity.status ? <Badge status={activity.status} /> : null}
				</View>
			</View>
			<Text style={[styles.stamp, { color: t.faint }]}>{stamp}</Text>
			{onPress ? <ChevronRight size={16} color={// Informational, not decorative: the chevron is the only cue that this
					// row navigates while an unlinked neighbour does not, so it owes 3:1.
					t.checkbox} /> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	dayHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingTop: spacing.lg,
		paddingBottom: spacing.sm,
		paddingHorizontal: spacing.xs,
	},
	dayLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
		textTransform: "uppercase",
	},
	dayRule: {
		flex: 1,
		height: 1,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		minHeight: touch.min,
		paddingVertical: 11,
		paddingHorizontal: spacing.sm,
	},
	pressed: {
		opacity: 0.7,
	},
	tile: {
		width: 32,
		height: 32,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	body: {
		flex: 1,
		minWidth: 0,
		gap: 3,
	},
	description: {
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	record: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		flexShrink: 1,
	},
	stamp: {
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
		flexShrink: 0,
	},
});
