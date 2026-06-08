import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { Ring } from "./ring";

interface RevenueGaugeProps {
	pct: number;
	label: string;
	value: string;
	goal: string;
	// Optional meta-column extras (mockup): a green trend chip + a muted to-go
	// helper line. Additive — existing callers without them are unchanged.
	trend?: string;
	toGo?: string;
}

// MDS-05 dark revenue-goal gauge card. The dark gradient uses RN New Arch
// experimental_backgroundImage (not in core RN types yet — cast below).
const GRADIENT: ViewStyle = {
	experimental_backgroundImage: "linear-gradient(135deg,#0b1220,#1c2734)",
} as unknown as ViewStyle;

export function RevenueGauge({
	pct,
	label,
	value,
	goal,
	trend,
	toGo,
}: RevenueGaugeProps) {
	const t = useTokens();
	const clamped = Math.min(Math.max(Math.round(pct), 0), 100);

	return (
		<View style={[styles.card, GRADIENT]}>
			<Ring
				pct={pct}
				size={96}
				stroke={11}
				color={t.accent}
				track="rgba(255,255,255,0.12)"
			>
				<Text style={styles.ringPct}>{clamped}%</Text>
				<Text style={styles.ringLabel}>of goal</Text>
			</Ring>
			<View style={styles.meta}>
				<Text style={styles.eyebrow}>{label}</Text>
				<Text style={styles.value} numberOfLines={1}>
					{value}
				</Text>
				<Text style={styles.goal} numberOfLines={1}>
					{goal}
				</Text>
				{trend ? (
					<View style={styles.trendChip}>
						<Text style={styles.trendText} numberOfLines={1}>
							{trend}
						</Text>
					</View>
				) : null}
				{toGo ? (
					<Text style={styles.toGo} numberOfLines={1}>
						{toGo}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 20,
		borderRadius: radii.rLg,
		padding: 20,
		backgroundColor: "#0b1220",
	},
	ringPct: {
		fontFamily: fontFamily.bold,
		fontSize: 20,
		color: "#ffffff",
	},
	ringLabel: {
		fontFamily: fontFamily.medium,
		fontSize: 11,
		color: "rgba(255,255,255,0.6)",
		marginTop: 1,
	},
	meta: {
		flex: 1,
		minWidth: 0,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.7,
		textTransform: "uppercase",
		color: "rgba(255,255,255,0.7)",
		marginBottom: 4,
	},
	value: {
		fontFamily: fontFamily.bold,
		fontSize: 20,
		color: "#ffffff",
	},
	goal: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
		color: "rgba(255,255,255,0.6)",
		marginTop: 2,
	},
	trendChip: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(70,217,138,0.16)",
		borderRadius: 9999,
		paddingHorizontal: 8,
		paddingVertical: 2,
		marginTop: 8,
	},
	trendText: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		color: "#46d98a",
	},
	toGo: {
		fontFamily: fontFamily.regular,
		fontSize: 11,
		color: "rgba(255,255,255,0.5)",
		marginTop: 6,
	},
});
