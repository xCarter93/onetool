import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

export interface QuickAction {
	key: string;
	label: string;
	Icon: LucideIcon;
	onPress: () => void;
	/** Missing data (no phone, no property) — dimmed and inert, never hidden. */
	disabled?: boolean;
}

// A row of equal frosted action tiles (Call / Message / Email / Directions).
// Deliberately NOT components/money/quick-action-row.tsx — that one renders the
// status→CTA resolver's union and can't take arbitrary tiles.
export function QuickActions({ actions }: { actions: QuickAction[] }) {
	const t = useTokens();
	if (actions.length === 0) return null;

	return (
		<View style={styles.row}>
			{actions.map(({ key, label, Icon, onPress, disabled }) => (
				<Pressable
					key={key}
					accessibilityRole="button"
					accessibilityLabel={label}
					accessibilityState={{ disabled: !!disabled }}
					disabled={disabled}
					onPress={onPress}
					style={({ pressed }) => [
						styles.tile,
						{
							backgroundColor:
								pressed && !disabled ? t.frostedBgPressed : t.frostedBg,
							borderColor: t.frostedBorder,
							opacity: disabled ? 0.45 : 1,
						},
					]}
				>
					<Icon size={18} color={t.frostedInk} />
					<Text
						style={[styles.label, { color: t.frostedInk }]}
						numberOfLines={1}
					>
						{label}
					</Text>
				</Pressable>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: 8,
	},
	tile: {
		flex: 1,
		minWidth: 0,
		minHeight: touch.min + 16,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingHorizontal: 4,
		paddingVertical: 10,
	},
	label: {
		fontFamily: fontFamily.semibold,
		fontSize: type.xs,
	},
});
