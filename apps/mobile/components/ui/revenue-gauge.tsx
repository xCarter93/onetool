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
	// iPad-landscape only. Default false → iPhone / iPad-portrait byte-identical.
	// When true, content spreads across the full card: larger ring, primary
	// revenue block, flexible spacer, then trend+to-go right-aligned on the far
	// right (with a vertical hairline divider before them).
	wide?: boolean;
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
	wide = false,
}: RevenueGaugeProps) {
	const t = useTokens();
	const clamped = Math.min(Math.max(Math.round(pct), 0), 100);

	// iPad-landscape: spread content across the full card width. Larger ring,
	// primary revenue block, flexible spacer, then a hairline divider and the
	// secondary metrics (trend chip + to-go) right-aligned on the far right.
	if (wide) {
		return (
			<View style={[styles.card, styles.cardWide, GRADIENT]}>
				<Ring
					pct={pct}
					size={120}
					stroke={13}
					color={t.accent}
					track="rgba(255,255,255,0.12)"
				>
					<Text style={styles.ringPctWide}>{clamped}%</Text>
					<Text style={styles.ringLabel}>of goal</Text>
				</Ring>
				<View style={styles.metaWide}>
					<Text style={styles.eyebrow}>{label}</Text>
					<Text style={styles.valueWide} numberOfLines={1}>
						{value}
					</Text>
					<Text style={styles.goal} numberOfLines={1}>
						{goal}
					</Text>
				</View>
				<View style={styles.spacer} />
				{trend || toGo ? (
					<>
						<View style={styles.dividerWide} />
						<View style={styles.secondaryWide}>
							{trend ? (
								<View style={styles.trendChip}>
									<Text style={styles.trendText} numberOfLines={1}>
										{trend}
									</Text>
								</View>
							) : null}
							{toGo ? (
								<Text style={styles.toGoWide} numberOfLines={1}>
									{toGo}
								</Text>
							) : null}
						</View>
					</>
				) : null}
			</View>
		);
	}

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
	// iPad-landscape: roomier padding + wider gap so the full-width spread reads
	// balanced (overrides the base gap/padding via the [card, cardWide] cascade).
	cardWide: {
		gap: 28,
		paddingVertical: 28,
		paddingHorizontal: 32,
	},
	ringPct: {
		fontFamily: fontFamily.bold,
		fontSize: 20,
		color: "#ffffff",
	},
	ringPctWide: {
		fontFamily: fontFamily.bold,
		fontSize: 24,
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
	// iPad-landscape: the primary revenue block sits next to the ring (NOT flex:1
	// — the flexible spacer below pushes the secondary metrics to the far right).
	metaWide: {
		flexShrink: 0,
	},
	// Flexible gap that pushes the secondary metrics to the far right edge.
	spacer: {
		flex: 1,
	},
	// Subtle vertical hairline before the right-aligned secondary metrics.
	dividerWide: {
		width: StyleSheet.hairlineWidth,
		alignSelf: "stretch",
		marginVertical: 4,
		backgroundColor: "rgba(255,255,255,0.12)",
	},
	// Right-aligned secondary metrics column (trend chip over the to-go line).
	secondaryWide: {
		alignItems: "flex-end",
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
	valueWide: {
		fontFamily: fontFamily.bold,
		fontSize: 28,
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
	// iPad-landscape to-go line — right-aligned under the trend chip.
	toGoWide: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		color: "rgba(255,255,255,0.55)",
		marginTop: 8,
		textAlign: "right",
	},
});
