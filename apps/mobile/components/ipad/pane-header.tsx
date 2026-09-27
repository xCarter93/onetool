import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { NOTCH_CLEARANCE } from "@/components/frame/notch";

// The one title row an iPad pane is allowed: web's page header inside the
// canvas. The sidebar owns org, profile and notifications.

interface PaneHeaderProps {
	title?: string;
	/** Second line under the title — Today's date. */
	sub?: string;
	onBack?: () => void;
	right?: React.ReactNode;
}

export function PaneHeader({ title, sub, onBack, right }: PaneHeaderProps) {
	const t = useTokens();
	return (
		<View style={[styles.root, { borderBottomColor: t.line }]}>
			{onBack ? (
				<Pressable
					onPress={onBack}
					style={[
						styles.iconBtn,
						{ borderColor: t.input, backgroundColor: t.card },
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
			style={[styles.iconBtn, { borderColor: t.input, backgroundColor: t.card }]}
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
		paddingTop: NOTCH_CLEARANCE,
		paddingBottom: 12,
		borderBottomWidth: 1,
	},
	titles: {
		flex: 1,
		minWidth: 0,
	},
	iconBtn: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 20,
		letterSpacing: -0.4,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 1,
	},
});
