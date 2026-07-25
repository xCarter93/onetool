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
import { ArrowLeft, Bell, ChevronDown, Plus } from "lucide-react-native";
import { fontFamily, radii, tracking, type, useTokens } from "@/lib/theme";
import { Avatar, ScrollFade } from "@/components/ui";

// mode: 'root' | 'detail' | 'pane' — P19 uses root/detail; 'pane' reserved for P26 iPad.
type HeaderMode = "root" | "detail" | "pane";

interface AppHeaderProps {
	title?: string;
	sub?: string;
	mode?: HeaderMode;
	home?: boolean;
	titleSize?: number;
	/**
	 * Contextual create. Each surface supplies the ONE record type it can create
	 * (Today → task, Work→Clients → client), which is what replaced the /create
	 * mega-menu. Omit and no ＋ renders.
	 */
	onAdd?: () => void;
	/** Required whenever `onAdd` is set — the ＋ is icon-only. */
	addLabel?: string;
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
	onAdd,
	addLabel,
}: AppHeaderProps) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { organization } = useOrganization();
	const { user } = useUser();

	// Pane mode (iPad panes) renders no bell — so the notifications query must
	// not run. Skip-gate it on mode !== "pane".
	const pane = mode === "pane";
	const notificationData = useQuery(
		api.notifications.listForCurrentUser,
		pane ? "skip" : { limit: 1 },
	);
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

	// Pane mode (iPad P26): a light header — back arrow + optional title ONLY.
	// The sidebar owns the org chip, bell, and avatar, so all three are
	// suppressed here. Additive: root/detail paths below are byte-identical.
	if (pane) {
		const paneTop = Math.max(insets.top, 36);
		return (
			<View style={{ paddingTop: paneTop, zIndex: 3 }}>
				<View style={styles.topRow}>
					<Pressable
						onPress={() => router.back()}
						hitSlop={4}
						style={[styles.iconBtn, { borderColor: t.line }]}
						accessibilityRole="button"
						accessibilityLabel="Go back"
					>
						<ArrowLeft size={20} color={t.ink} />
					</Pressable>
					{title ? (
						<Text
							style={[styles.paneTitle, { color: t.ink }]}
							numberOfLines={1}
						>
							{title}
						</Text>
					) : null}
				</View>
			</View>
		);
	}

	return (
		<View
			style={{ paddingTop: insets.top + 8, zIndex: 3 }}
			onLayout={onHeaderLayout}
		>
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
									backgroundColor: "rgba(246,247,248,0.55)",
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
						hitSlop={4}
						style={[styles.iconBtn, { borderColor: t.line }]}
						accessibilityRole="button"
						accessibilityLabel="Go back"
					>
						<ArrowLeft size={20} color={t.ink} />
					</Pressable>
				) : (
					<Pressable
						onPress={() => router.push(ORG_SWITCH)}
						hitSlop={6}
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
							<View style={styles.orgTile}>
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
				{onAdd ? (
					<Pressable
						onPress={onAdd}
						style={styles.bareBtn}
						hitSlop={10}
						accessibilityRole="button"
						accessibilityLabel={addLabel ?? "Create"}
					>
						<Plus size={22} color={t.ink} strokeWidth={2.2} />
					</Pressable>
				) : null}

				<Pressable
					onPress={() => router.push(NOTIFICATIONS)}
					style={styles.bareBtn}
					hitSlop={10}
					accessibilityRole="button"
					accessibilityLabel={
						unreadCount > 0
							? `Notifications, ${unreadCount} unread`
							: "Notifications"
					}
				>
					<Bell size={21} color={t.ink} strokeWidth={2} />
					{unreadCount > 0 && (
						<View
							style={[
								styles.unreadDot,
								{ backgroundColor: t.danger, borderColor: t.bg },
							]}
						/>
					)}
				</Pressable>

				<Pressable
					onPress={() => router.push("/(tabs)/profile")}
					hitSlop={10}
					accessibilityRole="button"
					accessibilityLabel="Profile"
				>
					<Avatar
						text={userInitials}
						size={30}
						imageUrl={user?.hasImage ? user.imageUrl : null}
					/>
				</Pressable>
			</View>

			{/* Optional title block */}
			{title ? (
				<View style={styles.titleBlock}>
					{sub ? (
						<Text style={[styles.eyebrow, { color: t.sub }]}>
							{sub.toUpperCase()}
						</Text>
					) : null}
					<Text
						style={[
							styles.title,
							{ color: t.ink, fontSize: titleSize ?? type.h1 },
						]}
						numberOfLines={1}
					>
						{title}
					</Text>
				</View>
			) : null}

			{/* Soft fade so scroll content dissolves into the header (skip on Home —
			    its dark halftone hero must not fade to the light surface). */}
			{!home ? <ScrollFade edge="top" /> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		paddingHorizontal: 18,
		// Breathing room below the icon row so screen content / the title block
		// never sits flush against it (notably on detail screens with no title).
		paddingBottom: 10,
	},
	iconBtn: {
		position: "relative",
		width: 40,
		height: 40,
		borderRadius: radii.xl,
		backgroundColor: "#fff",
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	// Bare chip — no pill, no border. Chrome recedes; the org mark carries it.
	orgChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 5,
		flexShrink: 1,
		minWidth: 0,
	},
	bareBtn: {
		position: "relative",
		alignItems: "center",
		justifyContent: "center",
		width: 24,
		height: 24,
		flexShrink: 0,
	},
	orgTile: {
		width: 26,
		height: 26,
		borderRadius: 7,
		experimental_backgroundImage:
			"linear-gradient(135deg, #00a6f4, #0077c2)",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 11.5,
		color: "#fff",
	},
	orgName: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
		maxWidth: 170,
	},
	// Presence dot, not a counter — the count lives on the notifications screen.
	unreadDot: {
		position: "absolute",
		top: -1,
		right: -1,
		width: 8,
		height: 8,
		borderRadius: 4,
		borderWidth: 1.5,
	},
	paneTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h2,
		flexShrink: 1,
	},
	titleBlock: {
		paddingHorizontal: 18,
		paddingBottom: 12,
		paddingTop: 2,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
		marginBottom: 3,
	},
	title: {
		fontFamily: fontFamily.semibold,
		letterSpacing: tracking.title,
		lineHeight: 30,
	},
});
