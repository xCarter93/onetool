import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import { useOrganization, useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Activity as ActivityIcon,
	Bell,
	ChevronDown,
} from "lucide-react-native";
import { fontFamily, hero, useTokens } from "@/lib/theme";

const NOTIFICATIONS: Href = "/notifications" as Href;
const ACTIVITY: Href = "/(tabs)/activity" as Href;
const PROFILE: Href = "/(tabs)/profile" as Href;
const ORG_SWITCH: Href = "/org-switch" as Href;

function initialsFrom(name?: string | null, email?: string | null): string {
	const source = name?.trim() || email || "?";
	const words = source.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

interface InkIconButtonProps {
	/** Accessibility label — these buttons are icon-only. */
	label: string;
	onPress: () => void;
	/** Avatar tint instead of the frosted button tint. */
	avatar?: boolean;
	/** Unread presence dot in the top-right corner. */
	dot?: boolean;
	children: React.ReactNode;
}

/**
 * The one frosted circle used by every ink band (band actions, back circle, and
 * the constant cluster below). The circle stays 36pt; hitSlop takes the target
 * to 44.
 */
export function InkIconButton({
	label,
	onPress,
	avatar = false,
	dot = false,
	children,
}: InkIconButtonProps) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={4}
			style={[
				inkClusterStyles.iconButton,
				{
					backgroundColor: avatar ? hero.avatarBg : hero.buttonBg,
					borderColor: hero.buttonBorder,
				},
			]}
		>
			{children}
			{dot ? <View style={inkClusterStyles.alertDot} /> : null}
		</Pressable>
	);
}

interface InkHeaderClusterProps {
	/** Drop the Activity quick-link — the Activity root can't link to itself. */
	hideActivity?: boolean;
	/** Drop the avatar — the Profile root can't link to itself. */
	hideAvatar?: boolean;
}

/**
 * The constant right-hand icon cluster shared by every ink band: Activity →
 * Bell → Avatar. Owns the unread subscription and the Clerk initials so no
 * screen (and no band) has to re-derive them. Renders a fragment so the
 * parent row's `gap` spaces the buttons.
 */
export function InkHeaderCluster({
	hideActivity = false,
	hideAvatar = false,
}: InkHeaderClusterProps) {
	const router = useRouter();
	const { user } = useUser();
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 1,
	});
	const unread = (notificationData?.unreadCount ?? 0) > 0;

	const userInitials = initialsFrom(
		user?.fullName ?? user?.firstName,
		user?.primaryEmailAddress?.emailAddress,
	);

	return (
		<>
			{hideActivity ? null : (
				<InkIconButton label="Activity" onPress={() => router.push(ACTIVITY)}>
					<ActivityIcon size={18} color={hero.text} strokeWidth={2} />
				</InkIconButton>
			)}
			<InkIconButton
				label={unread ? "Notifications, unread" : "Notifications"}
				onPress={() => router.push(NOTIFICATIONS)}
				dot={unread}
			>
				<Bell size={18} color={hero.text} strokeWidth={2} />
			</InkIconButton>
			{hideAvatar ? null : (
				<InkIconButton
					label="Profile"
					onPress={() => router.push(PROFILE)}
					avatar
				>
					<Text style={inkClusterStyles.avatarText}>{userInitials}</Text>
				</InkIconButton>
			)}
		</>
	);
}

/**
 * The org-switcher chip the main tab bands lead with (Today via CommandHero,
 * Work and Money in place of a title — the tab's identity lives in the dock,
 * so the band's left slot goes to the org). Pushes /org-switch.
 */
export function InkOrgChip() {
	const router = useRouter();
	const t = useTokens();
	const { organization } = useOrganization();
	const orgName = organization?.name ?? "Personal";
	const orgInitials = initialsFrom(orgName);

	return (
		<Pressable
			onPress={() => router.push(ORG_SWITCH)}
			accessibilityRole="button"
			accessibilityLabel="Switch organization"
			style={inkClusterStyles.orgChip}
		>
			{organization?.imageUrl ? (
				<Image
					source={{ uri: organization.imageUrl }}
					style={inkClusterStyles.orgTile}
				/>
			) : (
				<LinearGradient
					colors={[t.brand, t.primarySolid]}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 1 }}
					style={[inkClusterStyles.orgTile, inkClusterStyles.orgTileFill]}
				>
					<Text style={inkClusterStyles.orgTileText}>{orgInitials}</Text>
				</LinearGradient>
			)}
			<Text numberOfLines={1} style={inkClusterStyles.orgName}>
				{orgName}
			</Text>
			<ChevronDown size={14} color={hero.textSub} />
		</Pressable>
	);
}

const inkClusterStyles = StyleSheet.create({
	orgChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexShrink: 1,
	},
	orgTile: {
		width: 26,
		height: 26,
		borderRadius: 7,
	},
	orgTileFill: {
		alignItems: "center",
		justifyContent: "center",
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 11,
		color: hero.text,
	},
	orgName: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: hero.text,
		flexShrink: 1,
	},
	iconButton: {
		width: 36,
		height: 36,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	alertDot: {
		position: "absolute",
		top: 7,
		right: 7,
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: hero.alertDot,
		borderWidth: 1.5,
		borderColor: hero.ink,
	},
	avatarText: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
		color: hero.text,
	},
});
