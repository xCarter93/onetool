import { StyleSheet, Text, View } from "react-native";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";
import { Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export interface MonthBucket {
	/** Short month label, e.g. "MAR". */
	label: string;
	/** Dollars collected (paid invoices) in that month. */
	value: number;
}

// "Collected · last 6 months" bar card (frame 1d). Values are derived
// client-side from the already-loaded invoice list (paidAt buckets) — no new
// queries, per the slice's existing-data-only rule. Bars ramp through the
// chart tokens so the newest month reads strongest.
export function CollectedChart({ months }: { months: MonthBucket[] }) {
	const t = useTokens();
	const max = Math.max(...months.map((m) => m.value), 1);
	const ramp = [t.chart5, t.chart4, t.chart4, t.chart3, t.chart3, t.chart1];
	const total = months.reduce((s, m) => s + m.value, 0);

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
				style={styles.bars}
				accessibilityLabel={`Collected by month: ${months
					.map((m) => `${m.label} ${formatCurrency(m.value)}`)
					.join(", ")}`}
			>
				{months.map((m, i) => {
					const last = i === months.length - 1;
					return (
						<View key={m.label + i} style={styles.barCol}>
							<View
								style={[
									styles.bar,
									{
										height: `${Math.max(Math.round((m.value / max) * 100), m.value > 0 ? 8 : 3)}%`,
										backgroundColor:
											m.value > 0 ? ramp[i] ?? t.chart3 : t.lineSoft,
									},
								]}
							/>
							<Text
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
						</View>
					);
				})}
			</View>
		</Card>
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
	bars: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 10,
		height: 74,
		marginTop: 12,
	},
	barCol: {
		flex: 1,
		height: "100%",
		justifyContent: "flex-end",
		alignItems: "center",
		gap: 5,
	},
	bar: {
		width: "100%",
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
		borderBottomLeftRadius: 3,
		borderBottomRightRadius: 3,
	},
	barLabel: {
		fontSize: type.micro - 0.5,
	},
});
