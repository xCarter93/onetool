import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Check } from "lucide-react-native";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";
import { CHIP_ORDER, KIND_LABEL, type WorkChipKind } from "@/lib/work-search";

interface TypeChipsProps {
	/** null = no type filter (search everything / resting view). */
	value: WorkChipKind | null;
	onChange: (next: WorkChipKind | null) => void;
}

/**
 * Bucket chips. With a query they scope results to one kind; without one they
 * open that kind's full browse list.
 *
 * COUNTLESS by design (Slice 6): the screen no longer holds four always-on list
 * subscriptions, and search buckets cap at 5 hits — any number rendered here
 * would be either a lie or four subscriptions bought back to print it.
 */
export function TypeChips({ value, onChange }: TypeChipsProps) {
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
			{CHIP_ORDER.map((kind) => {
				const selected = value === kind;
				return (
					<Pressable
						key={kind}
						onPress={() => onChange(selected ? null : kind)}
						accessibilityRole="button"
						accessibilityState={{ selected }}
						accessibilityLabel={KIND_LABEL[kind]}
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
	pressed: {
		opacity: 0.75,
	},
});
