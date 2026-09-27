import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { usePathname, useRouter, type Href } from "expo-router";
import {
	StackActions,
	type NavigationHelpers,
	type NavigationState,
	type ParamListBase,
	type TabNavigationState,
} from "expo-router/react-navigation";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import {
	Briefcase,
	CalendarCheck,
	CalendarDays,
	Route as RouteIcon,
	Wallet,
	type LucideIcon,
} from "lucide-react-native";
import { fontFamily, frame } from "@/lib/theme";
import { pageTitleFromPathname } from "@/lib/shell-routes";
import { requestSearchFocus } from "@/lib/search-focus";
import {
	composerSearchFor,
	runTrayAction,
	useChromeFor,
} from "@/lib/shell-chrome";
import { useOrgToday } from "@/lib/use-org-today";
import { usePermissions } from "@/lib/use-permissions";
import { useOnlineAction } from "@/lib/offline/hooks";
import { hapticSelect } from "@/lib/haptics";
import { SyncStatusRow } from "@/components/offline/sync-status-row";
import { RailHeader } from "./rail-header";
import { Notch, type NotchContent } from "./notch";
import { ActionTray, Composer, type CreateMenuItem } from "./context-tier";

export const TAB_ROUTES = ["(today)", "(work)", "(money)", "(routes)"] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

const TABS: Record<TabRoute, { label: string; icon: LucideIcon }> = {
	"(today)": { label: "Today", icon: CalendarCheck },
	"(work)": { label: "Work", icon: Briefcase },
	"(money)": { label: "Money", icon: Wallet },
	"(routes)": { label: "Routes", icon: RouteIcon },
};

// Screens inside the canvas sit below the rail, so device insets are the frame's job.
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

type TabPressEmit = (e: { type: "tabPress"; target: string; canPreventDefault: true }) => {
	defaultPrevented: boolean;
};

interface FrameProps {
	state: TabNavigationState<ParamListBase>;
	navigation: NavigationHelpers<ParamListBase>;
	children: React.ReactNode;
}

export function useCreateItems(): CreateMenuItem[] {
	const router = useRouter();
	const { can, isLoading } = usePermissions();
	const onlineAction = useOnlineAction();
	return useMemo(() => {
		if (isLoading) return [];
		const open = (label: string, href: string) => () =>
			onlineAction(label, () => router.push(href as Href));
		const items: CreateMenuItem[] = [];
		if (can("quotes", "modify")) {
			items.push({ key: "quote", label: "New quote", symbol: "doc.text", run: open("New quote", "/quote/new") });
		}
		if (can("clients", "modify")) {
			items.push({ key: "client", label: "New client", symbol: "building.2", run: open("New client", "/client/new") });
		}
		if (can("tasks", "modify")) {
			items.push({ key: "task", label: "New task", symbol: "checklist", run: open("New task", "/tasks/form") });
		}
		if (can("projects", "modify")) {
			items.push({ key: "project", label: "New project", symbol: "folder", run: open("New project", "/project/new") });
		}
		return items;
	}, [can, isLoading, onlineAction, router]);
}

