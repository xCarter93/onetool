import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";
import { Panel } from "@/components/canvas";

interface GroupLabelProps {
	/** Group label ("ALL DAY", "SCHEDULE") or a day heading ("Today"). */
	label: string;
	/** Right-aligned count or time hint. Optional — omit for a bare label. */
	meta?: string;
	/** Renders the label in sentence case (List view day headers). */
	tone?: "eyebrow" | "day";
	/** True when this row sits INSIDE a shared `Panel` as a divider between
	 * groups (day-plan.tsx) — gets a table-head fill. False (default) is the
	 * bare label above its own `Panel` (List view's per-day sections). */
	inset?: boolean;
}

/** A group-label row — an eyebrow ("ALL DAY") or a day heading ("Today"), plus
 * an optional meta count. */
export function GroupLabel({ label, meta, tone = "eyebrow", inset = false }: GroupLabelProps) {
	const t = useTokens();
	const day = tone === "day";
	return (
		<View style={[styles.header, inset && { backgroundColor: t.muted, paddingHorizontal: 14, paddingVertical: 8 }]}>
			<Text
				accessibilityRole="header"
				style={[
					day ? styles.dayLabel : styles.groupLabel,
					{ color: day ? t.ink : t.sub },
				]}
			>
				{day ? label : label.toUpperCase()}
			</Text>
			{meta ? <Text style={[styles.meta, { color: t.sub }]}>{meta}</Text> : null}
		</View>
	);
}

interface PlanSectionProps extends GroupLabelProps {
	children: React.ReactNode;
}

/**
 * One group as its own bordered panel: a `GroupLabel` above a `Panel` of rows.
 * The List view uses this per day; the Day view merges its groups into one
 * shared `Panel` instead (see day-plan.tsx) and renders `GroupLabel` as a row
 * inside it.
 */
export function PlanSection({ label, meta, tone = "eyebrow", children }: PlanSectionProps) {
	return (
		<View style={styles.group}>
			<GroupLabel label={label} meta={meta} tone={tone} />
			<Panel>{children}</Panel>
		</View>
	);
}

const styles = StyleSheet.create({
	group: {
		gap: 7,
	},
	header: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 8,
		paddingHorizontal: 2,
	},
	groupLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
	},
	dayLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	meta: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
});
