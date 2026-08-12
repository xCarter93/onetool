import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays, List, User, Users } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";
import type { DayScope } from "@/lib/agenda";
import type { ScheduleView } from "@/lib/useScheduleView";

/**
 * Painted height of both controls. Below `touch.min`, so every trigger keeps a
 * 44pt hit area via hitSlop rather than growing the row — the two stacked
 * full-width toggles this replaced ate ~98pt of the page's most valuable space.
 */
const H = 30;
const HIT = { top: 7, bottom: 7, left: 6, right: 6 };

interface ScheduleControlsProps {
	view: ScheduleView;
	onChangeView: (view: ScheduleView) => void;
	scope: DayScope;
	onChangeScope: (scope: DayScope) => void;
	/** False in a solo org, where a scope toggle would be a no-op. */
	showScope: boolean;
}

/**
 * Today's one control row: Day | List as a small pill pair on the left, Me |
 * Team as an icon pair on the right (Asana's rule — secondary controls sit at
 * eyebrow level, never as stacked full-width chrome).
 *
 * Selected state is a SOLID `primarySolid` border plus a `card` fill: frosted
 * tokens composite ~1.1:1 on this background and cannot carry state.
 */
export function ScheduleControls({
	view,
	onChangeView,
	scope,
	onChangeScope,
	showScope,
}: ScheduleControlsProps) {
	const t = useTokens();

	const pill = (value: ScheduleView, label: string, Icon: typeof List) => {
		const active = view === value;
		return (
			<Pressable
				key={value}
				onPress={() => onChangeView(value)}
				hitSlop={HIT}
				accessibilityRole="tab"
				accessibilityState={{ selected: active }}
				accessibilityLabel={`${label} view`}
				style={[
					styles.pill,
					active && { backgroundColor: t.card, borderColor: t.primarySolid },
				]}
			>
				<Icon size={13} color={active ? t.frostedInk : t.sub} />
				<Text
					style={[
						styles.pillLabel,
						{
							color: active ? t.ink : t.sub,
							fontFamily: active ? fontFamily.semibold : fontFamily.medium,
						},
					]}
				>
					{label}
				</Text>
			</Pressable>
		);
	};

	const scopeButton = (value: DayScope, label: string, Icon: typeof User) => {
		const active = scope === value;
		return (
			<Pressable
				key={value}
				onPress={() => onChangeScope(value)}
				hitSlop={HIT}
				accessibilityRole="tab"
				accessibilityState={{ selected: active }}
				accessibilityLabel={`Filter to ${label.toLowerCase()}`}
				style={[
					styles.scopeButton,
					active && { backgroundColor: t.card, borderColor: t.primarySolid },
				]}
			>
				<Icon size={14} color={active ? t.frostedInk : t.sub} />
			</Pressable>
		);
	};

	return (
		<View style={styles.row}>
			<View
				style={[styles.group, { backgroundColor: t.secondary }]}
				accessibilityRole="tablist"
				accessibilityLabel="Schedule view"
			>
				{pill("day", "Day", CalendarDays)}
				{pill("list", "List", List)}
			</View>
			{showScope ? (
				<View
					style={[styles.group, { backgroundColor: t.secondary }]}
					accessibilityRole="tablist"
					accessibilityLabel="Schedule scope"
				>
					{scopeButton("me", "Me", User)}
					{scopeButton("team", "Team", Users)}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		// Keeps the block itself a legal 44pt band even though the pills are 30pt,
		// so the hitSlop never reaches outside its parent (RN won't hit-test there).
		minHeight: touch.min,
		gap: 10,
	},
	group: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: radii.pill,
		padding: 2,
		gap: 2,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 5,
		height: H,
		paddingHorizontal: 11,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: "transparent",
	},
	pillLabel: {
		fontSize: type.sm,
	},
	scopeButton: {
		alignItems: "center",
		justifyContent: "center",
		width: 36,
		height: H,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: "transparent",
	},
});
