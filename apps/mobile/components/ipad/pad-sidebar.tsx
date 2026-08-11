import React, { useState } from "react";
import {
	Image,
	type LayoutChangeEvent,
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
	Route as RouteIcon,
	Sparkles,
} from "lucide-react-native";
import { fontFamily, radii, tokens, touch, type, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";

// 230px persistent iPad sidebar (full variant only — the prototype's `rail`
// variant was rejected for rotation continuity). Identical in both orientations.
// Pure chrome: routing for the rest is injected by ipad-shell via props; only the
// org-switch push is kept inline (it has no shell dependency).

export type SidebarTab = "today" | "work" | "routes" | "activity";
/** "profile" highlights NO nav row — Profile is reached via the footer. */
export type SidebarActive = SidebarTab | "profile";

interface PadSidebarProps {
	activeTab: SidebarActive;
	onNavigate: (tab: SidebarTab) => void;
	onAssistant: () => void;
	onProfile: () => void;
	onNotifications: () => void;
}

// Mirrors the phone dock's mode set (icon + label wording). The 3.0 GlassDock
// promoted Money into the phone dock; the rail keeps Activity and reaches
// Money through Work until the shell grows a money pane.
const NAV: { id: SidebarTab; label: string; Icon: typeof CalendarCheck }[] = [
	{ id: "today", label: "Today", Icon: CalendarCheck },
	{ id: "work", label: "Work", Icon: Briefcase },
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
	onAssistant,
	onProfile,
	onNotifications,
}: PadSidebarProps) {
	const t = useTokens();
	const router = useRouter();
	const { organization, membership } = useOrganization();
	const { user } = useUser();

	// Measure the brand block so the BG.png wash sits in a DEFINITE-height box
	// before the absoluteFill image — otherwise the image escapes to full-screen
	// on Fabric (Pitfall 5, mirrors app-header.tsx).
	const [brandHeight, setBrandHeight] = useState(0);
	const onBrandLayout = (e: LayoutChangeEvent) =>
		setBrandHeight(e.nativeEvent.layout.height);

	const orgName = organization?.name ?? "Personal";
	const orgInitials = initialsFrom(orgName);
	const userName = user?.fullName ?? user?.firstName ?? "You";
	const userInitials = initialsFrom(userName);
	const role = roleLabel(membership?.role);

	return (
		<View style={[styles.root, { backgroundColor: t.card, borderRightColor: t.line }]}>
			{/* Brand block with BG.png wash */}
			<View style={styles.brand} onLayout={onBrandLayout}>
				<View
					style={[styles.brandWash, { height: brandHeight }]}
					pointerEvents="none"
				>
					<Image
						source={require("@/assets/BG.png")}
						style={[StyleSheet.absoluteFill, { opacity: 0.256 }]}
						resizeMode="cover"
					/>
					<View
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: `${tokens.card}A6` },
						]}
					/>
				</View>
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

			{/* Assistant sits OUTSIDE the tablist — it is a button, not a fifth tab —
			    and after the flex:1 nav, which is what pins it to the rail bottom (§6:
			    no floating FAB on iPad). */}
			<View style={styles.assistantWrap}>
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
	brandWash: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
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
	assistantWrap: {
		paddingHorizontal: 12,
		paddingBottom: 10,
	},
	assistantRow: {
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
