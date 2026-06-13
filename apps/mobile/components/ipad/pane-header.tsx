import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";

// Light per-pane header that replaces AppHeader inside an iPad pane. NO org chip,
// NO bell, NO avatar — the sidebar owns all three. Renders only an optional back
// affordance, an optional title, and an optional right slot (e.g. search).

interface PaneHeaderProps {
	title?: string;
	onBack?: () => void;
	right?: React.ReactNode;
}

export function PaneHeader({ title, onBack, right }: PaneHeaderProps) {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const safeTop = Math.max(insets.top, 36);

	return (
		<View style={[styles.root, { paddingTop: safeTop }]}>
			{onBack ? (
				<Pressable
					onPress={onBack}
					style={[styles.backBtn, { borderColor: t.line }]}
					accessibilityRole="button"
					accessibilityLabel="Go back"
				>
					<ArrowLeft size={20} color={t.ink} />
				</Pressable>
			) : null}

			{title ? (
				<Text style={[styles.title, { color: t.ink }]} numberOfLines={1}>
					{title}
				</Text>
			) : null}

			<View style={{ flex: 1 }} />

			{right ?? null}
		</View>
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
	backBtn: {
		width: 40,
		height: 40,
		borderRadius: 13,
		borderWidth: 1,
		backgroundColor: "#fff",
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: 18,
	},
});
