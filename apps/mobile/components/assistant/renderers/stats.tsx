import { StyleSheet, Text, View } from "react-native";
import { formatCurrency } from "@/lib/format";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Panel, text } from "./panel";

// Mirrors HomeStats in convex/homeStats.ts (only the fields shown here).
interface HomeStatsOutput {
	totalClients: { current: number };
	completedProjects: { current: number; totalValue: number };
	approvedQuotes: { current: number; totalValue: number };
	invoicesPaid: { current: number; totalValue: number; outstanding: number };
	revenueGoal: { percentage: number; current: number; target: number };
	pendingTasks: { total: number; dueThisWeek: number };
}

const count = (n: number) => n.toLocaleString("en-US");

function Figure({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
	const t = useTokens();
	return (
		<View style={styles.figure}>
			<Text style={[styles.label, { color: t.sub }]}>{label}</Text>
			<Text style={[text.number, { color: t.ink }]}>{value}</Text>
			{secondary ? (
				<Text style={[styles.label, styles.tabular, { color: t.sub }]}>{secondary}</Text>
			) : null}
		</View>
	);
}

export function BusinessStatsRenderer({ output }: { output: unknown }) {
	const t = useTokens();
	const stats = output as HomeStatsOutput | undefined;
	if (!stats?.totalClients || !stats.revenueGoal) return null;
	const goal = stats.revenueGoal;

	return (
		<Panel>
			<View style={styles.grid}>
				<Figure label="Clients" value={count(stats.totalClients.current)} />
				<Figure
					label="Completed projects"
					value={count(stats.completedProjects.current)}
					secondary={formatCurrency(stats.completedProjects.totalValue)}
				/>
				<Figure
					label="Approved quotes"
					value={count(stats.approvedQuotes.current)}
					secondary={formatCurrency(stats.approvedQuotes.totalValue)}
				/>
				<Figure
					label="Invoices paid"
					value={count(stats.invoicesPaid.current)}
					secondary={formatCurrency(stats.invoicesPaid.totalValue)}
				/>
				<Figure label="Outstanding" value={formatCurrency(stats.invoicesPaid.outstanding)} />
				<Figure
					label="Pending tasks"
					value={count(stats.pendingTasks.total)}
					secondary={`${stats.pendingTasks.dueThisWeek} due this week`}
				/>
			</View>
			{goal.target > 0 ? (
				<View style={[styles.goal, { borderTopColor: t.lineSoft }]}>
					<View style={styles.goalLine}>
						<Text style={[styles.label, { color: t.sub }]}>Revenue goal</Text>
						<Text style={[styles.label, styles.tabular, { color: t.ink }]}>
							{formatCurrency(goal.current)} of {formatCurrency(goal.target)}
						</Text>
					</View>
					<View
						style={[styles.track, { backgroundColor: t.secondary }]}
						accessibilityRole="progressbar"
						accessibilityValue={{ min: 0, max: 100, now: Math.min(goal.percentage, 100) }}
					>
						<View
							style={[
								styles.fill,
								{ backgroundColor: t.primary, width: `${Math.min(goal.percentage, 100)}%` },
							]}
						/>
					</View>
				</View>
			) : null}
		</Panel>
	);
}

const styles = StyleSheet.create({
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		rowGap: 12,
		paddingVertical: 2,
	},
	figure: { width: "50%", paddingRight: 12 },
	label: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	tabular: { fontVariant: ["tabular-nums"] },
	goal: {
		borderTopWidth: 1,
		marginTop: 12,
		paddingTop: 10,
		gap: 6,
	},
	goalLine: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
	},
	track: {
		height: 6,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	fill: {
		height: "100%",
		borderRadius: radii.pill,
	},
});
