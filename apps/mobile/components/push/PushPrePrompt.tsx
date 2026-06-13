import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Bell } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";

interface PushPrePromptProps {
	// Enable delegates to the host's enablePushNotifications (the single owner of
	// the system permission request); this component never requests permission itself.
	onEnable: () => void;
	onDismiss: () => void;
}

// Soft pre-prompt (mention-framed). Reusable from the first-entry host gate and
// the always-on notifications-screen affordance. Visibility/dismiss is owned by
// the caller (the host owns the AsyncStorage gate).
export function PushPrePrompt({ onEnable, onDismiss }: PushPrePromptProps) {
	const t = useTokens();

	return (
		<Modal
			visible
			transparent
			animationType="fade"
			onRequestClose={onDismiss}
		>
			<View style={styles.scrim}>
				<View style={[styles.card, { backgroundColor: t.card }]}>
					<View style={[styles.iconTile, { backgroundColor: t.accentSoft }]}>
						<Bell size={28} color={t.accent} />
					</View>
					<Text style={[styles.title, { color: t.ink }]}>Stay in the loop</Text>
					<Text style={[styles.body, { color: t.sub }]}>
						Get notified when a teammate mentions you.
					</Text>
					<Pressable
						onPress={onEnable}
						accessibilityRole="button"
						style={({ pressed }) => [
							styles.enableBtn,
							{ backgroundColor: pressed ? t.accentMid : t.accent },
						]}
					>
						<Text style={styles.enableText}>Enable</Text>
					</Pressable>
					<Pressable
						onPress={onDismiss}
						accessibilityRole="button"
						hitSlop={8}
						style={styles.dismissBtn}
					>
						<Text style={[styles.dismissText, { color: t.sub }]}>Not now</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	scrim: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
	},
	card: {
		width: "100%",
		maxWidth: 360,
		borderRadius: 24,
		paddingVertical: 28,
		paddingHorizontal: 24,
		alignItems: "center",
	},
	iconTile: {
		width: 64,
		height: 64,
		borderRadius: 32,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	title: {
		fontSize: 20,
		lineHeight: 28,
		fontFamily: fontFamily.bold,
		textAlign: "center",
		marginBottom: 6,
	},
	body: {
		fontSize: type.body,
		lineHeight: 22,
		fontFamily: fontFamily.regular,
		textAlign: "center",
		marginBottom: 22,
	},
	enableBtn: {
		alignSelf: "stretch",
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: "center",
	},
	enableText: {
		color: "#fff",
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
	},
	dismissBtn: {
		paddingVertical: 12,
		marginTop: 4,
	},
	dismissText: {
		fontSize: type.sm,
		fontFamily: fontFamily.medium,
	},
});
