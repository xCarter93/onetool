import React from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type DimensionValue,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { MessageSquare } from "lucide-react-native";
import { fontFamily, radii, touch, tracking, type, useTokens } from "@/lib/theme";
import { Card } from "@/components/ui";
import {
	Illustration,
	type IllustrationName,
} from "@/components/illustrations";

// Shared chassis for the client + project detail screens. Both used to carry
// verbatim copies of everything in here.

export function countSuffix(n: number) {
	return n > 0 ? `  ·  ${n}` : "";
}

// ----------------------------------------------------------------------------
// Section label — uppercase eyebrow with an optional right slot ("View all",
// "+ New"). Deliberately NOT ui/SectionHeader: that one is the app-wide
// title-case h3 and belongs to every other screen.
// ----------------------------------------------------------------------------

export function SectionLabel({
	title,
	right,
}: {
	title: string;
	right?: React.ReactNode;
}) {
	const t = useTokens();
	return (
		<View style={styles.sectionLabelRow}>
			<Text
				style={[styles.sectionLabelText, { color: t.sub }]}
				numberOfLines={1}
			>
				{title.toUpperCase()}
			</Text>
			{right ? <View style={styles.sectionLabelRight}>{right}</View> : null}
		</View>
	);
}

/** Right-slot text link for SectionLabel. Painted 44pt — RN can't hit-test
 * outside the row's own bounds, and the header row is short. */
export function SectionLink({
	label,
	onPress,
	accessibilityLabel,
	Icon,
}: {
	label: string;
	onPress: () => void;
	accessibilityLabel?: string;
	Icon?: LucideIcon;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			style={({ pressed }) => [styles.sectionLink, pressed && styles.pressed]}
		>
			{Icon ? <Icon size={14} color={t.primarySolid} /> : null}
			<Text
				style={[styles.sectionLinkText, { color: t.primarySolid }]}
				numberOfLines={1}
			>
				{label}
			</Text>
		</Pressable>
	);
}

export function EmptyRow({
	text,
	illo,
}: {
	text: string;
	illo: IllustrationName;
}) {
	const t = useTokens();
	return (
		<View style={styles.empty}>
			{/* Knockout = the page canvas, so cut-out shapes don't show card-white. */}
			<Illustration name={illo} size="sm" knockout={t.bg} />
			<Text style={[styles.emptyText, { color: t.sub }]}>{text}</Text>
		</View>
	);
}

// ----------------------------------------------------------------------------
// Fact block — the utility card under the project hero. Rows with no data are
// HIDDEN, never dimmed: the block only exists to be actioned.
// ----------------------------------------------------------------------------

export interface FactAction {
	key: string;
	label: string;
	Icon: LucideIcon;
	onPress: () => void;
}

export function FactCard({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const rows = React.Children.toArray(children).filter(Boolean);
	if (rows.length === 0) return null;
	return (
		// Card takes a bare ViewStyle, so the pair is flattened.
		<Card flush style={StyleSheet.flatten([styles.factCard, style])}>
			{rows}
		</Card>
	);
}

export function FactRow({
	Icon,
	title,
	sub,
	actions = [],
	last,
}: {
	Icon: LucideIcon;
	title: string;
	sub?: string;
	actions?: FactAction[];
	last?: boolean;
}) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.factRow,
				{ borderBottomColor: t.lineSoft, borderBottomWidth: last ? 0 : 1 },
			]}
		>
			<View style={[styles.factGlyph, { backgroundColor: t.secondary }]}>
				<Icon size={16} color={t.sub} />
			</View>
			<View style={styles.factBody}>
				<Text style={[styles.factTitle, { color: t.ink }]} numberOfLines={1}>
					{title}
				</Text>
				{sub ? (
					<Text style={[styles.factSub, { color: t.sub }]} numberOfLines={2}>
						{sub}
					</Text>
				) : null}
			</View>
			{actions.map(({ key, label, Icon: ActionIcon, onPress }) => (
				<Pressable
					key={key}
					onPress={onPress}
					accessibilityRole="button"
					accessibilityLabel={label}
					style={({ pressed }) => [
						styles.factAction,
						{
							backgroundColor: pressed ? t.frostedBgPressed : t.frostedBg,
							borderColor: t.frostedBorder,
						},
					]}
				>
					<ActionIcon size={17} color={t.frostedInk} />
				</Pressable>
			))}
		</View>
	);
}

// ----------------------------------------------------------------------------
// Progress — a thin linear bar. (The 72pt Ring read as a dashboard ornament on
// a screen whose job is facts.)
// ----------------------------------------------------------------------------

export function ProgressBar({
	done,
	total,
	color,
}: {
	done: number;
	total: number;
	color: string;
}) {
	const t = useTokens();
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;
	return (
		<View style={styles.progress}>
			<View style={styles.progressLabels}>
				<Text style={[styles.progressLabel, { color: t.sub }]}>
					{done} of {total} tasks
				</Text>
				<Text style={[styles.progressPct, { color: t.ink }]}>{pct}%</Text>
			</View>
			<View
				style={[styles.progressTrack, { backgroundColor: t.secondary }]}
				accessibilityRole="progressbar"
				accessibilityValue={{ now: pct, min: 0, max: 100 }}
			>
				<View
					style={[
						styles.progressFill,
						{ width: `${pct}%`, backgroundColor: color },
					]}
				/>
			</View>
		</View>
	);
}

