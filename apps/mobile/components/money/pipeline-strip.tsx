import { Pressable, StyleSheet, Text, View } from "react-native";
import {
	fontFamily,
	hero,
	radii,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";
import { formatCurrency } from "@/lib/format";

interface Cell {
	key: string;
	/** One-word uppercase eyebrow — anything longer ellipsizes at 3-across. */
	label: string;
	/** Context line under the amount ("3 quotes", "1 invoice", "Aug"). */
	sub: string;
	/** Spoken expansion of the label for screen readers. */
	a11y: string;
	amount: number;
	onPress?: () => void;
}

/**
 * The Money hub's pipeline strip (slice 7): quoted → unpaid → collected, read
 * left to right as money moving through the business. Lives inside the ink
 * band on iPhone and directly under the light Hero card in the iPad pane, so
 * it carries an `onInk` palette fork (precedent: work/search-field.tsx).
 *
 * One shared container with hairline column dividers (Starling/Squarespace
 * pattern) — per-cell boxes cost too much width at 3-across and force the
 * labels to ellipsize. The collected cell is deliberately inert — it is an
 * outcome, not a queue, and there is nowhere for it to go. It renders as a
 * plain View so no pressed state can exist. Quoted/unpaid only become buttons
 * when the owner hands them an onPress (iPad keeps every cell static this
 * slice).
 */
export function PipelineStrip({
	awaitingCount,
	awaitingTotal,
	unpaidCount,
	unpaidTotal,
	collected,
	collectedLabel,
	onInk = false,
	onPressAwaiting,
	onPressUnpaid,
}: {
	awaitingCount: number;
	awaitingTotal: number;
	unpaidCount: number;
	unpaidTotal: number;
	collected: number;
	/** Short month for the collected sub line, e.g. "AUG". */
	collectedLabel?: string;
	onInk?: boolean;
	onPressAwaiting?: () => void;
	onPressUnpaid?: () => void;
}) {
	const t = useTokens();

	// "AUG" → "Aug" — the sub line is sentence-toned, not an eyebrow.
	const month = collectedLabel
		? collectedLabel.charAt(0) + collectedLabel.slice(1).toLowerCase()
		: undefined;

	const cells: Cell[] = [
		{
			key: "quoted",
			label: "QUOTED",
			sub: `${awaitingCount} ${awaitingCount === 1 ? "quote" : "quotes"}`,
			a11y: "quoted, awaiting client approval",
			amount: awaitingTotal,
			onPress: onPressAwaiting,
		},
		{
			key: "unpaid",
			label: "UNPAID",
			sub: `${unpaidCount} ${unpaidCount === 1 ? "invoice" : "invoices"}`,
			a11y: "unpaid invoices",
			amount: unpaidTotal,
			onPress: onPressUnpaid,
		},
		{
			key: "collected",
			label: "COLLECTED",
			sub: month ?? "this month",
			a11y: "collected this month",
			amount: collected,
		},
	];

	const shell = onInk
		? { backgroundColor: hero.cellBg, borderColor: hero.cellBorder }
		: { backgroundColor: t.card, borderColor: t.line };
	const dividerColor = onInk ? hero.cellBorder : t.line;
	const eyebrowColor = onInk ? hero.textSub : t.faint;
	const subColor = onInk ? hero.textMid : t.sub;
	const amountColor = onInk ? hero.text : t.ink;

	return (
		<View style={[styles.strip, shell]}>
			{cells.map((cell, i) => {
				const body = (
					<>
						<Text
							numberOfLines={1}
							style={[styles.eyebrow, { color: eyebrowColor }]}
						>
							{cell.label}
						</Text>
						<Text
							numberOfLines={1}
							style={[styles.amount, { color: amountColor }]}
						>
							{formatCurrency(cell.amount)}
						</Text>
						<Text numberOfLines={1} style={[styles.sub, { color: subColor }]}>
							{cell.sub}
						</Text>
					</>
				);
				const a11yLabel = `${cell.a11y}, ${cell.sub}, ${formatCurrency(cell.amount)}`;
				const divider =
					i > 0 ? (
						<View
							key={`${cell.key}-divider`}
							style={[styles.divider, { backgroundColor: dividerColor }]}
						/>
					) : null;

				return [
					divider,
					cell.onPress ? (
						<Pressable
							key={cell.key}
							onPress={cell.onPress}
							accessibilityRole="button"
							accessibilityLabel={a11yLabel}
							style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
						>
							{body}
						</Pressable>
					) : (
						<View
							key={cell.key}
							accessible
							accessibilityLabel={a11yLabel}
							style={styles.cell}
						>
							{body}
						</View>
					),
				];
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	strip: {
		flexDirection: "row",
		alignItems: "stretch",
		borderWidth: 1,
		borderRadius: radii.ctrl,
	},
	cell: {
		flex: 1,
		minWidth: 0,
		gap: 3,
		paddingVertical: 10,
		paddingHorizontal: 12,
	},
	divider: {
		width: StyleSheet.hairlineWidth,
		marginVertical: 8,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.micro,
		letterSpacing: tracking.groupLabel,
	},
	amount: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		fontVariant: ["tabular-nums"],
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	pressed: {
		opacity: 0.75,
	},
});
