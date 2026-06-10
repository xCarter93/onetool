import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";

interface TotalsRow {
	label: string;
	value: string;
	// Negative rows (e.g. Discount) render with a leading "−" + danger tint.
	negative?: boolean;
}

interface TotalsBlockProps {
	rows: TotalsRow[];
	total: { label: string; value: string };
}

// Shared KV totals layout for the quote + invoice detail screens (23-03/23-04).
// Callers build the rows/total arrays from their own fields and pass formatted
// strings in (UI-SPEC: Subtotal always · Discount/Tax conditional · Total accent).
export function TotalsBlock({ rows, total }: TotalsBlockProps) {
	const t = useTokens();

	return (
		<View>
			{rows.map((row, i) => (
				<View key={`${row.label}-${i}`} style={styles.row}>
					<Text style={[styles.label, { color: t.sub }]}>{row.label}</Text>
					<Text
						style={[
							styles.value,
							{ color: row.negative ? t.danger : t.ink },
						]}
					>
						{row.negative ? "−" : ""}
						{row.value}
					</Text>
				</View>
			))}
			<View style={[styles.divider, { backgroundColor: t.line }]} />
			<View style={styles.totalRow}>
				<Text style={[styles.totalLabel, { color: t.ink }]}>
					{total.label}
				</Text>
				<Text style={[styles.totalValue, { color: t.accent }]}>
					{total.value}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	label: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	value: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
	},
	divider: {
		height: 1,
		marginVertical: 8,
	},
	totalRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	totalLabel: {
		fontFamily: fontFamily.bold,
		fontSize: type.h3,
	},
	totalValue: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
	},
});
