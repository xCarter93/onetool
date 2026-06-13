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
	Bell,
	ChevronDown,
	Folder,
	Home,
	ListChecks,
	Plus,
	Receipt,
	Users,
} from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";

// 230px persistent iPad sidebar (full variant only — the prototype's `rail`
// variant was rejected for rotation continuity). Identical in both orientations.
// Pure chrome: routing for the rest is injected by ipad-shell via props; only the
// org-switch push is kept inline (it has no shell dependency).

export type SidebarTab = "home" | "clients" | "projects" | "tasks" | "money";

interface PadSidebarProps {
	activeTab: SidebarTab;
	onNavigate: (tab: SidebarTab) => void;
	onCreate: () => void;
	onProfile: () => void;
	onNotifications: () => void;
}

const NAV: { id: SidebarTab; label: string; Icon: typeof Home }[] = [
	{ id: "home", label: "Home", Icon: Home },
	{ id: "clients", label: "Clients", Icon: Users },
	{ id: "projects", label: "Work", Icon: Folder },
	{ id: "tasks", label: "Tasks", Icon: ListChecks },
	{ id: "money", label: "Money", Icon: Receipt },
];

function initialsFrom(name?: string | null): string {
	if (!name) return "?";
	const words = name.trim().split(/\s+/);
	if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
	return words[0].slice(0, 2).toUpperCase();
}

export function PadSidebar({
	activeTab,
	onNavigate,
	onCreate,
	onProfile,
	onNotifications,
}: PadSidebarProps) {
	const t = useTokens();
	const router = useRouter();
	const { organization } = useOrganization();
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
	const role = "Member";

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
							{ backgroundColor: "rgba(255,255,255,0.65)" },
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
					<View style={[styles.orgTile, { backgroundColor: t.accent }]}>
						<Text style={styles.orgTileText}>{orgInitials}</Text>
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
			<View style={styles.nav}>
				{NAV.map(({ id, label, Icon }) => {
					const active = activeTab === id;
					return (
						<Pressable
							key={id}
							onPress={() => onNavigate(id)}
							style={[
								styles.navRow,
								active && { backgroundColor: t.accentSoft },
							]}
							accessibilityRole="button"
							accessibilityLabel={label}
							accessibilityState={{ selected: active }}
						>
							<Icon size={21} color={active ? t.accent : t.sub} />
							<Text
								style={[
									styles.navLabel,
									{
										color: active ? t.accent : t.ink,
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

				{/* ＋ Create */}
				<Pressable
					onPress={onCreate}
					style={[styles.createBtn, { backgroundColor: t.accent }]}
					accessibilityRole="button"
					accessibilityLabel="Create"
				>
					<Plus size={20} color="#fff" />
					<Text style={styles.createLabel}>Create</Text>
				</Pressable>
			</View>

			{/* Footer: profile + bell */}
			<Pressable
				onPress={onProfile}
				style={[styles.footer, { borderTopColor: t.line }]}
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
				<Pressable
					onPress={(e) => {
						e.stopPropagation();
						onNotifications();
					}}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Notifications"
					style={styles.bellWrap}
				>
					<Bell size={20} color={t.sub} />
					<View style={styles.bellDot} />
				</Pressable>
			</Pressable>
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
		height: 32,
		aspectRatio: 908 / 237,
	},
	orgRow: {
		marginHorizontal: 12,
		marginBottom: 10,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 9,
		paddingHorizontal: 10,
		borderRadius: 13,
		borderWidth: 1,
	},
	orgTile: {
		width: 30,
		height: 30,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 13,
		color: "#fff",
	},
	orgName: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
	},
	orgSub: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
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
		paddingVertical: 11,
		paddingHorizontal: 13,
		borderRadius: 13,
	},
	navLabel: {
		fontSize: 14,
	},
	createBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		marginTop: 8,
		paddingVertical: 12,
		borderRadius: 14,
	},
	createLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: "#fff",
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		padding: 16,
		borderTopWidth: 1,
	},
	userName: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
	},
	userRole: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
	},
	bellWrap: {
		position: "relative",
	},
	bellDot: {
		position: "absolute",
		top: -4,
		right: -4,
		width: 8,
		height: 8,
		borderRadius: 8,
		backgroundColor: "#e23b3b",
	},
});
