import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";

// Assistant sheet — the center tab-bar FAB's destination.
//
// P2 SHIPS THE UNAVAILABLE STATE ONLY. P3 replaces this body with the real chat
// behind the server-side plan gate. Copy states unavailability and nothing else:
// no upsell, no "upgrade on the web", no billing deep-link — Apple's
// anti-steering rules treat even directional text as a violation, and the same
// neutral wording is what the free tier will see permanently.
export default function AssistantSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();

	const body = (
		<View style={styles.body}>
			<View style={[styles.mark, { backgroundColor: t.frostedBg }]}>
				<Sparkles size={26} color={t.frostedInk} strokeWidth={2.2} />
			</View>
			<Text style={[styles.title, { color: t.ink }]}>Assistant</Text>
			<Text style={[styles.copy, { color: t.sub }]}>
				The assistant isn&apos;t available yet.
			</Text>
			<Button
				title="Close"
				variant="secondary"
				onPress={() => router.back()}
				style={styles.action}
			/>
		</View>
	);

	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="60%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>{body}</View>
			</CenteredModal>
		);
	}

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom + 24 },
			]}
		>
			{body}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	padCard: {
		flex: 1,
	},
	body: {
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
	action: {
		marginTop: 14,
		alignSelf: "stretch",
	},
});
