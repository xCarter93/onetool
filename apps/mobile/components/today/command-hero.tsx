import React, { useState } from "react";
import {
	StyleSheet,
	Text,
	View,
	type LayoutChangeEvent,
} from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { Search } from "lucide-react-native";
import { DotGrid } from "@/components/ui";
import {
	InkHeaderCluster,
	InkIconButton,
	InkOrgChip,
} from "@/components/ink-header-cluster";
import { fontFamily, hero, tokens, tracking } from "@/lib/theme";
import { requestSearchFocus } from "@/lib/search-focus";

const WORK: Href = "/(tabs)/work" as Href;

export interface HeroStat {
	value: string;
	caption: string;
	/** Sky-blue money accent (the one tinted stat in the canvas). */
	accent?: boolean;
}

interface CommandHeroProps {
	/** Uppercase date line above the greeting. */
	eyebrow: string;
	greeting: string;
	stats: readonly HeroStat[];
	/**
	 * Compressed band: greeting shrinks and the day stats drop out. Used when the
	 * schedule is anchored to a day other than today — the stats describe TODAY,
	 * so keeping them would both mislead and steal the room the schedule needs.
	 */
	compact?: boolean;
	/** The ink-tone week strip (or any pinned control) below the stats. */
	children?: React.ReactNode;
}

/**
 * 3.0 ink command hero (canvas 1a) — the deep-ink counterpart of the brand
 * blue that opens Today. Self-sources org/user/unread the same way app-header
 * does, so screens only feed it the day's identity (greeting, stats).
 */
export function CommandHero({
	eyebrow,
	greeting,
	stats,
	compact = false,
	children,
}: CommandHeroProps) {
	const router = useRouter();
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
			{/* The dark band needs light status-bar glyphs — but only while Today
			    is the focused tab, or Work/Money inherit invisible icons. */}
			{isFocused ? <StatusBar style="light" /> : null}
			{size.width > 0 && (
				<Svg
					width={size.width}
					height={size.height}
					style={StyleSheet.absoluteFill}
					pointerEvents="none"
				>
					<Defs>
						<RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
							<Stop offset="0" stopColor={tokens.brand} stopOpacity={0.22} />
							<Stop offset="0.6" stopColor={tokens.brand} stopOpacity={0} />
						</RadialGradient>
					</Defs>
					{/* Canvas: radial-gradient(120% 90% at 85% -10%, …). */}
					<Ellipse
						cx={size.width * 0.85}
						cy={-size.height * 0.1}
						rx={size.width * 1.2}
						ry={size.height * 0.9}
						fill="url(#heroGlow)"
					/>
				</Svg>
			)}
			<DotGrid style={StyleSheet.absoluteFill} color={hero.dotGrid} />

			{/* Org bar */}
			<View style={styles.orgBar}>
				<InkOrgChip />
				<View style={styles.spacer} />
				{/* No ＋ here — the speed-dial FAB is the single capture entry point
				    on iPhone (3.0 slice 5). */}
				{/* Today has no AppHeader on iPhone, so the hero carries the global
				    search jump the other tab roots get from app-header.tsx. */}
				<InkIconButton
					label="Search everything"
					onPress={() => {
						requestSearchFocus();
						router.push(WORK);
					}}
				>
					<Search size={18} color={hero.text} strokeWidth={2} />
				</InkIconButton>
				<InkHeaderCluster />
			</View>

			{/* Greeting */}
			<Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>
				{eyebrow.toUpperCase()}
			</Text>
			<Text style={[styles.greeting, compact && styles.greetingCompact]}>
				{greeting}
			</Text>

			{/* Day stats — today's numbers, so they leave with the compressed band. */}
			{compact ? null : (
				<View style={styles.statsRow}>
					{stats.map((stat) => (
						<View key={stat.caption} style={styles.statCard}>
							<Text
								style={[
									styles.statValue,
									stat.accent && { color: hero.statAccent },
								]}
							>
								{stat.value}
							</Text>
							<Text style={styles.statCaption}>{stat.caption}</Text>
						</View>
					))}
				</View>
			)}

			{children ? <View style={styles.controls}>{children}</View> : null}
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
	orgBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	spacer: {
		flex: 1,
	},
	eyebrow: {
		marginTop: 20,
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: tracking.groupLabel,
		color: hero.textDim,
	},
	eyebrowCompact: {
		marginTop: 14,
	},
	greeting: {
		marginTop: 4,
		fontFamily: fontFamily.semibold,
		fontSize: 26,
		lineHeight: 31,
		letterSpacing: -0.3,
		color: hero.text,
	},
	greetingCompact: {
		fontSize: 19,
		lineHeight: 23,
		marginTop: 2,
	},
	statsRow: {
		flexDirection: "row",
		gap: 8,
		marginTop: 16,
	},
	statCard: {
		flex: 1,
		borderRadius: 14,
		backgroundColor: hero.cellBg,
		borderWidth: 1,
		borderColor: hero.cellBorder,
		paddingVertical: 10,
		paddingHorizontal: 12,
	},
	statValue: {
		fontFamily: fontFamily.bold,
		fontSize: 18,
		color: hero.text,
		fontVariant: ["tabular-nums"],
	},
	statCaption: {
		marginTop: 1,
		fontFamily: fontFamily.medium,
		fontSize: 10.5,
		letterSpacing: 0.6,
		textTransform: "uppercase",
		color: hero.textSub,
	},
	controls: {
		marginTop: 10,
	},
});
