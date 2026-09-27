import { StyleSheet, Text, View } from "react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
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

function titleCase(label: string): string {
	return label.charAt(0) + label.slice(1).toLowerCase();
}

/** 6-month collected bar chart (frame 2e): plain chart4 bars, current month in chart1. */
export function CollectedChart({ months }: { months: MonthBucket[] }) {
	const t = useTokens();
	const max = Math.max(...months.map((m) => m.value), 1);
	const current = months.at(-1);

	return (
		<View>
			<View
				style={styles.track}
				accessibilityLabel={`Collected by month: ${months
					.map((m) => `${m.label} ${formatCurrency(m.value)}`)
					.join(", ")}`}
			>
				{months.map((m, i) => {
					const isCurrent = i === months.length - 1;
					const color = m.value > 0 ? (isCurrent ? t.chart1 : t.chart4) : t.lineSoft;
					const height = Math.max(
						Math.round((m.value / max) * TRACK_HEIGHT),
						m.value > 0 ? 6 : 2
					);
					return (
						<View key={m.label + i} style={styles.barCol}>
							<View style={[styles.bar, { height, backgroundColor: color }]} />
						</View>
					);
				})}
			</View>
			<View style={styles.labels}>
				{months.map((m, i) => (
					<Text key={m.label + i} style={[styles.barLabel, { color: t.sub }]}>
						{titleCase(m.label)}
					</Text>
				))}
			</View>
			{current ? (
				<Text style={[styles.caption, { color: t.sub }]}>
					Collected in {titleCase(current.label)} · {formatCurrency(current.value)}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	track: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: COL_GAP,
		height: TRACK_HEIGHT,
	},
	barCol: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-end",
	},
	bar: {
		width: "100%",
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
		borderBottomLeftRadius: 3,
		borderBottomRightRadius: 3,
	},
	labels: {
		flexDirection: "row",
		gap: COL_GAP,
		marginTop: 6,
	},
	barLabel: {
		flex: 1,
		textAlign: "center",
		fontFamily: fontFamily.medium,
		fontSize: type.micro - 0.5,
	},
	caption: {
		marginTop: 10,
		textAlign: "center",
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
});
