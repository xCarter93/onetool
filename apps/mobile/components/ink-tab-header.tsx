import React, { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import { DotGrid } from "@/components/ui";
import {
	InkHeaderCluster,
	InkIconButton,
	InkOrgChip,
} from "@/components/ink-header-cluster";
import { fontFamily, hero, tokens, tracking } from "@/lib/theme";

export interface InkHeaderAction {
	key: string;
	/** Accessibility label — these buttons are icon-only. */
	label: string;
	icon: LucideIcon;
	onPress: () => void;
}

interface InkTabHeaderProps {
	/** Band headline. Optional only when `orgChip` takes the left slot. */
	title?: string;
	/** Lead with the org-switcher chip instead of a title — the main tab roots
	 * (Work, Money; Today via CommandHero). The tab's identity already lives in
	 * the dock, so the band's left slot goes to the org. */
	orgChip?: boolean;
	/** Uppercase line above the title. */
	eyebrow?: string;
	/** Extra icon buttons, placed LEFT of the constant bell + avatar cluster. */
	actions?: readonly InkHeaderAction[];
	/** Drop the constant Activity quick-link — the Activity root can't link to
	 * itself. Bell + avatar stay. */
	hideActivity?: boolean;
	/** Drop the constant avatar — the Profile root can't link to itself.
	 * Activity + bell stay. */
	hideAvatar?: boolean;
	/**
	 * Detail variant: renders a back circle left of the title. Record screens
	 * pass `() => router.back()`; tab roots leave it off. With the back button
	 * AND the 3-icon cluster on the row the 26pt title only fits ~13 characters,
	 * so this variant also drops the title to 20pt.
	 */
	onBack?: () => void;
	/** On-ink slot below the title — search field, stat line, pinned controls. */
	children?: React.ReactNode;
}

/**
 * The lighter sibling of today/command-hero: the same ink band language (glow,
 * dot grid, frosted icon circles, rounded foot) for the other tab roots, minus
 * the org chip, greeting and week strip. Screens feed it a title and whatever
 * belongs on ink.
 */
export function InkTabHeader({
	title,
	orgChip = false,
	eyebrow,
	actions,
	hideActivity = false,
	hideAvatar = false,
	onBack,
	children,
}: InkTabHeaderProps) {
	const insets = useSafeAreaInsets();
	const isFocused = useIsFocused();

	// Glow SVG needs measured pixels — Fabric escapes %-sized SVGs inside an
	// indefinite-height parent (same pitfall as dot-grid.tsx).
	const [size, setSize] = useState({ width: 0, height: 0 });
	const onLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		setSize((prev) =>
			prev.width === width && prev.height === height
				? prev
				: { width, height },
		);
	};

	return (
		<View
			onLayout={onLayout}
			style={[styles.band, { paddingTop: insets.top + 6 }]}
		>
			{/* The dark band needs light status-bar glyphs — but only while this
			    screen is the focused tab, or the sibling roots inherit invisible
			    icons. */}
			{isFocused ? <StatusBar style="light" /> : null}
			{size.width > 0 && (
				<Svg
					width={size.width}
					height={size.height}
					style={StyleSheet.absoluteFill}
					pointerEvents="none"
				>
					<Defs>
						<RadialGradient id="inkHeaderGlow" cx="50%" cy="50%" r="50%">
							<Stop offset="0" stopColor={tokens.brand} stopOpacity={0.22} />
							<Stop offset="0.6" stopColor={tokens.brand} stopOpacity={0} />
						</RadialGradient>
					</Defs>
					<Ellipse
						cx={size.width * 0.85}
						cy={-size.height * 0.1}
						rx={size.width * 1.2}
						ry={size.height * 0.9}
						fill="url(#inkHeaderGlow)"
					/>
				</Svg>
			)}
			<DotGrid style={StyleSheet.absoluteFill} color={hero.dotGrid} />

			{/* Title row — the title sits inline with the icon cluster, which is what
			    keeps this band shorter than Today's. */}
			<View style={styles.topRow}>
				{onBack ? (
					<InkIconButton label="Go back" onPress={onBack}>
						<ArrowLeft size={18} color={hero.text} strokeWidth={2} />
					</InkIconButton>
				) : null}
				{orgChip ? (
					<InkOrgChip />
				) : (
					<View style={styles.titleBlock}>
						{eyebrow ? (
							<Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
						) : null}
						<Text
							numberOfLines={1}
							style={onBack ? styles.titleCompact : styles.title}
						>
							{title}
						</Text>
					</View>
				)}
				<View style={styles.spacer} />
				{actions?.map((action) => (
					<InkIconButton
						key={action.key}
						label={action.label}
						onPress={action.onPress}
					>
						<action.icon size={18} color={hero.text} strokeWidth={2} />
					</InkIconButton>
				))}
				<InkHeaderCluster
					hideActivity={hideActivity}
					hideAvatar={hideAvatar}
				/>
			</View>

			{children ? <View style={styles.slot}>{children}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	band: {
		backgroundColor: hero.ink,
		borderBottomLeftRadius: hero.radius,
		borderBottomRightRadius: hero.radius,
		overflow: "hidden",
		paddingHorizontal: 20,
		paddingBottom: 14,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	titleBlock: {
		flexShrink: 1,
		minWidth: 0,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: tracking.groupLabel,
		color: hero.textDim,
		marginBottom: 2,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 26,
		lineHeight: 31,
		letterSpacing: -0.3,
		color: hero.text,
	},
	// Detail variant: back circle + 3 cluster icons leave ~175pt for the title on
	// a 393pt screen — 26pt would truncate a two-word company name.
	titleCompact: {
		fontFamily: fontFamily.semibold,
		fontSize: 20,
		lineHeight: 24,
		letterSpacing: -0.2,
		color: hero.text,
	},
	spacer: {
		flex: 1,
	},
	slot: {
		marginTop: 16,
		gap: 10,
	},
});
