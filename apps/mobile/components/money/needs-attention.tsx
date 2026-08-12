import { StyleSheet, Text, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@onetool/backend/convex/_generated/api";
import { badgeTone, fontFamily, recordTint, type, useTokens } from "@/lib/theme";
import { ListRow } from "@/components/ui";
import { formatCurrency, formatShortDate } from "@/lib/format";

// Shape comes from the query itself — packages/backend does not export
// businessHealth.ts as a deep entry point, and inferring beats re-declaring.
type AttentionItem = FunctionReturnType<
	typeof api.businessHealth.get
>["needsAttention"][number];

/**
 * "Needs attention" — the Money hub's first body section (slice 7). The backend
 * pre-orders it (overdue invoices by due date, then the oldest sent quotes) and
 * caps it at five, so this renders the payload verbatim.
 *
 * The date meta lives in the right column rather than ListRow's `sub`: `sub` is
 * one color and an overdue "Due …" has to read danger-toned next to a neutral
 * "Sent …" on the quote rows.
 */
export function NeedsAttention({
	items,
	now,
	selected = null,
	onOpen,
}: {
	items: AttentionItem[];
	/** Seeded once by the screen — Date.now() during render is a lint error.
	 * Dates outside this year keep theirs, so an aged receivable can't read as
	 * a recent one. */
	now: number;
	/** iPad master-detail: marks the row whose record the detail pane shows. */
	selected?: { kind: "quote" | "invoice"; id: string } | null;
	onOpen: (item: AttentionItem) => void;
}) {
	const t = useTokens();

	if (items.length === 0) {
		// Deliberately a quiet row, not an empty state: nothing is wrong, and a
		// full-height illustration would make an absence look like a failure.
		return (
			<View style={styles.clear}>
				<CheckCircle2 size={17} color={t.success} />
				<Text style={[styles.clearText, { color: t.sub }]}>
					All caught up. Nothing overdue or waiting on a client.
				</Text>
			</View>
		);
	}

	return (
		<View>
			{items.map((item, i) => {
				const tint =
					item.kind === "invoice" ? recordTint.invoice : recordTint.quote;
				const meta =
					item.kind === "invoice" && item.dueDate !== undefined
						? { text: `Due ${formatShortDate(item.dueDate, now)}`, late: true }
						: item.sentAt !== undefined
							? {
									text: `Sent ${formatShortDate(item.sentAt, now)}`,
									late: false,
								}
							: null;
				return (
					<ListRow
						key={item.id}
						icon={item.kind === "invoice" ? "Receipt" : "FileText"}
						iconColor={tint.fg}
						iconBg={tint.bg}
						title={item.label}
						sub={item.clientName}
						last={i === items.length - 1}
						selected={
							selected?.kind === item.kind && selected.id === item.id
						}
						right={
							<View style={styles.rightCol}>
								<Text style={[styles.amount, { color: t.ink }]}>
									{formatCurrency(item.amount, { exact: true })}
								</Text>
								{meta ? (
									<Text
										style={[
											styles.meta,
											{ color: meta.late ? badgeTone.late.fg : t.sub },
										]}
									>
										{meta.text}
									</Text>
								) : null}
							</View>
						}
						onPress={() => onOpen(item)}
					/>
				);
			})}
		</View>
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
	meta: {
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
