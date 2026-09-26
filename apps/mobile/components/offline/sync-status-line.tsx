import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { fontFamily, touch, type, useTokens } from "@/lib/theme";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { useOldestCachedRead } from "@/lib/offline/useCachedQuery";
import { syncStatusLine } from "@/lib/offline/sync-copy";

/**
 * Persistent status line for the primary work surfaces — text only, no pill,
 * one-shot fade between states (Daybook grammar). Mount once per shell
 * (iPhone tabs layout, iPad shell), never per screen. Sits above the screen
 * content, so it carries its own top safe-area inset when visible.
 */
export function SyncStatusLine({ children }: { children: ReactNode }) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { online, summary } = useOffline();
	const oldest = useOldestCachedRead();
	const [now, setNow] = useState(() => Date.now());
	// Ages ("Synced just now", "from 2h ago") must keep moving while the line stays mounted.
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

	// The line takes the top safe area itself, so the screens below must not pad for it again.
	const childInsets = useMemo(
		() => ({ ...insets, top: line ? 0 : insets.top }),
		[insets, line],
	);

	let lineView: ReactNode = null;
	if (line) {
		const text = (
			<Text
				style={[styles.text, { color: t[line.tone] }]}
				accessibilityLiveRegion="polite"
				numberOfLines={1}
			>
				{line.text}
			</Text>
		);
		lineView = line.tappable ? (
			<Pressable
				onPress={() => router.push("/sync-issues" as Href)}
				accessibilityRole="button"
				accessibilityLabel={line.text}
				style={[styles.tapWrap, { paddingTop: insets.top, backgroundColor: t.bg }]}
			>
				{text}
			</Pressable>
		) : (
			<View style={[styles.staticWrap, { paddingTop: insets.top + 6, backgroundColor: t.bg }]}>
				{text}
			</View>
		);
	}

	// Always the same provider element, so showing the line never remounts the tabs.
	return (
		<>
			{lineView}
			<SafeAreaInsetsContext.Provider value={childInsets}>{children}</SafeAreaInsetsContext.Provider>
		</>
	);
}

const styles = StyleSheet.create({
	staticWrap: {
		paddingHorizontal: 16,
		paddingBottom: 2,
	},
	tapWrap: {
		paddingHorizontal: 16,
		minHeight: touch.min,
		justifyContent: "center",
	},
	text: {
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
	},
});
