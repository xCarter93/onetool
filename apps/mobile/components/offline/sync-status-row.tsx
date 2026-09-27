import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { fontFamily, frame } from "@/lib/theme";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { useOldestCachedRead } from "@/lib/offline/useCachedQuery";
import { syncStatusLine, type SyncLineTone } from "@/lib/offline/sync-copy";

const DOT: Record<SyncLineTone, string> = {
	faint: frame.railMuted,
	sub: frame.railText,
	frostedInk: frame.railAccent,
	success: frame.railSuccess,
	warning: frame.railWarning,
	danger: frame.railDanger,
};

/** Sync/offline state as a line on the graphite rail; renders nothing when all is quiet. */
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
				style={[styles.text, { color: line.tappable ? frame.railText : frame.railMuted }]}
				accessibilityLiveRegion="polite"
				numberOfLines={1}
			>
				{line.text}
			</Text>
			{line.tappable ? <ChevronRight size={14} color={frame.railMuted} strokeWidth={2} /> : null}
		</>
	);

	return line.tappable ? (
		<Pressable
			onPress={() => router.push("/sync-issues" as Href)}
			accessibilityRole="button"
			accessibilityLabel={line.text}
			hitSlop={10}
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
		minHeight: 20,
	},
	dot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	text: {
		flexShrink: 1,
		fontFamily: fontFamily.medium,
		fontSize: 12,
	},
});
