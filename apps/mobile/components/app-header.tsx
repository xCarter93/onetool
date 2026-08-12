import React, { useState } from "react";
import {
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useRouter, type Href } from "expo-router";
import { useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ArrowLeft, Bell, Plus } from "lucide-react-native";
import { fontFamily, radii, tokens, tracking, type, useTokens } from "@/lib/theme";
import { Avatar, HalftoneBg, ScrollFade } from "@/components/ui";

// Every call site is a pushed record screen ("detail") or an iPad pane
// ("pane"): the tab roots all mount the ink band (InkTabHeader) instead, so
// this header has no root mode and therefore no org chip and no search jump.
type HeaderMode = "detail" | "pane";

interface AppHeaderProps {
	title?: string;
	sub?: string;
	mode: HeaderMode;
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
	/**
	 * Set false when the screen pins its own controls directly below the header
	 * (Today's week strip, Work's search field). The fade paints 28px BELOW the
	 * header onto the next sibling, which only works if that sibling is scroll
	 * content carrying SCROLL_TOP_INSET — over a pinned control it just clips it.
	 * Those screens render the fade themselves, under their controls block.
	 */
	fade?: boolean;
	/** Halftone wash behind the header. Off for map surfaces (Routes). */
	halftone?: boolean;
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
	mode,
	home,
	titleSize,
	onAdd,
	addLabel,
	fade = true,
	halftone = false,
}: AppHeaderProps) {
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
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

	const userInitials = initialsFrom(
		user?.fullName ?? user?.firstName,
		user?.primaryEmailAddress?.emailAddress,
	);

	// Form-sheet route not yet in the generated route types — cast keeps the
	// typed router clean.
	const NOTIFICATIONS: Href = "/notifications" as Href;

	// Pane mode (iPad P26): a light header — optional title ONLY. The sidebar
	// owns the bell and avatar, and there is no back arrow: this header renders
	// only when the shell provides no onBack (landscape master-detail, where the
	// list stays visible and nothing was pushed — router.back() would throw
	// GO_BACK unhandled).
	if (pane) {
		const paneTop = Math.max(insets.top, 36);
		return (
			<View style={{ paddingTop: paneTop, zIndex: 3 }}>
				<View style={styles.topRow}>
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
			// box-none: on overlay surfaces (Routes map) the header must not
			// swallow touches outside its interactive children.
			pointerEvents="box-none"
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
						{/* intensity must stay 100: fractional intensities use expo-blur's
						    paused-animator hack, which renders unreliably over Metal-backed
						    views (the Mapbox map showed through nearly un-blurred). */}
						<BlurView
							tint="systemThickMaterialLight"
							intensity={100}
							style={StyleSheet.absoluteFill}
						/>
						{/* Halftone wash. Sits UNDER the bg tint, so the effective opacity
						    is roughly brand*0.45+0.3 times the tint's transmission — the two
						    knobs if it reads too strong or too faint. Needs the measured
						    height box above it: absoluteFill in an indefinite-height parent
						    escapes to full-screen on Fabric. */}
						{halftone ? (
							<HalftoneBg
								brand={0.2}
								imageFit="width"
								style={StyleSheet.absoluteFill}
							/>
						) : null}
						<View
							style={[
								StyleSheet.absoluteFill,
								{
									backgroundColor: `${t.bg}8C`,
									borderBottomWidth: 1,
									borderBottomColor: t.line,
								},
							]}
						/>
					</>
				</View>
			) : null}

			{/* Top row */}
			<View style={styles.topRow} pointerEvents="box-none">
				<Pressable
					onPress={() => router.back()}
					hitSlop={4}
					style={[styles.iconBtn, { borderColor: t.line }]}
					accessibilityRole="button"
					accessibilityLabel="Go back"
				>
					<ArrowLeft size={20} color={t.ink} />
				</Pressable>

				<View style={{ flex: 1 }} pointerEvents="none" />

				{/* Constant right cluster */}
				{onAdd ? (
					<Pressable
						onPress={onAdd}
						style={styles.bareBtn}
						accessibilityRole="button"
						accessibilityLabel={addLabel ?? "Create"}
					>
						<Plus size={22} color={t.ink} strokeWidth={2.2} />
					</Pressable>
				) : null}

				<Pressable
					onPress={() => router.push(NOTIFICATIONS)}
					style={styles.bareBtn}
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
					style={styles.bareBtn}
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

			{/* Soft fade so scroll content dissolves into the header. Screens that pin
			    controls under the header pass fade={false} and place it themselves. */}
			{!home && fade ? <ScrollFade edge="top" /> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
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
		backgroundColor: tokens.card,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	bareBtn: {
		position: "relative",
		alignItems: "center",
		justifyContent: "center",
		width: 44,
		height: 44,
		flexShrink: 0,
	},
	// Presence dot, not a counter — the count lives on the notifications screen.
	unreadDot: {
		position: "absolute",
		top: 10,
		right: 10,
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
