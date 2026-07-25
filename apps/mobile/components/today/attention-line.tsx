import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { AlertCircle, ChevronRight } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

export type AttentionItem = { label: string };

interface AttentionLineProps {
	/** Rendered as "2 quotes awaiting approval · 1 invoice overdue". */
	items: AttentionItem[];
	onPress?: () => void;
}

/**
 * The one quiet urgency line that replaced the mobile dashboard's stat cards.
 * Renders NOTHING when there is nothing to report — an always-present "all
 * clear" row would just be chrome.
 */
export function AttentionLine({ items, onPress }: AttentionLineProps) {
	const t = useTokens();
	if (items.length === 0) return null;

	const text = items.map((i) => i.label).join(" · ");

	return (
		<Pressable
			accessibilityRole={onPress ? "button" : "summary"}
			accessibilityLabel={`Needs attention: ${text}`}
			onPress={onPress}
			style={[
				styles.row,
				{ backgroundColor: t.warningBg, borderColor: t.warningLine },
			]}
		>
			<AlertCircle size={15} color={t.warning} />
			<Text style={[styles.text, { color: t.warning }]} numberOfLines={2}>
				{text}
			</Text>
			{onPress ? <ChevronRight size={15} color={t.warning} /> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: touch.min,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingVertical: 9,
		paddingHorizontal: 12,
		// Spacing belongs to the day plan's gap container now, not the line.
	},
	text: {
		flex: 1,
		minWidth: 0,
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
		lineHeight: 17,
	},
});

/**
 * Builds the line's parts, dropping zeroes. Pass the WHOLE phrase, not just the
 * noun: `{ count: 2, singular: "quote awaiting approval" }` → "2 quotes
 * awaiting approval" (the default plural appends "s" to the first word only
 * when you don't supply one, so supply one for multi-word phrases).
 */
export const attentionItems = (
	parts: { count: number; singular: string; plural?: string }[],
): AttentionItem[] =>
	parts
		.filter((p) => p.count > 0)
		.map((p) => ({
			label: `${p.count} ${p.count === 1 ? p.singular : (p.plural ?? `${p.singular}s`)}`,
		}));
