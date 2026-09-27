import { StyleSheet, Text, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@onetool/backend/convex/_generated/api";
import { daysLate } from "@onetool/backend/convex/lib/invoiceLateness";
import { badgeTone, fontFamily, type, useTokens } from "@/lib/theme";
import { Panel, RecordRow } from "@/components/canvas";
import { formatCurrency, formatShortDate } from "@/lib/format";

// Shape comes from the query itself — packages/backend does not export
// businessHealth.ts as a deep entry point, and inferring beats re-declaring.
type AttentionItem = FunctionReturnType<
	typeof api.businessHealth.get
>["needsAttention"][number];

/**
 * "Needs attention" tab of the Money hub: overdue invoices then aging sent
 * quotes, pre-ordered and capped by the backend. Every invoice here is
 * already overdue (businessHealth only ever adds overdue ones), so the days
 * late count needs no extra filtering.
 */
export function NeedsAttention({
	items,
	now,
	today,
	selected = null,
	onOpen,
}: {
	items: AttentionItem[];
	/** Seeded once by the screen — Date.now() during render is a lint error. */
	now: number;
	/** Org-local UTC-midnight epoch, for the same lateness math the backend uses. */
	today: number;
	/** iPad master-detail: marks the row whose record the detail pane shows. */
	selected?: { kind: "quote" | "invoice"; id: string } | null;
	onOpen: (item: AttentionItem) => void;
}) {
	const t = useTokens();

	if (items.length === 0) {
		// Deliberately a quiet row, not an empty state: nothing is wrong, and a
		// full-height illustration would make an absence look like a failure.
		return (
			<Panel>
				<View style={styles.clear}>
					<CheckCircle2 size={17} color={t.success} />
					<Text style={[styles.clearText, { color: t.sub }]}>
						All caught up. Nothing overdue or waiting on a client.
					</Text>
				</View>
			</Panel>
		);
	}

	return (
		<Panel>
			{items.map((item) => {
				const late =
					item.kind === "invoice" && item.dueDate !== undefined
						? daysLate(item.dueDate, today)
						: 0;
				const subtitle =
					item.kind === "invoice" && item.dueDate !== undefined
						? `${item.clientName} · due ${formatShortDate(item.dueDate, now)}`
						: item.sentAt !== undefined
							? `${item.clientName} · sent ${formatShortDate(item.sentAt, now)}`
							: item.clientName;
				return (
					<RecordRow
						key={item.id}
						kind={item.kind}
						title={item.label}
						subtitle={subtitle}
						chevron={false}
						selected={selected?.kind === item.kind && selected.id === item.id}
						right={
							<View style={styles.rightCol}>
								<Text style={[styles.amount, { color: t.ink }]}>
									{formatCurrency(item.amount, { exact: true })}
								</Text>
								{late > 0 ? (
									<Text style={[styles.late, { color: badgeTone.late.fg }]}>
										{late} {late === 1 ? "day" : "days"} late
									</Text>
								) : null}
							</View>
						}
						onPress={() => onOpen(item)}
					/>
				);
			})}
		</Panel>
	);
}

const styles = StyleSheet.create({
	rightCol: {
		alignItems: "flex-end",
		flexShrink: 0,
	},
	amount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},
	late: {
		fontFamily: fontFamily.medium,
		fontSize: type.micro,
		marginTop: 2,
	},
	clear: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	clearText: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.regular,
		fontSize: type.rowTitle,
	},
});
