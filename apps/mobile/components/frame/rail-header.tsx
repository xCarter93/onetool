import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useOrganization, useUser } from "@clerk/expo";
import {
	Activity as ActivityIcon,
	ArrowLeft,
	Bell,
	ChevronsUpDown,
} from "lucide-react-native";
import { fontFamily, frame } from "@/lib/theme";
import { useNotificationData } from "@/lib/use-notification-data";

export function initialsFrom(name?: string | null, email?: string | null): string {
	const source = name?.trim() || email || "?";
	const words = source.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

export function RailIconButton({
	label,
	onPress,
	dot = false,
	children,
}: {
	label: string;
	onPress: () => void;
	dot?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={4}
			style={({ pressed }) => [
				styles.iconButton,
				pressed && { backgroundColor: frame.railRaised },
			]}
		>
			{children}
			{dot ? <View style={styles.alertDot} /> : null}
		</Pressable>
	);
}

export function RailOrgChip() {
	const router = useRouter();
	const { organization } = useOrganization();
	const orgName = organization?.name ?? "Personal";
	const [logoFailed, setLogoFailed] = useState(false);
	const [prevOrgLogo, setPrevOrgLogo] = useState(organization?.imageUrl);
	if (organization?.imageUrl !== prevOrgLogo) {
		setPrevOrgLogo(organization?.imageUrl);
		setLogoFailed(false);
	}

	return (
		<Pressable
			onPress={() => router.push("/org-switch" as Href)}
			accessibilityRole="button"
			accessibilityLabel={`${orgName}, switch organization`}
			style={({ pressed }) => [styles.orgChip, pressed && { backgroundColor: frame.railRaised }]}
		>
			{organization?.imageUrl && !logoFailed ? (
				<Image
					source={{ uri: organization.imageUrl }}
					style={styles.orgTile}
					contentFit="cover"
					cachePolicy="disk"
					transition={150}
					onError={() => setLogoFailed(true)}
				/>
			) : (
				<View style={[styles.orgTile, styles.orgTileFill]}>
					<Text style={styles.orgTileText}>{initialsFrom(orgName)}</Text>
				</View>
			)}
			<Text numberOfLines={1} style={styles.orgName}>
				{orgName}
			</Text>
			<ChevronsUpDown size={14} color={frame.railMuted} strokeWidth={2} />
		</Pressable>
	);
}

/** Activity, notifications and the profile avatar, right-aligned on the rail. */
export function RailActions() {
	const router = useRouter();
	const { user } = useUser();
	const notificationData = useNotificationData();
	const unread = (notificationData?.unreadCount ?? 0) > 0;
	const initials = initialsFrom(
		user?.fullName ?? user?.firstName,
		user?.primaryEmailAddress?.emailAddress,
	);

	return (
		<>
			<RailIconButton label="Activity" onPress={() => router.push("/activity" as Href)}>
				<ActivityIcon size={18} color={frame.railMuted} strokeWidth={2} />
			</RailIconButton>
			<RailIconButton
				label={unread ? "Notifications, unread" : "Notifications"}
				onPress={() => router.push("/notifications" as Href)}
				dot={unread}
			>
				<Bell size={18} color={frame.railMuted} strokeWidth={2} />
			</RailIconButton>
			<RailIconButton label="Profile" onPress={() => router.push("/profile" as Href)}>
				<View style={styles.avatar}>
					<Text style={styles.avatarText}>{initials}</Text>
				</View>
			</RailIconButton>
		</>
	);
}

export function RailHeader({ onBack }: { onBack?: () => void }) {
	return (
		<View style={styles.header}>
			{onBack ? (
				<RailIconButton label="Back" onPress={onBack}>
					<ArrowLeft size={20} color={frame.railText} strokeWidth={2} />
				</RailIconButton>
			) : null}
			<RailOrgChip />
			<View style={styles.spacer} />
			<RailActions />
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		height: frame.headerHeight,
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingHorizontal: 8,
	},
	spacer: {
		flex: 1,
	},
	iconButton: {
		width: frame.headerButton,
		height: frame.headerButton,
		borderRadius: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	alertDot: {
		position: "absolute",
		top: 8,
		right: 8,
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: frame.railAlert,
		borderWidth: 1.5,
		borderColor: frame.rail,
	},
	orgChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexShrink: 1,
		height: frame.headerButton,
		paddingHorizontal: 6,
		borderRadius: 4,
	},
	orgTile: {
		width: 26,
		height: 26,
		borderRadius: 6,
	},
	// minWidth/minHeight let the tile grow at large Dynamic Type sizes instead of clipping.
	orgTileFill: {
		width: undefined,
		height: undefined,
		minWidth: 26,
		minHeight: 26,
		paddingHorizontal: 3,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: frame.railAccent,
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 11,
		color: frame.railAccentInk,
	},
	orgName: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: frame.railText,
		flexShrink: 1,
	},
	avatar: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: frame.railRaised,
		borderWidth: 1,
		borderColor: frame.railBorder,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarText: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		color: frame.railText,
	},
});
