import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge } from "@/components/ui";
import { TypeTile } from "@/components/canvas";
import { fontFamily, type RecordKind, useTokens } from "@/lib/theme";

interface IdentityBlockProps {
	kind: RecordKind;
	/** The record's own name — the row's anchor. */
	name?: string;
	/** Key into the STATUS map — rendered as a Badge. */
	statusKey?: string;
	/** Quiet meta line: location, lead source, a tappable client link, … */
	meta?: React.ReactNode;
	/**
	 * Wraps the status badge so a screen can make it interactive (both detail
	 * screens hang a FieldMenu off it). The native MenuView host must receive a
	 * SINGLE bare child inside a content-sized parent — the wrapper is a
	 * non-stretching row item (flexShrink:0).
	 */
	renderStatus?: (statusBadge: React.ReactNode) => React.ReactNode;
}

// Frame 1c identity row: a 40px TypeTile, the name at 22/600, a status Badge
// and meta line below. Card-free by design; it sits directly on the canvas.
export function IdentityBlock({
	kind,
	name,
	statusKey,
	meta,
	renderStatus,
}: IdentityBlockProps) {
	const t = useTokens();
	const badge = statusKey ? <Badge status={statusKey} /> : null;

	return (
		<View style={styles.row}>
			<TypeTile kind={kind} size={40} />
			<View style={styles.body}>
				{name ? (
					<Text style={[styles.name, { color: t.ink }]} numberOfLines={2}>
						{name}
					</Text>
				) : null}
				{badge || meta ? (
					<View style={styles.metaRow}>
						{badge ? (
							<View style={styles.badgeWrap}>
								{renderStatus ? renderStatus(badge) : badge}
							</View>
						) : null}
						{meta ? (
							<View style={styles.metaFlex}>
								{typeof meta === "string" ? <IdentityMeta>{meta}</IdentityMeta> : meta}
							</View>
						) : null}
					</View>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
	},
	body: { flex: 1, minWidth: 0 },
	name: {
		fontFamily: fontFamily.semibold,
		fontSize: 22,
		lineHeight: 27,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 6,
	},
	// flexShrink:0 keeps the (possibly menu-hosting) wrapper content-sized — a
	// stretched native MenuView trigger clips its label to "..".
	badgeWrap: { flexShrink: 0 },
	metaFlex: { flexShrink: 1, minWidth: 0 },
	metaText: {
		fontFamily: fontFamily.regular,
		fontSize: 12.5,
	},
});

/** Plain (non-interactive) meta line — a tappable variant is built by the
 * caller and passed as `meta` too. */
export function IdentityMeta({ children }: { children: string }) {
	const t = useTokens();
	return (
		<Text style={[styles.metaText, { color: t.sub }]} numberOfLines={1}>
			{children}
		</Text>
	);
}