function formatNotchDate(orgDayUtcMs: number): string {
	return new Date(orgDayUtcMs).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/**
 * iPhone picture frame (Tabs `layout`): graphite rail header, rounded canvas
 * holding the tab stacks, then sync line, context tier and tab row. Mounted
 * once, so a push slides only the canvas.
 */
export function PhoneFrame({ state, navigation, children }: FrameProps) {
	const router = useRouter();
	const pathname = usePathname();
	const insets = useSafeAreaInsets();
	const orgToday = useOrgToday();
	const createItems = useCreateItems();
	const [composerFocused, setComposerFocused] = useState(false);
	// A hardware keyboard focuses the field without raising the software one; keep the tab row then.
	const keyboardUp = useKeyboardState((k) => k.isVisible);
	const typing = composerFocused && keyboardUp;

	const tabRoute = state.routes[state.index];
	const tabName = tabRoute.name as TabRoute;
	const stack = tabRoute.state as NavigationState | undefined;
	const depth = stack?.routes.length ?? 1;
	const leafKey = stack ? stack.routes[stack.index ?? stack.routes.length - 1]?.key : undefined;
	const focusedChrome = useChromeFor(leafKey);
	const chrome = focusedChrome?.chrome;
	const chromeKey = focusedChrome?.key;

	const pageTitle = depth > 1 ? pageTitleFromPathname(pathname) : null;
	const notch: NotchContent = pageTitle
		? { kind: "crumb", parent: TABS[tabName]?.label ?? "Home", title: pageTitle }
		: tabName === "(today)"
			? { kind: "label", text: formatNotchDate(orgToday), icon: CalendarDays }
			: { kind: "label", text: TABS[tabName]?.label ?? "" };

	const openAssistant = () =>
		router.push({ pathname: "/assistant" as never, params: { ctx: pathname } });

	const goToTab = (name: TabRoute) => {
		const route = state.routes.find((r) => r.name === name);
		if (!route) return;
		const focused = route.key === tabRoute.key;
		// Same event the stock tab bar emits; native-stack pops to top on a re-tap.
		const event = (navigation.emit as TabPressEmit)({
			type: "tabPress",
			target: route.key,
			canPreventDefault: true,
		});
		if (event.defaultPrevented) return;
		hapticSelect();
		if (!focused) navigation.navigate(route.name);
	};

	const openSearch = () => {
		requestSearchFocus();
		const work = state.routes.find((r) => r.name === "(work)");
		const workStack = work?.state as NavigationState | undefined;
		if (workStack && workStack.routes.length > 1) {
			navigation.dispatch({ ...StackActions.popToTop(), target: workStack.key });
		}
		if (tabName !== "(work)") navigation.navigate("(work)");
	};

	const tier = chrome?.tray?.length ? (
		<ActionTray
			actions={chrome.tray}
			onRun={(key) => chromeKey && runTrayAction(chromeKey, key)}
			onAssistant={openAssistant}
		/>
	) : (
		<Composer
			search={
				chrome?.search && chromeKey
					? {
							...chrome.search,
							onChangeText: (text) => composerSearchFor(chromeKey)?.onChangeText(text),
						}
					: undefined
			}
			onSearchPress={openSearch}
			onAssistant={openAssistant}
			createItems={createItems}
			onFocusChange={setComposerFocused}
		/>
	);

	return (
		<KeyboardAvoidingView
			behavior="padding"
			enabled={typing}
			style={[styles.rail, { paddingTop: insets.top }]}
		>
			<StatusBar style="light" />
			<RailHeader onBack={depth > 1 ? () => router.back() : undefined} />
			<View style={styles.canvas}>
				<SafeAreaInsetsContext.Provider value={NO_INSETS}>{children}</SafeAreaInsetsContext.Provider>
				<Notch content={notch} />
			</View>
			<View style={[styles.bottom, { paddingBottom: typing ? 8 : Math.max(insets.bottom - 4, 8) }]}>
				<SyncStatusRow style={styles.sync} />
				{tier}
				{typing ? null : (
					<View style={styles.tabRow} accessibilityRole="tablist">
						{TAB_ROUTES.map((name) => {
							const active = name === tabName;
							const { label, icon: Icon } = TABS[name];
							return (
								<Pressable
									key={name}
									onPress={() => goToTab(name)}
									accessibilityRole="tab"
									accessibilityLabel={label}
									accessibilityState={{ selected: active }}
									style={[styles.tab, active && styles.tabActive]}
								>
									<Icon
										size={16}
										color={active ? frame.railAccent : frame.railMuted}
										strokeWidth={2}
									/>
									<Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
								</Pressable>
							);
						})}
					</View>
				)}
			</View>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	rail: {
		flex: 1,
		backgroundColor: frame.rail,
	},
	canvas: {
		flex: 1,
		marginHorizontal: frame.canvasInset,
		marginTop: 4,
		borderRadius: frame.canvasRadius,
		backgroundColor: frame.canvas,
		overflow: "hidden",
	},
	bottom: {
		paddingHorizontal: 10,
		paddingTop: 8,
		gap: 8,
	},
	sync: {
		paddingHorizontal: 4,
	},
	tabRow: {
		height: frame.tabRowHeight,
		flexDirection: "row",
		gap: 4,
	},
	tab: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		borderRadius: 8,
	},
	tabActive: {
		backgroundColor: frame.railRaised,
	},
	tabLabel: {
		fontFamily: fontFamily.medium,
		fontSize: 12,
		color: frame.railMuted,
	},
	tabLabelActive: {
		fontFamily: fontFamily.semibold,
		color: frame.railText,
	},
});
