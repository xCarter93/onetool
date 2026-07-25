import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";

// The one title row an iPad pane is allowed (locked: one pane → one header). NO
// org chip, NO bell, NO avatar — the rail owns all three.

interface PaneHeaderProps {
	title?: string;
	/** Second line under the title — Today's date. */
	sub?: string;
	onBack?: () => void;
	right?: React.ReactNode;
}

export function PaneHeader({ title, sub, onBack, right }: PaneHeaderProps) {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const safeTop = Math.max(insets.top, 36);

	return (
		<View style={[styles.root, { paddingTop: safeTop }]}>
			{onBack ? (
				<Pressable
					onPress={onBack}
					style={[
						styles.iconBtn,
						{ borderColor: t.line, backgroundColor: t.card },
					]}
					accessibilityRole="button"
					accessibilityLabel="Go back"
				>
					<ArrowLeft size={20} color={t.ink} />
				</Pressable>
			) : null}

			{/* Always present so `right` stays pinned to the trailing edge. */}
			<View style={styles.titles}>
				{title ? (
					<Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>
						{title}
					</Text>
				) : null}
				{sub ? (
					<Text style={[styles.sub, { color: t.sub }]} numberOfLines={1}>
						{sub}
					</Text>
				) : null}
			</View>

			{right ?? null}
		</View>
	);
}

// Icon-only pane action (the contextual ＋). `label` is required — it is the only
// thing a screen reader can announce.
export function PaneAction({
	icon: Icon,
	label,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	onPress: () => void;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			style={[styles.iconBtn, { borderColor: t.line, backgroundColor: t.card }]}
			accessibilityRole="button"
			accessibilityLabel={label}
		>
			<Icon size={20} color={t.ink} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	root: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingBottom: 12,
	},
	titles: {
		flex: 1,
		minWidth: 0,
	},
	iconBtn: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h2,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		marginTop: 1,
	},
});
