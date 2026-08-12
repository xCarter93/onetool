import React, { useRef } from "react";
import {
	ActionSheetIOS,
	Alert,
	findNodeHandle,
	Image,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useOrganization, useUser } from "@clerk/expo";
import {
	Activity,
	Bell,
	Briefcase,
	CalendarCheck,
	ChevronDown,
	Plus,
	Route as RouteIcon,
	Sparkles,
	Wallet,
} from "lucide-react-native";
import { fontFamily, radii, tokens, touch, type, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";

// 230px persistent iPad sidebar (full variant only — the prototype's `rail`
// variant was rejected for rotation continuity). Identical in both orientations.
// Pure chrome: routing for the rest is injected by ipad-shell via props; only the
// org-switch push is kept inline (it has no shell dependency).

export type SidebarTab = "today" | "work" | "money" | "routes" | "activity";
/** "profile" highlights NO nav row — Profile is reached via the footer. */
export type SidebarActive = SidebarTab | "profile";

/** One entry of the rail's create menu. The shell builds and permission-filters
 *  these; the rail only renders them (same "pure chrome" split as the nav). */
export interface CreateItem {
	key: string;
	label: string;
	run: () => void;
}

interface PadSidebarProps {
	activeTab: SidebarActive;
	onNavigate: (tab: SidebarTab) => void;
	/** Empty → no ＋ at all (nothing this member may create = no dead chrome). */
	createItems?: CreateItem[];
	onAssistant: () => void;
	onProfile: () => void;
	onNotifications: () => void;
}

// Mirrors the phone dock's mode set (icon + label wording), plus Activity —
// the rail has the room the dock does not, so it keeps the feed as a fifth mode.
const NAV: { id: SidebarTab; label: string; Icon: typeof CalendarCheck }[] = [
	{ id: "today", label: "Today", Icon: CalendarCheck },
	{ id: "work", label: "Work", Icon: Briefcase },
	{ id: "money", label: "Money", Icon: Wallet },
	{ id: "routes", label: "Routes", Icon: RouteIcon },
	{ id: "activity", label: "Activity", Icon: Activity },
];

function initialsFrom(name?: string | null): string {
	if (!name) return "?";
	const words = name.trim().split(/\s+/);
	if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
	return words[0].slice(0, 2).toUpperCase();
}

// Clerk returns roles like "org:admin" — strip the prefix before title-casing,
// a bare capitalize would render "Org:admin" (see app/(tabs)/profile.tsx bug).
function roleLabel(role?: string | null): string {
	if (!role) return "Member";
	const bare = role.replace(/^org:/, "");
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

export function PadSidebar({
	activeTab,
	onNavigate,
	createItems = [],
	onAssistant,
	onProfile,
	onNotifications,
}: PadSidebarProps) {
	const t = useTokens();
	const router = useRouter();
	// The sheet must be anchored to the ＋ or iOS pops it from the screen centre
	// instead of beside the rail.
	const createAnchor = useRef<View>(null);

	const openCreateMenu = () => {
		if (createItems.length === 0) return;
		if (Platform.OS === "ios") {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: [...createItems.map((i) => i.label), "Cancel"],
					cancelButtonIndex: createItems.length,
					anchor: findNodeHandle(createAnchor.current) ?? undefined,
				},
				(index) => createItems[index]?.run(),
			);
		} else {
			Alert.alert("Create", undefined, [
				...createItems.map((i) => ({ text: i.label, onPress: i.run })),
				{ text: "Cancel", style: "cancel" as const },
			]);
		}
	};
	const { organization, membership } = useOrganization();
	const { user } = useUser();

	const orgName = organization?.name ?? "Personal";
	const orgInitials = initialsFrom(orgName);
	const userName = user?.fullName ?? user?.firstName ?? "You";
	const userInitials = initialsFrom(userName);
	const role = roleLabel(membership?.role);

	return (
		<View style={[styles.root, { backgroundColor: t.card, borderRightColor: t.line }]}>
			{/* Brand block */}
			<View style={styles.brand}>
				<View style={styles.brandRow}>
					<Image
						source={require("@/assets/OneTool-wordmark.png")}
						style={styles.brandLogo}
						resizeMode="contain"
						accessibilityRole="image"
						accessibilityLabel="OneTool"
					/>
				</View>
			</View>

			{/* Org switcher */}
			<Pressable
				onPress={() => router.push("/org-switch" as Href)}
				style={[styles.orgRow, { borderColor: t.line }]}
				accessibilityRole="button"
				accessibilityLabel="Switch organization"
			>
				{organization?.imageUrl ? (
					<Image source={{ uri: organization.imageUrl }} style={styles.orgTile} />
				) : (
					<View style={[styles.orgTile, { backgroundColor: t.primarySolid }]}>
						<Text style={[styles.orgTileText, { color: tokens.card }]}>
							{orgInitials}
						</Text>
					</View>
				)}
				<View style={{ flex: 1, minWidth: 0 }}>
					<Text style={[styles.orgName, { color: t.ink }]} numberOfLines={1}>
						{orgName}
					</Text>
					<Text style={[styles.orgSub, { color: t.faint }]}>Switch workspace</Text>
				</View>
				<ChevronDown size={15} color={t.sub} />
			</Pressable>

			{/* Nav stack */}
			<View style={styles.nav} accessibilityRole="tablist">
				{NAV.map(({ id, label, Icon }) => {
					const active = activeTab === id;
					return (
						<Pressable
							key={id}
							onPress={() => onNavigate(id)}
							style={[
								styles.navRow,
								active && { backgroundColor: t.secondary },
							]}
							accessibilityRole="tab"
							accessibilityLabel={label}
							accessibilityState={{ selected: active }}
						>
							<Icon size={21} color={active ? t.primaryInk : t.sub} />
							<Text
								style={[
									styles.navLabel,
									{
										color: t.ink,
										fontFamily: active
											? fontFamily.semibold
											: fontFamily.regular,
									},
								]}
							>
								{label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			{/* Assistant + create sit OUTSIDE the tablist — buttons, not tabs — and
			    after the flex:1 nav, which is what pins them to the rail bottom.
			    Together they are the rail's answer to the phone's speed-dial FAB
			    (§6: no floating FAB on iPad). The ＋ anchors its own action sheet. */}
			<View style={styles.actionRow}>
				<Pressable
					onPress={onAssistant}
					style={[
						styles.assistantRow,
						{ backgroundColor: t.frostedBg, borderColor: t.frostedBorder },
					]}
					accessibilityRole="button"
					accessibilityLabel="Assistant"
				>
					<Sparkles size={20} color={t.frostedInk} />
					<Text style={[styles.assistantLabel, { color: t.frostedInk }]}>
						Assistant
					</Text>
				</Pressable>
				{createItems.length > 0 ? (
					<Pressable
						ref={createAnchor}
						onPress={openCreateMenu}
						style={({ pressed }) => [
							styles.createBtn,
							{ backgroundColor: t.secondary },
							pressed && { opacity: 0.85 },
						]}
						accessibilityRole="button"
						accessibilityLabel="Create"
					>
						<Plus size={22} color={t.primaryInk} strokeWidth={2.2} />
					</Pressable>
				) : null}
			</View>

			{/* Footer: profile + bell, sibling Pressables (not nested). */}
			<View style={[styles.footer, { borderTopColor: t.line }]}>
				<Pressable
					onPress={onProfile}
					style={styles.profileArea}
					accessibilityRole="button"
					accessibilityLabel="Profile"
				>
					<Avatar
						text={userInitials}
						size={40}
						imageUrl={user?.hasImage ? user.imageUrl : null}
					/>
					<View style={{ flex: 1, minWidth: 0 }}>
						<Text style={[styles.userName, { color: t.ink }]} numberOfLines={1}>
							{userName}
						</Text>
						<Text style={[styles.userRole, { color: t.sub }]}>{role}</Text>
					</View>
				</Pressable>
				<Pressable
					onPress={onNotifications}
					accessibilityRole="button"
					accessibilityLabel="Notifications"
					style={styles.bellWrap}
				>
					<Bell size={20} color={t.sub} />
					<View style={[styles.bellDot, { backgroundColor: tokens.danger }]} />
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		width: 230,
		flexShrink: 0,
		height: "100%",
		borderRightWidth: 1,
		flexDirection: "column",
	},
	brand: {
		paddingTop: 40,
		paddingBottom: 14,
		paddingHorizontal: 18,
		overflow: "hidden",
	},
	brandRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	brandLogo: {
		// Explicit definite w/h (not aspectRatio — Fabric ignores height when
		// paired with aspectRatio here). 908x237 source ≈ 3.83:1 → 104x27.
		width: 104,
		height: 27,
	},
	orgRow: {
		marginHorizontal: 12,
		marginBottom: 10,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 9,
		paddingHorizontal: 10,
		borderRadius: radii.card,
		borderWidth: 1,
	},
	orgTile: {
		width: 30,
		height: 30,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: type.sm,
	},
	orgName: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	orgSub: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	nav: {
		flex: 1,
		paddingVertical: 4,
		paddingHorizontal: 12,
		gap: 4,
	},
	navRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: touch.min,
		paddingVertical: 11,
		paddingHorizontal: 13,
		borderRadius: radii.card,
	},
	navLabel: {
		fontSize: type.body,
	},
	actionRow: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: 8,
		paddingHorizontal: 12,
		paddingBottom: 10,
	},
	createBtn: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	assistantRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: touch.min,
		paddingVertical: 12,
		borderRadius: radii.ctrl,
		borderWidth: 1,
	},
	assistantLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		padding: 16,
		borderTopWidth: 1,
	},
	profileArea: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		minWidth: 0,
	},
	userName: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	userRole: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	bellWrap: {
		width: touch.min,
		height: touch.min,
		alignItems: "center",
		justifyContent: "center",
	},
	bellDot: {
		position: "absolute",
		// Centers on the 20px icon's top-right corner within the 44px touch box
		// ((44-20)/2 = 12 icon inset, minus half the 8px dot).
		top: 8,
		right: 8,
		width: 8,
		height: 8,
		borderRadius: radii.xs,
	},
});
