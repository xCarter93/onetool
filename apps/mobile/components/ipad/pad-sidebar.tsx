import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useOrganization, useUser } from "@clerk/expo";
import {
	Activity,
	Bell,
	Briefcase,
	CalendarCheck,
	ChevronsUpDown,
	Route as RouteIcon,
	Wallet,
} from "lucide-react-native";
import { fontFamily, frame } from "@/lib/theme";
import { useNotificationData } from "@/lib/use-notification-data";
import { initialsFrom } from "@/components/frame/rail-header";

// Web's workspace sidebar on the graphite rail: brand, org switcher, one nav
// group, profile and notifications in the footer. Routing is injected by the shell.

export type SidebarTab = "today" | "work" | "money" | "routes" | "activity";
/** "profile" highlights NO nav row — Profile is reached via the footer. */
export type SidebarActive = SidebarTab | "profile";

const NAV: { id: SidebarTab; label: string; Icon: typeof CalendarCheck }[] = [
	{ id: "today", label: "Today", Icon: CalendarCheck },
	{ id: "work", label: "Work", Icon: Briefcase },
	{ id: "money", label: "Money", Icon: Wallet },
	{ id: "routes", label: "Routes", Icon: RouteIcon },
	{ id: "activity", label: "Activity", Icon: Activity },
];

