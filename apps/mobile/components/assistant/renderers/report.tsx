import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { TriangleAlert } from "lucide-react-native";
import { Badge } from "@/components/ui";
import {
	buildReportView,
	type ReportRow,
} from "@/lib/assistant-renderers";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Divided, EmptyPanel, Panel, text } from "./panel";

const CHART_HEIGHT = 132;
const CHART_INSET = 6;

// Every visualization except line collapses to a bar list: pies, radars and
// label-heavy columns don't read at phone width, bars do. Like web, only the
// table ranks by value; charts keep backend order so months stay chronological.
export function ReportRenderer({ output }: { output: unknown }) {
	const t = useTokens();
	const view = buildReportView(output);
	if (!view) return null;
	if (view.ranked.length === 0) return <EmptyPanel>No data for that report.</EmptyPanel>;

	const asLine = view.visualization === "line" && view.ordered.length >= 2;
	const ranked = view.visualization === "table";
	const barRows = ranked ? view.ranked : view.ordered;

	return (
		<Panel>
			{view.truncated ? (
				<View
					style={[
						styles.notice,
						{ backgroundColor: t.warningBg, borderColor: t.warningLine },
					]}
				>
					<TriangleAlert size={12} color={t.warning} />
					<Text style={[styles.meta, { color: t.warning, flex: 1 }]}>
						This report hit the record limit, so results may be incomplete.
					</Text>
				</View>
			) : null}
			<View style={styles.summary}>
				<Text style={[styles.meta, { color: t.sub }]}>
					{view.ranked.length} {view.ranked.length === 1 ? "row" : "rows"}
				</Text>
				<Text style={[text.number, { color: t.ink }]}>Total {view.totalText}</Text>
			</View>
			{asLine ? <LineChart rows={view.ordered} /> : null}
			{asLine
				? view.ordered.map((row, i) => (
						<Divided key={`${row.label}-${i}`} first={i === 0}>
							<View style={styles.valueRow}>
								<Text style={[text.primary, styles.flex, { color: t.ink }]} numberOfLines={1}>
									{row.label}
								</Text>
								<Text style={[text.number, { color: t.ink }]}>{row.valueText}</Text>
							</View>
						</Divided>
					))
				: barRows.map((row, i) => (
						<Divided key={`${row.label}-${i}`} first={i === 0}>
							<BarRow row={row} top={ranked && i === 0 && barRows.length > 1} />
						</Divided>
					))}
			<Text style={[styles.meta, styles.footer, { color: t.sub, borderTopColor: t.lineSoft }]}>
				Average {view.averageText} per category
			</Text>
		</Panel>
	);
}

function BarRow({ row, top }: { row: ReportRow; top: boolean }) {
	const t = useTokens();
	return (
		<View style={styles.barRow}>
			<View style={[styles.valueRow, styles.barLabel]}>
				<View style={styles.labelCell}>
					<Text style={[text.primary, styles.shrink, { color: t.ink }]} numberOfLines={1}>
						{row.label}
					</Text>
					{top ? <Badge status="top" tone="mute" label="Top" /> : null}
				</View>
				<Text style={[text.number, { color: t.ink }]}>{row.valueText}</Text>
			</View>
			<View style={[styles.valueRow, styles.barTrack]}>
				<View style={[styles.track, { backgroundColor: t.secondary }]}>
					<View
						style={[
							styles.fill,
							{ backgroundColor: t.primary, width: `${row.ratio * 100}%` },
						]}
					/>
				</View>
				<Text style={[styles.meta, styles.percent, { color: t.sub }]}>{row.percent}</Text>
			</View>
		</View>
	);
}

function LineChart({ rows }: { rows: ReportRow[] }) {
	const t = useTokens();
	const [width, setWidth] = useState(0);
	const max = Math.max(0, ...rows.map((r) => r.value)) || 1;
	const peak = rows.reduce((best, r) => (r.value > best.value ? r : best), rows[0]);
	const plotHeight = CHART_HEIGHT - CHART_INSET * 2;
	const x = (i: number) => CHART_INSET + (i * (width - CHART_INSET * 2)) / (rows.length - 1);
	const y = (value: number) =>
		CHART_INSET + plotHeight - (Math.max(0, value) / max) * plotHeight;

	return (
		<View
			style={styles.chart}
			accessible
			accessibilityLabel={`Line chart, peak ${peak.valueText} in ${peak.label}`}
		>
			<Text style={[styles.axis, { color: t.sub }]}>{peak.valueText}</Text>
			<View
				style={{ height: CHART_HEIGHT }}
				onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
			>
				{width > 0 ? (
					<Svg width={width} height={CHART_HEIGHT}>
						<Line x1={0} x2={width} y1={y(max)} y2={y(max)} stroke={t.lineSoft} strokeWidth={1} />
						<Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={t.line} strokeWidth={1} />
						<Polyline
							points={rows.map((r, i) => `${x(i)},${y(r.value)}`).join(" ")}
							fill="none"
							stroke={t.chart1}
							strokeWidth={2}
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
						{rows.map((r, i) => (
							<Circle
								key={i}
								cx={x(i)}
								cy={y(r.value)}
								r={3}
								fill={t.card}
								stroke={t.chart1}
								strokeWidth={2}
							/>
						))}
					</Svg>
				) : null}
			</View>
			<View style={styles.valueRow}>
				<Text style={[styles.axis, { color: t.sub }]} numberOfLines={1}>
					{rows[0].label}
				</Text>
				<Text style={[styles.axis, { color: t.sub }]} numberOfLines={1}>
					{rows[rows.length - 1].label}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	shrink: { flexShrink: 1 },
	meta: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	notice: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: radii.card,
		paddingHorizontal: 10,
		paddingVertical: 6,
		marginBottom: 8,
	},
	summary: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		paddingBottom: 6,
	},
	valueRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
		paddingVertical: 6,
	},
	labelCell: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minWidth: 0,
	},
	barRow: {
		paddingVertical: 4,
	},
	barLabel: { paddingBottom: 2 },
	barTrack: { paddingTop: 0 },
	track: {
		flex: 1,
		height: 6,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	fill: {
		height: "100%",
		borderRadius: radii.pill,
	},
	percent: {
		width: 48,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
	chart: {
		paddingBottom: 4,
	},
	axis: {
		fontFamily: fontFamily.regular,
		fontSize: type.xs,
		fontVariant: ["tabular-nums"],
	},
	footer: {
		borderTopWidth: 1,
		paddingTop: 8,
		marginTop: 2,
	},
});
