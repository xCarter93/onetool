import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type DimensionValue,
} from "react-native";
import { MenuView } from "@expo/ui/community/menu";
import { MoreHorizontal, type LucideIcon } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

// Shared chassis for the client + project detail screens. Both used to carry
// verbatim copies of everything in here.

export function countSuffix(n: number) {
	return n > 0 ? `  ·  ${n}` : "";
}

// ----------------------------------------------------------------------------
// Contact chip row — equal outline buttons (Call, Email, Map/Navigate, …)
// under the identity row, plus a "…" native menu for anything that doesn't
// fit. Only actions the data already supports are passed in.
// ----------------------------------------------------------------------------

export interface ChipAction {
	key: string;
	label: string;
	Icon: LucideIcon;
	onPress: () => void;
}

export function ContactChipRow({
	chips,
	overflow = [],
}: {
	chips: ChipAction[];
	overflow?: ChipAction[];
}) {
	const t = useTokens();
	if (chips.length === 0 && overflow.length === 0) return null;
	return (
		<View style={styles.chipRow}>
			{chips.map((c) => (
				<Pressable
					key={c.key}
					onPress={c.onPress}
					accessibilityRole="button"
					accessibilityLabel={c.label}
					style={({ pressed }) => [
						styles.chip,
						{
							borderColor: t.input,
							backgroundColor: pressed ? t.secondary : t.card,
						},
					]}
				>
					<c.Icon size={15} color={t.ink} strokeWidth={2} />
					<Text style={[styles.chipLabel, { color: t.ink }]} numberOfLines={1}>
						{c.label}
					</Text>
				</Pressable>
			))}
			{overflow.length > 0 ? (
				// The SwiftUI menu host under-measures its RN child, so the visible
				// square owns the layout and the host is absolutely overlaid on top
				// (FieldMenu's pattern) — its measurement can't squeeze the siblings.
				<View collapsable={false} style={styles.chipMoreWrap}>
					<View
						style={[
							styles.chipMore,
							{ borderColor: t.input, backgroundColor: t.card },
						]}
					>
						<MoreHorizontal size={18} color={t.ink} strokeWidth={2} />
					</View>
					<View style={StyleSheet.absoluteFill}>
						<MenuView
							onPressAction={({ nativeEvent }) =>
								overflow.find((o) => o.key === nativeEvent.event)?.onPress()
							}
							actions={overflow.map((o) => ({ id: o.key, title: o.label }))}
						>
							<View
								style={StyleSheet.absoluteFill}
								accessibilityRole="button"
								accessibilityLabel="More actions"
							/>
						</MenuView>
					</View>
				</View>
			) : null}
		</View>
	);
}

// ----------------------------------------------------------------------------
// Panel rows for a contact or a property — every one gets its own row with
// its own actions (small 32px outline icon buttons), not just the primary.
// ----------------------------------------------------------------------------

export function PersonRow({
	name,
	sub,
	primary,
	actions,
	last,
}: {
	name: string;
	sub?: string;
	primary?: boolean;
	actions: ChipAction[];
	last?: boolean;
}) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.personRow,
				{ borderBottomColor: t.lineSoft, borderBottomWidth: last ? 0 : 1 },
			]}
		>
			<View style={styles.personBody}>
				<Text style={[styles.personName, { color: t.ink }]} numberOfLines={1}>
					{primary ? `${name}  ·  Primary` : name}
				</Text>
				{sub ? (
					<Text style={[styles.personSub, { color: t.sub }]} numberOfLines={1}>
						{sub}
					</Text>
				) : null}
			</View>
			{actions.map((a) => (
				<Pressable
					key={a.key}
					onPress={a.onPress}
					accessibilityRole="button"
					accessibilityLabel={a.label}
					style={({ pressed }) => [
						styles.personBtn,
						{
							borderColor: t.input,
							backgroundColor: pressed ? t.secondary : t.card,
						},
					]}
				>
					<a.Icon size={15} color={t.ink} strokeWidth={2} />
				</Pressable>
			))}
		</View>
	);
}

export function LineRow({
	title,
	sub,
	primary,
	action,
	last,
}: {
	title: string;
	sub?: string;
	primary?: boolean;
	action?: ChipAction;
	last?: boolean;
}) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.personRow,
				{ borderBottomColor: t.lineSoft, borderBottomWidth: last ? 0 : 1 },
			]}
		>
			<View style={styles.personBody}>
				<Text style={[styles.personName, { color: t.ink }]} numberOfLines={1}>
					{primary ? `${title}  ·  Primary` : title}
				</Text>
				{sub ? (
					<Text style={[styles.personSub, { color: t.sub }]} numberOfLines={2}>
						{sub}
					</Text>
				) : null}
			</View>
			{action ? (
				<Pressable
					onPress={action.onPress}
					accessibilityRole="button"
					accessibilityLabel={action.label}
					style={({ pressed }) => [
						styles.personBtn,
						{
							borderColor: t.input,
							backgroundColor: pressed ? t.secondary : t.card,
						},
					]}
				>
					<action.Icon size={15} color={t.ink} strokeWidth={2} />
				</Pressable>
			) : null}
		</View>
	);
}

// ----------------------------------------------------------------------------
// Loading skeleton — shaped like the new identity/chips/metrics/tabs layout.
// ----------------------------------------------------------------------------

export function DetailSkeleton() {
	const t = useTokens();
	const bar = (width: DimensionValue, height: number, marginTop = 0) => (
		<View
			style={[
				styles.skeletonBar,
				{ width, height, marginTop, backgroundColor: t.lineSoft },
			]}
		/>
	);

	return (
		<>
			<View style={styles.skeletonIdentityRow}>
				<View style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]} />
				<View style={styles.skeletonIdentityBody}>
					{bar("70%", 20)}
					{bar("45%", 13, 8)}
				</View>
			</View>
			<View style={styles.skeletonChips}>
				{[0, 1, 2].map((i) => (
					<View
						key={i}
						style={[styles.skeletonChip, { backgroundColor: t.lineSoft }]}
					/>
				))}
			</View>
			<View
				style={[
					styles.skeletonPanel,
					{ height: 64, borderColor: t.line, backgroundColor: t.card },
				]}
			/>
			<View
				style={[
					styles.skeletonPanel,
					{ height: 180, borderColor: t.line, backgroundColor: t.card },
				]}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	chipRow: { flexDirection: "row", gap: 8 },
	chip: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: touch.min,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 8,
	},
	chipLabel: { fontFamily: fontFamily.medium, fontSize: type.sm },
	chipMoreWrap: { width: touch.min },
	chipMore: {
		width: touch.min,
		height: touch.min,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},

	personRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	personBody: { flex: 1, minWidth: 0 },
	personName: { fontFamily: fontFamily.semibold, fontSize: type.rowTitle },
	personSub: { fontFamily: fontFamily.regular, fontSize: type.meta, marginTop: 2 },
	personBtn: {
		width: 32,
		height: 32,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},

	skeletonIdentityRow: { flexDirection: "row", gap: 12 },
	skeletonTile: { width: 40, height: 40, borderRadius: 10 },
	skeletonIdentityBody: { flex: 1, minWidth: 0, justifyContent: "center" },
	skeletonBar: { borderRadius: radii.xs },
	skeletonChips: { flexDirection: "row", gap: 8, marginTop: 16 },
	skeletonChip: { flex: 1, height: touch.min, borderRadius: radii.ctrl },
	skeletonPanel: { borderRadius: radii.card, borderWidth: 1, marginTop: 16 },
});
