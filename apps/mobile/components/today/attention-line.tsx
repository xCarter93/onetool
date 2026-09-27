export type AttentionItem = { label: string };

/**
 * Builds the day's attention items, dropping zeroes. Pass the WHOLE phrase,
 * not just the noun: `{ count: 2, singular: "quote awaiting approval" }` →
 * "2 quotes awaiting approval" (the default plural appends "s" to the first
 * word only when you don't supply one, so supply one for multi-word phrases).
 * Rendered as the `MetricStrip` footer on Today (index.tsx).
 */
export const attentionItems = (
	parts: { count: number; singular: string; plural?: string }[],
): AttentionItem[] =>
	parts
		.filter((p) => p.count > 0)
		.map((p) => ({
			label: `${p.count} ${p.count === 1 ? p.singular : (p.plural ?? `${p.singular}s`)}`,
		}));
