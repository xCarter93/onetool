import { StyleSheet, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { useEntitlements } from "@/lib/use-entitlements";
import { AssistantChat } from "./assistant-chat";

// Server-truth access gate around the chat. The aiAssistant switch is on for
// every plan (volume rides the assistantMessages meter inside the chat);
// LockedBody survives only as the kill-switch state. The locked copy states
// unavailability and NOTHING else — no upsell, no "upgrade on the web", no
// billing link (Apple anti-steering treats even directional text as a
// violation).
export function AssistantHost({
	screenContext,
	keyboardBottomGap,
}: {
	screenContext?: string;
	keyboardBottomGap?: number;
}) {
	const { isLoading, allows } = useEntitlements();

	if (isLoading) return <View style={styles.fill} />;
	if (!allows("aiAssistant")) return <LockedBody />;
	return (
		<AssistantChat
			screenContext={screenContext}
			keyboardBottomGap={keyboardBottomGap}
		/>
	);
}

function LockedBody() {
	const t = useTokens();
	return (
		<View style={styles.locked}>
			<View style={[styles.mark, { backgroundColor: t.frostedBg }]}>
				<Sparkles size={26} color={t.frostedInk} strokeWidth={2.2} />
			</View>
			<Text style={[styles.title, { color: t.ink }]}>Assistant</Text>
			<Text style={[styles.copy, { color: t.sub }]}>
				The assistant isn&apos;t included in your plan.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	fill: {
		flex: 1,
	},
	locked: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		paddingHorizontal: 32,
	},
	mark: {
		width: 56,
		height: 56,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h2,
	},
	copy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
		textAlign: "center",
	},
});
