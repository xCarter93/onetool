import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Check } from "lucide-react-native";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";
import { KIND_LABEL, KIND_ORDER, type WorkKind } from "@/lib/work-search";

interface TypeChipsProps {
	/** null = no type filter (mixed view). */
	value: WorkKind | null;
	onChange: (next: WorkKind | null) => void;
	/** Optional per-kind counts, shown after the label when known. */
	counts?: Partial<Record<WorkKind, number>>;
}

/** Record-type filter chips. Tapping the selected chip clears the filter. */
export function TypeChips({ value, onChange, counts }: TypeChipsProps) {
	const t = useTokens();

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			// Bleed past the parent's gutter so chips scroll to the screen edge
			// instead of clipping at the padded bound; the content padding puts
			// the resting position back on the gutter grid.
			style={styles.bleed}
			contentContainerStyle={styles.row}
			keyboardShouldPersistTaps="handled"
		>
			{KIND_ORDER.map((kind) => {
				const selected = value === kind;
				const count = counts?.[kind];
				return (
					<Pressable
						key={kind}
						onPress={() => onChange(selected ? null : kind)}
						accessibilityRole="button"
						accessibilityState={{ selected }}
						accessibilityLabel={
							count === undefined
								? KIND_LABEL[kind]
								: `${KIND_LABEL[kind]}, ${count}`
						}
						style={({ pressed }) => [
							styles.chip,
							selected
								? {
										backgroundColor: t.frostedBg,
										// A 10% wash reads as "white chip" in sunlight; the border does
										// the real work at 4.8:1 against the surface.
										borderColor: t.primarySolid,
									}
								: { backgroundColor: t.card, borderColor: t.line },
							pressed && styles.pressed,
						]}
					>
						{/* Glyph, not just color — selection must not be color-only. */}
						{selected ? <Check size={13} color={t.frostedInk} /> : null}
						<Text
							style={[
								styles.label,
								{ color: selected ? t.frostedInk : t.sub },
							]}
						>
							{KIND_LABEL[kind]}
						</Text>
						{count === undefined ? null : (
							<Text
								style={[
									styles.count,
									{ color: selected ? t.frostedInk : t.faint },
								]}
							>
								{count}
							</Text>
						)}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	bleed: {
		marginHorizontal: -spacing.gutter,
	},
	row: {
		gap: 8,
		paddingHorizontal: spacing.gutter,
		alignItems: "center",
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		minHeight: touch.min,
		paddingHorizontal: 15,
		borderRadius: radii.chip,
		borderWidth: 1,
	},
	label: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
	},
	count: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
	},
	pressed: {
		opacity: 0.75,
	},
});
