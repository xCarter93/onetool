import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
	fontFamily,
	radii,
	STATUS,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";

interface IdentityBlockProps {
	/** Record tint pair — pass `recordTint.client`, `recordTint.project`, … */
	tint: { bg: string; fg: string };
	/** Monogram glyph. Callers pass a single letter; longer strings are clipped. */
	monogram: string;
	/** The record's own name. Restored below the status eyebrow (utility-hero
	 * pass): the ink band's title scrolls away, so the hero has to anchor. */
	name?: string;
	/** Key into the STATUS map — rendered as TEXT, never a badge pill. */
	statusKey?: string;
	/** Quiet meta line: lead source, city, a tappable client link, … */
	meta?: React.ReactNode;
	/**
	 * Wraps the status text so a screen can make it interactive (the client
	 * detail hangs a FieldMenu off it). The native MenuView host must receive a
	 * SINGLE bare child inside a content-sized parent — hence the status line
	 * lives on its own row with alignSelf:"flex-start", and `sub` is a separate
	 * line rather than an inline sibling.
	 */
	renderStatus?: (statusText: React.ReactNode) => React.ReactNode;
}

// Daybook identity header: tinted monogram square + name + status-as-text.
// Card-free by design — it sits directly on the page canvas.
export function IdentityBlock({
	tint,
	monogram,
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
		<View style={styles.row}>
			<View style={[styles.monogram, { backgroundColor: tint.bg }]}>
				<Text style={[styles.monogramText, { color: tint.fg }]}>
					{monogram.slice(0, 1).toUpperCase()}
				</Text>
			</View>
			{/* Status reads as the eyebrow ABOVE the name — the record's state is
			    what a field user scans for first. */}
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
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
	},
	monogram: {
		width: 54,
		height: 54,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	monogramText: {
		fontFamily: fontFamily.semibold,
		fontSize: 24,
		letterSpacing: 0.2,
	},
	body: { flex: 1, minWidth: 0 },
	name: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		letterSpacing: tracking.title,
		marginTop: 5,
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
