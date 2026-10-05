import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { usePathname, useRouter, useSegments } from "expo-router";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays } from "lucide-react-native";
import { frame } from "@/lib/theme";
import { pageTitleFromPathname } from "@/lib/shell-routes";
import { useOrgToday } from "@/lib/use-org-today";
import { SyncStatusRow } from "@/components/offline/sync-status-row";
import { RailHeader } from "./rail-header";
import { Notch, type NotchContent } from "./notch";

const TAB_LABELS: Record<string, string> = {
	"(today)": "Today",
	"(work)": "Work",
	"(money)": "Money",
	"(routes)": "Routes",
	"(search)": "Search",
};

// Screens inside the canvas sit below the rail; the native tab bar insets their scroll views itself.
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

function formatNotchDate(orgDayUtcMs: number): string {
	return new Date(orgDayUtcMs).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/**
 * iPhone picture frame around the native tabs: graphite rail header on top,
 * then the canvas running to the screen foot under the glass tab bar. Mounted
 * once, so a push slides only the canvas.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const segments = useSegments();
	const pathname = usePathname();
	const insets = useSafeAreaInsets();
	const orgToday = useOrgToday();

	// A modal above the tabs (assistant, task form) changes the pathname; keep naming the place underneath.
	const [place, setPlace] = useState({ tab: segments[1] as string, pathname });
	if (segments[0] === "(tabs)" && (place.tab !== segments[1] || place.pathname !== pathname)) {
		setPlace({ tab: segments[1] as string, pathname });
	}

	const pageTitle = pageTitleFromPathname(place.pathname);
	const tabLabel = TAB_LABELS[place.tab] ?? "";
	const notch: NotchContent = pageTitle
		? { kind: "crumb", parent: tabLabel || "Home", title: pageTitle }
		: place.tab === "(today)"
			? { kind: "label", text: formatNotchDate(orgToday), icon: CalendarDays }
			: { kind: "label", text: tabLabel };

	return (
		<View style={[styles.rail, { paddingTop: insets.top }]}>
			<StatusBar style="light" />
			<RailHeader onBack={pageTitle ? () => router.back() : undefined} />
			<SyncStatusRow style={styles.sync} />
			<View style={styles.canvas}>
				<SafeAreaInsetsContext.Provider value={NO_INSETS}>{children}</SafeAreaInsetsContext.Provider>
				<Notch content={notch} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	rail: {
		flex: 1,
		backgroundColor: frame.rail,
	},
	sync: {
		paddingHorizontal: 14,
		paddingBottom: 6,
	},
	canvas: {
		flex: 1,
		marginTop: 4,
		borderTopLeftRadius: frame.canvasRadius,
		borderTopRightRadius: frame.canvasRadius,
		backgroundColor: frame.canvas,
		overflow: "hidden",
	},
});
