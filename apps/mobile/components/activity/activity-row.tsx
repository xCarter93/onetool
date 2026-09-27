import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, icons } from "lucide-react-native";
import { fontFamily, radii, recordTint, spacing, useTokens } from "@/lib/theme";
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

/**
 * One business event, rendered as a Panel row: type tile, description and
 * record name, relative-time stamp, chevron. Tappable only when the underlying
 * record has a mobile detail route (payments / users / the org itself do not).
 */
export function ActivityRow({
	activity,
	nowMs,
	onPress,
	selected,
}: {
	activity: ActivityDisplay;
	/** Seeded once by the screen; render must stay pure (no Date.now() here). */
	nowMs: number;
	onPress?: () => void;
	selected?: boolean;
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
				selected && { backgroundColor: t.frostedBg, boxShadow: `inset 2px 0 0 ${t.primary}` },
				pressed && { backgroundColor: t.muted },
			]}
		>
			<View style={[styles.tile, { backgroundColor: tint?.bg ?? t.secondary }]}>
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
			<Text style={[styles.stamp, { color: t.sub }]}>{stamp}</Text>
			{onPress ? <ChevronRight size={16} color={t.input} strokeWidth={2} /> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		minHeight: 56,
		paddingVertical: 11,
		paddingHorizontal: 12,
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
		fontSize: 14,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	record: {
		fontFamily: fontFamily.regular,
		fontSize: 12.5,
		flexShrink: 1,
	},
	stamp: {
		fontFamily: fontFamily.medium,
		fontSize: 11.5,
		flexShrink: 0,
	},
});
