import React, { useState } from "react";
import {
	Image,
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useRouter, type Href } from "expo-router";
import { useOrganization, useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ArrowLeft, Bell, ChevronDown } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";

// mode: 'root' | 'detail' | 'pane' — P19 uses root/detail; 'pane' reserved for P26 iPad.
type HeaderMode = "root" | "detail" | "pane";

interface AppHeaderProps {
	title?: string;
	sub?: string;
	mode?: HeaderMode;
	home?: boolean;
	titleSize?: number;
}

function initialsFrom(name?: string | null, email?: string | null): string {
	if (name) {
		const words = name.trim().split(/\s+/);
		if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
		return words[0].slice(0, 2).toUpperCase();
	}
	if (email) return email[0]?.toUpperCase() ?? "?";
	return "?";
}

export function AppHeader({
	title,
	sub,
	mode = "root",
	home,
	titleSize,
}: AppHeaderProps) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { organization } = useOrganization();
	const { user } = useUser();

	// Unread notifications count for the bell badge (read-only, org-scoped).
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 1,
	});
	const unreadCount = notificationData?.unreadCount ?? 0;

	// Measure the header so the brand wash gets a DEFINITE-height box. HalftoneBg /
	// BlurView use absoluteFill, which escapes to full-screen inside an
	// indefinite-height parent on Fabric (this is what painted BG.png behind the
	// whole Home screen). overflow:hidden does not clip that escape.
	const [headerHeight, setHeaderHeight] = useState(0);
	const onHeaderLayout = (e: LayoutChangeEvent) =>
		setHeaderHeight(e.nativeEvent.layout.height);

	const detail = mode === "detail";
	const orgName = organization?.name ?? "Personal";
	const orgInitials = initialsFrom(orgName);
	const userInitials = initialsFrom(
		user?.fullName ?? user?.firstName,
		user?.primaryEmailAddress?.emailAddress,
	);

	// Form-sheet routes not yet in the generated route types — cast keeps the
	// typed router clean.
	const ORG_SWITCH: Href = "/org-switch" as Href;
	const NOTIFICATIONS: Href = "/notifications" as Href;

	return (
		<View style={{ paddingTop: insets.top + 8 }} onLayout={onHeaderLayout}>
			{!home ? (
				<View
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						height: headerHeight,
						overflow: "hidden",
					}}
					pointerEvents="none"
				>
					<>
						<BlurView
							tint="light"
							intensity={90}
							style={StyleSheet.absoluteFill}
						/>
						<View
							style={[
								StyleSheet.absoluteFill,
								{
									backgroundColor: "rgba(245,247,249,0.55)",
									borderBottomWidth: 1,
									borderBottomColor: t.line,
								},
							]}
						/>
					</>
				</View>
			) : null}

			{/* Top row */}
			<View style={styles.topRow}>
				{detail ? (
					<Pressable
						onPress={() => router.back()}
						style={[styles.iconBtn, { borderColor: t.line }]}
						accessibilityRole="button"
						accessibilityLabel="Go back"
					>
						<ArrowLeft size={20} color={t.ink} />
					</Pressable>
				) : (
					<Pressable
						onPress={() => router.push(ORG_SWITCH)}
						style={[styles.orgChip, { borderColor: t.line }]}
						accessibilityRole="button"
						accessibilityLabel="Switch organization"
					>
						{organization?.imageUrl ? (
							<Image
								source={{ uri: organization.imageUrl }}
								style={styles.orgTile}
							/>
						) : (
							<View
								style={[styles.orgTile, { backgroundColor: t.accent }]}
							>
								<Text style={styles.orgTileText}>{orgInitials}</Text>
							</View>
						)}
						<Text
							style={[styles.orgName, { color: t.ink }]}
							numberOfLines={1}
						>
							{orgName}
						</Text>
						<ChevronDown size={15} color={t.sub} />
					</Pressable>
				)}

				<View style={{ flex: 1 }} />

				{/* Constant right cluster (root + detail) */}
				<Pressable
					onPress={() => router.push(NOTIFICATIONS)}
					style={[styles.iconBtn, { borderColor: t.line }]}
					accessibilityRole="button"
					accessibilityLabel="Notifications"
				>
					<Bell size={20} color={t.ink} />
					{unreadCount > 0 && (
						<View style={[styles.badge, { backgroundColor: t.danger }]}>
							<Text style={styles.badgeText}>
								{unreadCount > 9 ? "9+" : unreadCount}
							</Text>
						</View>
					)}
				</Pressable>

				<Pressable
					onPress={() => router.push("/(tabs)/profile")}
					accessibilityRole="button"
					accessibilityLabel="Profile"
				>
					<Avatar
						text={userInitials}
						size={40}
						imageUrl={user?.hasImage ? user.imageUrl : null}
					/>
				</Pressable>
			</View>

			{/* Optional title block */}
			{title ? (
				<View style={styles.titleBlock}>
					{sub ? (
						<Text style={[styles.eyebrow, { color: t.accent }]}>
							{sub.toUpperCase()}
						</Text>
					) : null}
					<Text
						style={[
							styles.title,
							{ color: t.ink, fontSize: titleSize ?? 25 },
						]}
						numberOfLines={1}
					>
						{title}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
	},
	iconBtn: {
		position: "relative",
		width: 40,
		height: 40,
		borderRadius: 13,
		backgroundColor: "#fff",
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	orgChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderRadius: 999,
		paddingVertical: 5,
		paddingLeft: 5,
		paddingRight: 11,
		flexShrink: 1,
		minWidth: 0,
	},
	orgTile: {
		width: 28,
		height: 28,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 12,
		color: "#fff",
	},
	orgName: {
		fontFamily: fontFamily.bold,
		fontSize: 14,
		maxWidth: 150,
	},
	badge: {
		position: "absolute",
		top: -4,
		right: -4,
		minWidth: 16,
		height: 16,
		paddingHorizontal: 4,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "#fff",
	},
	badgeText: {
		fontFamily: fontFamily.bold,
		fontSize: 10,
		color: "#fff",
	},
	titleBlock: {
		paddingHorizontal: 16,
		paddingBottom: 12,
		paddingTop: 10,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: 12.5,
		letterSpacing: 0.6,
		marginBottom: 2,
	},
	title: {
		fontFamily: fontFamily.bold,
		letterSpacing: -0.5,
		lineHeight: 28,
	},
});
