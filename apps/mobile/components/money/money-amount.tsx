import { StyleSheet, Text } from "react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import { formatCurrency } from "@/lib/format";

// Document-grade money numeral (frames 1d/1h/1i): big bold tabular dollars
// with the cents dropped to a muted two-thirds size. The single signature
// treatment of the money surfaces — everything else stays quiet around it.
export function MoneyAmount({
	amount,
	size = 34,
	color,
	centsColor,
}: {
	amount: number;
	/** Hero (Money hub) uses 40; document cards use 34. */
	size?: number;
	color?: string;
	/** Override for on-ink surfaces — the default faint is a light-mode value. */
	centsColor?: string;
}) {
	const t = useTokens();
	const formatted = formatCurrency(amount, { exact: true });
	const dot = formatted.lastIndexOf(".");
	const dollars = dot === -1 ? formatted : formatted.slice(0, dot);
	const cents = dot === -1 ? "" : formatted.slice(dot);
	return (
		<Text
			style={[
				styles.amount,
				{ fontSize: size, color: color ?? t.ink },
			]}
			accessibilityLabel={formatted}
		>
			{dollars}
			{cents ? (
				<Text
					style={[
						styles.cents,
						{
							fontSize: Math.round(size * 0.56),
							color: centsColor ?? t.faintDecor,
						},
					]}
				>
					{cents}
				</Text>
			) : null}
		</Text>
	);
}

const styles = StyleSheet.create({
	amount: {
		fontFamily: fontFamily.bold,
		letterSpacing: -0.8,
		fontVariant: ["tabular-nums"],
	},
	cents: {
		fontFamily: fontFamily.semibold,
		fontVariant: ["tabular-nums"],
	},
});
