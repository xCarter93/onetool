import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, STATUS, tracking, type, useTokens } from "@/lib/theme";

interface IdentityBlockProps {
	/** The record's own name — the hero's anchor: the ink band's title scrolls
	 * away, so this has to carry the screen. */
	name?: string;
	/** Key into the STATUS map — rendered as TEXT, never a badge pill. */
	statusKey?: string;
	/** Quiet meta line: lead source, city, a tappable client link, … */
	meta?: React.ReactNode;
	/**
	 * Wraps the status text so a screen can make it interactive (both detail
	 * screens hang a FieldMenu off it). The native MenuView host must receive a
	 * SINGLE bare child inside a content-sized parent — the status wrapper is a
	 * non-stretching row item (flexShrink:0, row alignItems:"center"), and
	 * `meta` is a separate line rather than an inline sibling.
	 */
	renderStatus?: (statusText: React.ReactNode) => React.ReactNode;
}

// Editorial identity header: name on the left with the status inline on the
// right (the eyebrow-above stack left the hero's right half dead), meta below.
// No monogram — the name IS the mark. Card-free by design; it sits directly on
// the page canvas.
export function IdentityBlock({
	name,
	statusKey,
	meta,
	renderStatus,
}: IdentityBlockProps) {
	const t = useTokens();
	const entry = statusKey
		? STATUS[statusKey as keyof typeof STATUS]
		: undefined;
	const statusLabel = entry?.label ?? statusKey;
	const statusColor = entry?.c ?? t.sub;

	const statusText = statusKey ? (
		<Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>
			{statusLabel}
		</Text>
	) : null;

	return (
		<View style={styles.body}>
			<View style={styles.titleRow}>
				{name ? (
					<Text style={[styles.name, { color: t.ink }]} numberOfLines={2}>
						{name}
					</Text>
				) : null}
				{statusText ? (
					<View style={styles.statusWrap}>
						{renderStatus ? renderStatus(statusText) : statusText}
					</View>
				) : null}
			</View>
			{meta ? <View style={styles.meta}>{meta}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	body: { minWidth: 0 },
	titleRow: {
		flexDirection: "row",
		// Center, not baseline: the status may live inside a native MenuView
		// host, which doesn't report a text baseline.
		alignItems: "center",
		gap: 12,
	},
	name: {
		fontFamily: fontFamily.semibold,
		// h1, not h2: the hero owns the top of the screen, and at 20 the name
		// left the right half of the band feeling empty (visual pass).
		fontSize: type.h1,
		letterSpacing: tracking.title,
		flex: 1,
		minWidth: 0,
	},
	// flexShrink:0 + the row's center alignment keep the (possibly menu-hosting)
	// wrapper content-sized — a stretched native MenuView trigger clips its
	// label to "..".
	statusWrap: { flexShrink: 0 },
	status: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.groupLabel,
		textTransform: "uppercase",
	},
	meta: { marginTop: 4, alignSelf: "flex-start" },
	metaText: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
});

/** Plain (non-interactive) meta line — the tappable variant is built by the
 * caller and passed as `meta` too. */
export function IdentityMeta({ children }: { children: string }) {
	const t = useTokens();
	return (
		<Text style={[styles.metaText, { color: t.sub }]} numberOfLines={1}>
			{children}
		</Text>
	);
}