// ----------------------------------------------------------------------------
// Team chat — relocated from the old floating FAB; identical on both screens.
// ----------------------------------------------------------------------------

export function TeamChatButton({
	onPress,
	style,
}: {
	onPress: () => void;
	style?: StyleProp<ViewStyle>;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel="Open team chat"
			style={({ pressed }) => [
				styles.teamChat,
				{ backgroundColor: t.frostedBg, borderColor: t.frostedBorder },
				pressed && styles.pressed,
				style,
			]}
		>
			<MessageSquare size={18} color={t.frostedInk} />
			<Text style={[styles.teamChatText, { color: t.frostedInk }]}>
				Team chat
			</Text>
		</Pressable>
	);
}

// ----------------------------------------------------------------------------
// Loading skeletons — shaped like each screen's real layout, so they diverge.
// ----------------------------------------------------------------------------

export function DetailSkeleton({ variant }: { variant: "client" | "project" }) {
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
			{/* Editorial hero: eyebrow → name → meta. No monogram. */}
			<View style={styles.skeletonIdentity}>
				{bar("22%", 11)}
				{bar("70%", 22, 10)}
				{bar("35%", 11, 8)}
			</View>

			{variant === "project" ? (
				<>
					{/* Fact card + pill pair + progress bar */}
					<View
						style={[
							styles.skeletonFactCard,
							{ borderColor: t.line, backgroundColor: t.card },
						]}
					/>
					<View style={styles.skeletonPills}>
						{[0, 1].map((i) => (
							<View
								key={i}
								style={[styles.skeletonPill, { backgroundColor: t.lineSoft }]}
							/>
						))}
					</View>
					<View
						style={[styles.skeletonProgress, { backgroundColor: t.lineSoft }]}
					/>
				</>
			) : (
				// Client: one quiet team-chat pill, then section rows.
				<View
					style={[styles.skeletonChatPill, { backgroundColor: t.lineSoft }]}
				/>
			)}

			{[0, 1, 2].map((i) => (
				<View key={i} style={styles.skeletonRow}>
					<View
						style={[styles.skeletonRowTile, { backgroundColor: t.lineSoft }]}
					/>
					<View style={styles.skeletonIdentityBody}>
						{bar("55%", 13)}
						{bar("35%", 11, 6)}
					</View>
				</View>
			))}
		</>
	);
}

// Style entries both screens share verbatim.
export const detailStyles = StyleSheet.create({
	// alignSelf sizes the native menu host to its content — a stretched
	// MenuView trigger clips its label to "..".
	statusTrigger: {
		alignSelf: "flex-start",
		paddingBottom: 4,
		borderBottomWidth: 1,
	},
	section: { marginTop: 20, gap: 10 },
	stack: { gap: 8 },
	// FactCard inside a section: the section's own gap spaces it — the card's
	// default hero marginTop would double up.
	sectionCard: { marginTop: 0 },
});

const styles = StyleSheet.create({
	pressed: { opacity: 0.7 },

	sectionLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	sectionLabelText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
		flexShrink: 1,
	},
	sectionLabelRight: { flexShrink: 0 },
	sectionLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: touch.min,
		flexShrink: 0,
	},
	sectionLinkText: { fontFamily: fontFamily.semibold, fontSize: type.sm },

	empty: {
		paddingVertical: 18,
		alignItems: "center",
		gap: 8,
	},
	emptyText: { fontFamily: fontFamily.regular, fontSize: type.meta },

	factCard: { marginTop: 14 },
	factRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 10,
		paddingHorizontal: 12,
	},
	factGlyph: {
		width: 32,
		height: 32,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	factBody: { flex: 1, minWidth: 0 },
	factTitle: { fontFamily: fontFamily.semibold, fontSize: type.rowTitle },
	factSub: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		marginTop: 2,
	},
	// Painted 44pt — RN can't hit-test outside the row's own bounds.
	factAction: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},

	progress: { gap: 8 },
	progressLabels: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
	},
	progressLabel: { fontFamily: fontFamily.regular, fontSize: type.meta },
	progressPct: { fontFamily: fontFamily.semibold, fontSize: type.rowTitle },
	progressTrack: {
		height: 6,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	progressFill: { height: 6, borderRadius: radii.pill },

	teamChat: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: touch.min,
		borderRadius: radii.ctrl,
		borderWidth: 1,
	},
	teamChatText: { fontFamily: fontFamily.semibold, fontSize: 13 },

	skeletonIdentity: { minWidth: 0 },
	skeletonIdentityBody: { flex: 1, minWidth: 0 },
	skeletonBar: { borderRadius: radii.xs },
	skeletonChatPill: {
		height: touch.min,
		width: "42%",
		borderRadius: radii.ctrl,
		marginTop: 18,
	},
	skeletonFactCard: {
		height: 128,
		borderRadius: radii.card,
		borderWidth: 1,
		marginTop: 14,
	},
	skeletonPills: { flexDirection: "row", gap: 8, marginTop: 14 },
	skeletonPill: { flex: 1, height: touch.min, borderRadius: radii.ctrl },
	skeletonProgress: {
		height: 6,
		borderRadius: radii.pill,
		marginTop: 24,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 12,
		paddingHorizontal: 12,
		marginTop: 6,
	},
	skeletonRowTile: { width: 32, height: 32, borderRadius: 9 },
});
