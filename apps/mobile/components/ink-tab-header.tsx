import React, { useState } from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type LayoutChangeEvent,
} from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Activity as ActivityIcon,
	Bell,
	type LucideIcon,
} from "lucide-react-native";
import { DotGrid } from "@/components/ui";
import { fontFamily, hero, tokens, tracking } from "@/lib/theme";

const NOTIFICATIONS: Href = "/notifications" as Href;
const ACTIVITY: Href = "/(tabs)/activity" as Href;

function initialsFrom(name?: string | null, email?: string | null): string {
	const source = name?.trim() || email || "?";
	const words = source.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

export interface InkHeaderAction {
	key: string;
	/** Accessibility label — these buttons are icon-only. */
	label: string;
	icon: LucideIcon;
	onPress: () => void;
}

interface InkTabHeaderProps {
	title: string;
	/** Uppercase line above the title. */
	eyebrow?: string;
	/** Extra icon buttons, placed LEFT of the constant bell + avatar cluster. */
	actions?: readonly InkHeaderAction[];
	/** On-ink slot below the title — search field, stat line, pinned controls. */
	children?: React.ReactNode;
}

/**
 * The lighter sibling of today/command-hero: the same ink band language (glow,
 * dot grid, frosted icon circles, rounded foot) for the other tab roots, minus
 * the org chip, greeting and week strip. Screens feed it a title and whatever
 * belongs on ink.
 */
export function InkTabHeader({
	title,
	eyebrow,
	actions,
	children,
}: InkTabHeaderProps) {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const isFocused = useIsFocused();
	const { user } = useUser();
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 1,
	});
	const unread = (notificationData?.unreadCount ?? 0) > 0;

	const userInitials = initialsFrom(
		user?.fullName ?? user?.firstName,
		user?.primaryEmailAddress?.emailAddress,
	);

	// Glow SVG needs measured pixels — Fabric escapes %-sized SVGs inside an
	// indefinite-height parent (same pitfall as dot-grid.tsx).
	const [size, setSize] = useState({ width: 0, height: 0 });
	const onLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		setSize((prev) =>
			prev.width === width && prev.height === height
				? prev
				: { width, height },
		);
	};

	const iconButton = (
		key: string,
		label: string,
		onPress: () => void,
		child: React.ReactNode,
		options?: { avatar?: boolean; dot?: boolean },
	) => (
		<Pressable
			key={key}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			// The circle stays 36pt; the target reaches 44 (bell, avatar, actions).
			hitSlop={4}
			style={[
				styles.iconButton,
				{
					backgroundColor: options?.avatar ? hero.avatarBg : hero.buttonBg,
					borderColor: hero.buttonBorder,
				},
			]}
		>
			{child}
			{options?.dot ? <View style={styles.alertDot} /> : null}
		</Pressable>
	);

	return (
		<View
			onLayout={onLayout}
			style={[styles.band, { paddingTop: insets.top + 6 }]}
		>
			{/* The dark band needs light status-bar glyphs — but only while this
			    screen is the focused tab, or the sibling roots inherit invisible
			    icons. */}
			{isFocused ? <StatusBar style="light" /> : null}
			{size.width > 0 && (
				<Svg
					width={size.width}
					height={size.height}
					style={StyleSheet.absoluteFill}
					pointerEvents="none"
				>
					<Defs>
						<RadialGradient id="inkHeaderGlow" cx="50%" cy="50%" r="50%">
							<Stop offset="0" stopColor={tokens.brand} stopOpacity={0.22} />
							<Stop offset="0.6" stopColor={tokens.brand} stopOpacity={0} />
						</RadialGradient>
					</Defs>
					<Ellipse
						cx={size.width * 0.85}
						cy={-size.height * 0.1}
						rx={size.width * 1.2}
						ry={size.height * 0.9}
						fill="url(#inkHeaderGlow)"
					/>
				</Svg>
			)}
			<DotGrid style={StyleSheet.absoluteFill} color={hero.dotGrid} />

			{/* Title row — the title sits inline with the icon cluster, which is what
			    keeps this band shorter than Today's. */}
			<View style={styles.topRow}>
				<View style={styles.titleBlock}>
					{eyebrow ? (
						<Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
					) : null}
					<Text numberOfLines={1} style={styles.title}>
						{title}
					</Text>
				</View>
				<View style={styles.spacer} />
				{actions?.map((action) =>
					iconButton(
						action.key,
						action.label,
						action.onPress,
						<action.icon size={18} color={hero.text} strokeWidth={2} />,
					),
				)}
				{iconButton(
					"activity",
					"Activity",
					() => router.push(ACTIVITY),
					<ActivityIcon size={18} color={hero.text} strokeWidth={2} />,
				)}
				{iconButton(
					"bell",
					unread ? "Notifications, unread" : "Notifications",
					() => router.push(NOTIFICATIONS),
					<Bell size={18} color={hero.text} strokeWidth={2} />,
					{ dot: unread },
				)}
				{iconButton(
					"avatar",
					"Profile",
					() => router.push("/(tabs)/profile"),
					<Text style={styles.avatarText}>{userInitials}</Text>,
					{ avatar: true },
				)}
			</View>

			{children ? <View style={styles.slot}>{children}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	band: {
		backgroundColor: hero.ink,
		borderBottomLeftRadius: hero.radius,
		borderBottomRightRadius: hero.radius,
		overflow: "hidden",
		paddingHorizontal: 20,
		paddingBottom: 14,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	titleBlock: {
		flexShrink: 1,
		minWidth: 0,
	},
	eyebrow: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: tracking.groupLabel,
		color: hero.textDim,
		marginBottom: 2,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 26,
		lineHeight: 31,
		letterSpacing: -0.3,
		color: hero.text,
	},
	spacer: {
		flex: 1,
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
	slot: {
		marginTop: 16,
		gap: 10,
	},
});