// Clerk returns roles like "org:admin"; strip the prefix before title-casing.
function roleLabel(role?: string | null): string {
	if (!role) return "Member";
	const bare = role.replace(/^org:/, "");
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

export function PadSidebar({
	activeTab,
	onNavigate,
	onProfile,
	onNotifications,
}: {
	activeTab: SidebarActive;
	onNavigate: (tab: SidebarTab) => void;
	onProfile: () => void;
	onNotifications: () => void;
}) {
	const router = useRouter();
	const { organization, membership } = useOrganization();
	const { user } = useUser();
	const notificationData = useNotificationData();
	const unread = (notificationData?.unreadCount ?? 0) > 0;
	const [orgLogoFailed, setOrgLogoFailed] = useState(false);
	const [prevOrgLogo, setPrevOrgLogo] = useState(organization?.imageUrl);
	if (organization?.imageUrl !== prevOrgLogo) {
		setPrevOrgLogo(organization?.imageUrl);
		setOrgLogoFailed(false);
	}

	const orgName = organization?.name ?? "Personal";
	const userName = user?.fullName ?? user?.firstName ?? "You";

	return (
		<View style={styles.root}>
			<View style={styles.brand}>
				<Image
					source={require("@/assets/OneTool-wordmark.png")}
					style={styles.brandLogo}
					tintColor={frame.railText}
					resizeMode="contain"
					accessibilityRole="image"
					accessibilityLabel="OneTool"
				/>
			</View>

			<Pressable
				onPress={() => router.push("/org-switch" as Href)}
				style={({ pressed }) => [styles.org, pressed && styles.pressed]}
				accessibilityRole="button"
				accessibilityLabel={`${orgName}, switch organization`}
			>
				{organization?.imageUrl && !orgLogoFailed ? (
					<ExpoImage
						source={{ uri: organization.imageUrl }}
						style={styles.orgTile}
						contentFit="cover"
						cachePolicy="disk"
						transition={150}
						onError={() => setOrgLogoFailed(true)}
					/>
				) : (
					<View style={[styles.orgTile, styles.orgTileFill]}>
						<Text style={styles.orgTileText}>{initialsFrom(orgName)}</Text>
					</View>
				)}
				<View style={styles.flexText}>
					<Text style={styles.orgName} numberOfLines={1}>
						{orgName}
					</Text>
					<Text style={styles.orgSub} numberOfLines={1}>
						{roleLabel(membership?.role)}
					</Text>
				</View>
				<ChevronsUpDown size={15} color={frame.railMuted} strokeWidth={2} />
			</Pressable>

			<Text style={styles.groupLabel}>Workspace</Text>
			<View style={styles.nav} accessibilityRole="tablist">
				{NAV.map(({ id, label, Icon }) => {
					const active = activeTab === id;
					return (
						<Pressable
							key={id}
							onPress={() => onNavigate(id)}
							style={({ pressed }) => [
								styles.navRow,
								(active || pressed) && { backgroundColor: frame.railRaised },
							]}
							accessibilityRole="tab"
							accessibilityLabel={label}
							accessibilityState={{ selected: active }}
						>
							<Icon size={18} color={active ? frame.railAccent : frame.railMuted} strokeWidth={2} />
							<Text
								style={[
									styles.navLabel,
									{ fontFamily: active ? fontFamily.semibold : fontFamily.medium },
								]}
							>
								{label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			<View style={styles.footer}>
				<Pressable
					onPress={onProfile}
					style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
					accessibilityRole="button"
					accessibilityLabel="Profile"
				>
					<View style={styles.avatar}>
						{user?.hasImage ? (
							<ExpoImage source={{ uri: user.imageUrl }} style={styles.avatarImage} />
						) : (
							<Text style={styles.avatarText}>{initialsFrom(userName)}</Text>
						)}
					</View>
					<View style={styles.flexText}>
						<Text style={styles.userName} numberOfLines={1}>
							{userName}
						</Text>
						<Text style={styles.orgSub} numberOfLines={1}>
							{user?.primaryEmailAddress?.emailAddress ?? ""}
						</Text>
					</View>
				</Pressable>
				<Pressable
					onPress={onNotifications}
					accessibilityRole="button"
					accessibilityLabel={unread ? "Notifications, unread" : "Notifications"}
					style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
				>
					<Bell size={18} color={frame.railMuted} strokeWidth={2} />
					{unread ? <View style={styles.bellDot} /> : null}
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		width: 232,
		flexShrink: 0,
		backgroundColor: frame.rail,
		paddingHorizontal: 8,
	},
	brand: {
		paddingHorizontal: 8,
		paddingTop: 12,
		paddingBottom: 16,
	},
	// Explicit w/h: Fabric ignores height when paired with aspectRatio. 908x237 source.
	brandLogo: {
		width: 96,
		height: 25,
	},
	org: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 8,
		paddingVertical: 8,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: frame.railBorder,
	},
	orgTile: {
		width: 30,
		height: 30,
		borderRadius: 6,
	},
	orgTileFill: {
		width: undefined,
		height: undefined,
		minWidth: 30,
		minHeight: 30,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: frame.railAccent,
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 12,
		color: frame.railAccentInk,
	},
	flexText: {
		flex: 1,
		minWidth: 0,
	},
	orgName: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: frame.railText,
	},
	orgSub: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
		color: frame.railMuted,
		marginTop: 1,
	},
	groupLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 10,
		letterSpacing: 0.8,
		textTransform: "uppercase",
		color: frame.railMuted,
		paddingHorizontal: 8,
		marginTop: 20,
		marginBottom: 6,
	},
	nav: {
		flex: 1,
		gap: 2,
	},
	navRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 40,
		paddingHorizontal: 10,
		borderRadius: 4,
	},
	navLabel: {
		fontSize: 14,
		color: frame.railText,
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderTopWidth: 1,
		borderTopColor: frame.railBorder,
		paddingVertical: 12,
	},
	profile: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minWidth: 0,
		padding: 6,
		borderRadius: 4,
	},
	avatar: {
		width: 32,
		height: 32,
		borderRadius: 16,
		overflow: "hidden",
		backgroundColor: frame.railRaised,
		borderWidth: 1,
		borderColor: frame.railBorder,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarImage: {
		width: 32,
		height: 32,
	},
	avatarText: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
		color: frame.railText,
	},
	userName: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
		color: frame.railText,
	},
	bell: {
		width: 40,
		height: 40,
		borderRadius: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	bellDot: {
		position: "absolute",
		top: 10,
		right: 10,
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: frame.railAlert,
		borderWidth: 1.5,
		borderColor: frame.rail,
	},
	pressed: {
		backgroundColor: frame.railRaised,
	},
});
