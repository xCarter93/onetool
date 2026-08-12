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
	 * SINGLE bare child inside a content-sized parent — hence the status line
	 * lives on its own row with alignSelf:"flex-start", and `meta` is a separate
	 * line rather than an inline sibling.
	 */
	renderStatus?: (statusText: React.ReactNode) => React.ReactNode;
}

// Editorial identity header: left-aligned status eyebrow → name → meta. No
// monogram — the name IS the mark. Card-free by design; it sits directly on the
// page canvas.
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

	// Status reads as the eyebrow ABOVE the name — the record's state is what a
	// field user scans for first.
	return (
		<View style={styles.body}>
			{statusText ? (
				<View style={styles.statusWrap}>
					{renderStatus ? renderStatus(statusText) : statusText}
				</View>
			) : null}
			{name ? (
				<Text style={[styles.name, { color: t.ink }]} numberOfLines={2}>
					{name}
				</Text>
			) : null}
			{meta ? <View style={styles.meta}>{meta}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	body: { minWidth: 0 },
	name: {
		fontFamily: fontFamily.semibold,
		// h1, not h2: the hero owns the top of the screen, and at 20 the name
		// left the right half of the band feeling empty (visual pass).
		fontSize: type.h1,
		letterSpacing: tracking.title,
		marginTop: 6,
	},
	// alignSelf sizes the (possibly menu-hosting) wrapper to its content — a
	// stretched native MenuView trigger clips its label to "..".
	statusWrap: { alignSelf: "flex-start" },
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
