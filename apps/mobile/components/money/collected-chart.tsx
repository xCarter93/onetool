import { useId, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";
import { Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export interface MonthBucket {
	/** Short month label, e.g. "MAR". */
	label: string;
	/** Dollars collected (paid invoices) in that month. */
	value: number;
}

/** Bar track height in pt — labels live below it, never inside it. */
const TRACK_HEIGHT = 74;
const COL_GAP = 10;

// "Collected · last 6 months" bar card (frame 1d). Values are derived
// client-side from the already-loaded invoice list (paidAt buckets) — no new
// queries, per the slice's existing-data-only rule. Bars ramp through the
// chart tokens and carry the web report charts' diagonal-stripe texture
// (ChartStripeDefs recipe: 8×8 pattern, 10% wash + two stripe passes).
export function CollectedChart({ months }: { months: MonthBucket[] }) {
	const t = useTokens();
	// useId() can contain ":" — not safe inside a `url(#id)` reference.
	const rawId = useId();
	const idPrefix = `collected${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
	// Measured pixel width for the Svg bars (dot-grid precedent: on Fabric,
	// percentage-sized Svg inside an indefinite parent escapes its box).
	const [trackWidth, setTrackWidth] = useState(0);
	const onTrackLayout = (e: LayoutChangeEvent) =>
		setTrackWidth(e.nativeEvent.layout.width);

	const max = Math.max(...months.map((m) => m.value), 1);
	const ramp = [t.chart5, t.chart4, t.chart4, t.chart3, t.chart3, t.chart1];
	const total = months.reduce((s, m) => s + m.value, 0);
	const colWidth =
		trackWidth > 0
			? (trackWidth - COL_GAP * (months.length - 1)) / months.length
			: 0;

	return (
		<Card style={styles.card}>
			<View style={styles.headRow}>
				<Text style={[styles.eyebrow, { color: t.faint }]}>
					COLLECTED · LAST 6 MONTHS
				</Text>
				<Text style={[styles.total, { color: t.success }]}>
					{formatCurrency(total)}
				</Text>
			</View>
			<View
				style={styles.track}
				onLayout={onTrackLayout}
				accessibilityLabel={`Collected by month: ${months
					.map((m) => `${m.label} ${formatCurrency(m.value)}`)
					.join(", ")}`}
			>
				{months.map((m, i) => {
					const color = m.value > 0 ? ramp[i] ?? t.chart3 : t.lineSoft;
					const height = Math.max(
						Math.round((m.value / max) * TRACK_HEIGHT),
						m.value > 0 ? 6 : 2
					);
					const barWidth = Math.max(Math.floor(colWidth), 0);
					return (
						<View key={m.label + i} style={styles.barCol}>
							{barWidth > 0 ? (
								<View style={[styles.barClip, { height }]}>
									{m.value > 0 ? (
										<StripedBar
											id={`${idPrefix}${i}`}
											width={barWidth}
											height={height}
											color={color}
										/>
									) : (
										<View
											style={{
												width: barWidth,
												height,
												backgroundColor: color,
											}}
										/>
									)}
								</View>
							) : null}
						</View>
					);
				})}
			</View>
			<View style={styles.labels}>
				{months.map((m, i) => {
					const last = i === months.length - 1;
					return (
						<Text
							key={m.label + i}
							style={[
								styles.barLabel,
								{
									color: last ? t.frostedInk : t.faintDecor,
									fontFamily: last
										? fontFamily.semibold
										: fontFamily.medium,
								},
							]}
						>
							{m.label}
						</Text>
					);
				})}
			</View>
		</Card>
	);
}

// Web parity: components/charts/chart-stripe-defs.tsx — 8×8 userSpaceOnUse
// pattern, 10%-alpha wash, 1.5pt stripes at 60% + 1pt stripes at 30%.
function StripedBar({
	id,
	width,
	height,
	color,
}: {
	id: string;
	width: number;
	height: number;
	color: string;
}) {
	return (
		<Svg width={width} height={height}>
			<Defs>
				<Pattern
					id={id}
					x={0}
					y={0}
					width={8}
					height={8}
					patternUnits="userSpaceOnUse"
				>
					<Rect width={8} height={8} fill={color} opacity={0.1} />
					<Path
						d="M0,8 L8,0 M4,12 L12,4 M-4,4 L4,-4"
						stroke={color}
						strokeWidth={1.5}
						opacity={0.6}
					/>
					<Path
						d="M2,10 L10,2 M6,14 L14,6 M-2,6 L6,-2"
						stroke={color}
						strokeWidth={1}
						opacity={0.3}
					/>
				</Pattern>
			</Defs>
			<Rect width={width} height={height} fill={`url(#${id})`} />
			{/* Solid baseline stroke so the bar keeps a crisp top edge. */}
			<Rect width={width} height={2.5} fill={color} />
		</Svg>
	);
}

const styles = StyleSheet.create({
	card: {
		paddingVertical: 14,
		paddingHorizontal: 16,
	},
	headRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 8,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
	},
	total: {
		fontFamily: fontFamily.semibold,
		fontSize: type.rowTitle,
		fontVariant: ["tabular-nums"],
	},
	track: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: COL_GAP,
		height: TRACK_HEIGHT,
		marginTop: 14,
	},
	barCol: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-end",
	},
	barClip: {
		width: "100%",
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
		borderBottomLeftRadius: 3,
		borderBottomRightRadius: 3,
		overflow: "hidden",
	},
	labels: {
		flexDirection: "row",
		gap: COL_GAP,
		marginTop: 6,
	},
	barLabel: {
		flex: 1,
		textAlign: "center",
		fontSize: type.micro - 0.5,
	},
});
