import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { fontFamily, radii, tokens, type, useTokens } from "@/lib/theme";
import { pageTitleFromPathname, tabFromPathname } from "@/lib/shell-routes";

const TAB_LABEL: Record<string, string> = {
	today: "Today",
	work: "Work",
	money: "Money",
	routes: "Routes",
	activity: "Activity",
	profile: "Profile",
};

/** "Viewing Today" / "Viewing Client" chip text from the path the sparkle was
 *  pressed over (phone-frame's `ctx` param) — omit the chip when there's no path. */
export function contextLabelFromPath(path?: string | null): string | undefined {
	if (!path) return undefined;
	return pageTitleFromPathname(path) ?? TAB_LABEL[tabFromPathname(path)];
}

/**
 * Light sheet header for the assistant surfaces (pushed sheet, iPad centered
 * modal, iPad landscape panel) — same tile + title + close idiom as the other
 * sheet headers. Kept under its original export names: components/ipad/ipad-shell.tsx
 * imports both directly.
 */
export function AssistantInkHeader({
	/** Sheet presentations get the drag handle; docked panels don't. */
	grabber,
	/** Trailing slot — the panel's close button. */
	right,
	/** Status-bar clearance for surfaces that reach the screen top (landscape panel). */
	topInset = 0,
	/** "Viewing {context}" chip text; omitted entirely when there's nothing to show. */
	context,
}: {
	grabber?: boolean;
	right?: React.ReactNode;
	topInset?: number;
	context?: string;
}) {
	const t = useTokens();
	return (
		<View style={[styles.wrap, { backgroundColor: t.card, borderBottomColor: t.line }]}>
			{grabber ? <View style={[styles.grabber, { backgroundColor: t.line }]} /> : null}
			<View style={[styles.row, topInset > 0 && { marginTop: topInset }]}>
				<View style={[styles.tile, { backgroundColor: t.secondary }]}>
					<Sparkles size={18} color={t.frostedInk} strokeWidth={2.2} />
				</View>
				<View style={styles.headerText}>
					<Text style={[styles.title, { color: t.ink }]} accessibilityRole="header">
						Assistant
					</Text>
					{context ? (
						<View style={[styles.chip, { backgroundColor: t.secondary }]}>
							<Text style={[styles.chipText, { color: t.sub }]} numberOfLines={1}>
								Viewing {context}
							</Text>
						</View>
					) : null}
				</View>
				{right}
			</View>
		</View>
	);
}

/** Text tier for a header-slot glyph on the light header (e.g. the close X). */
export const inkHeaderGlyph = tokens.sub;

const styles = StyleSheet.create({
	wrap: {
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 14,
		borderBottomWidth: 1,
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: radii.xs,
		marginBottom: 10,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	tile: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: {
		flex: 1,
		minWidth: 0,
		gap: 3,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	chip: {
		alignSelf: "flex-start",
		borderRadius: radii.pill,
		paddingHorizontal: 8,
		paddingVertical: 2,
	},
	chipText: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
});
