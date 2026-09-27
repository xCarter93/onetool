import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { fontFamily, hero, type } from "@/lib/theme";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { useOldestCachedRead } from "@/lib/offline/useCachedQuery";
import { syncStatusLine, type SyncLineTone } from "@/lib/offline/sync-copy";

const DOT: Record<SyncLineTone, string> = {
	faint: hero.textDim,
	sub: hero.textMid,
	frostedInk: hero.statAccent,
	success: hero.statusSuccess,
	warning: hero.statusWarning,
	danger: hero.alertDot,
};

/** Sync/offline state as a row on the ink header band; renders nothing when all is quiet. */
export function SyncStatusRow({ style }: { style?: StyleProp<ViewStyle> }) {
	const router = useRouter();
	const { online, summary } = useOffline();
	const oldest = useOldestCachedRead();
	const [now, setNow] = useState(() => Date.now());
	// Ages ("Synced just now", "from 2h ago") must keep moving while the row stays mounted.
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);

	const line = useMemo(
		() =>
			syncStatusLine({
				online,
				summary,
				oldestCachedReadAgeMs: oldest === null ? null : now - oldest,
				now,
			}),
		[online, summary, oldest, now],
	);
	if (!line) return null;

	const content = (
		<>
			<View style={[styles.dot, { backgroundColor: DOT[line.tone] }]} />
			<Text
				style={[styles.text, { color: line.tappable ? hero.textStrong : hero.textMid }]}
				accessibilityLiveRegion="polite"
				numberOfLines={1}
			>
				{line.text}
			</Text>
			{line.tappable ? <ChevronRight size={14} color={hero.textMid} strokeWidth={2} /> : null}
		</>
	);

	return line.tappable ? (
		<Pressable
			onPress={() => router.push("/sync-issues" as Href)}
			accessibilityRole="button"
			accessibilityLabel={line.text}
			hitSlop={14}
			style={[styles.row, style]}
		>
			{content}
		</Pressable>
	) : (
		<View style={[styles.row, style]}>{content}</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		maxWidth: "100%",
	},
	dot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	text: {
		flexShrink: 1,
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
	},
});
