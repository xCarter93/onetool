import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, radii, tracking, type, useTokens } from "@/lib/theme";

interface PlanSectionProps {
	/** Group label above the rows ("ALL DAY", "SCHEDULE", "Today"). */
	label: string;
	/** Right-aligned count or time hint. Optional — omit for a bare label. */
	meta?: string;
	/** Renders the label in sentence case (List view day headers). */
	tone?: "eyebrow" | "day";
	children: React.ReactNode;
}

/**
 * The one grouped-rows shell both schedule views use, so the Day timeline and
 * the upcoming List can't drift apart on label weight, gap or row-card border.
 */
export function PlanSection({
	label,
	meta,
	tone = "eyebrow",
	children,
}: PlanSectionProps) {
	const t = useTokens();
	const day = tone === "day";
	return (
		<View style={styles.group}>
			<View style={styles.header}>
				<Text
					accessibilityRole="header"
					style={[
						day ? styles.dayLabel : styles.groupLabel,
						{ color: day ? t.ink : t.faint },
					]}
				>
					{day ? label : label.toUpperCase()}
				</Text>
				{meta ? (
					<Text style={[styles.meta, { color: t.faint }]}>{meta}</Text>
				) : null}
			</View>
			<View
				style={[
					styles.groupCard,
					{ backgroundColor: t.card, borderColor: t.line },
				]}
			>
				{children}
			</View>
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
		gap: 8,
	},
	groupLabel: {
		flex: 1,
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
	},
	dayLabel: {
		flex: 1,
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	meta: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
	groupCard: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
});
