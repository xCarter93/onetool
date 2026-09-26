import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { colors, fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";
import { Illustration } from "@/components/illustrations";

// Catch-all for unmatched routes (expo-router convention) — most often a stale
// or malformed push-notification deep link. One action only: back to Today,
// since a mistaken deep link may have no real back-stack to return to.
export default function NotFoundScreen() {
	const t = useTokens();
	const router = useRouter();

	return (
		<SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
			<View style={styles.content}>
				<Illustration name="app-error" knockout={t.bg} style={styles.art} />
				<Text style={[styles.title, { color: t.ink }]}>Page not found</Text>
				<Text style={[styles.body, { color: t.sub }]}>
					That link didn&apos;t lead anywhere. Let&apos;s get you back to
					today.
				</Text>
				<Pressable
					onPress={() => router.replace("/(tabs)" as Href)}
					accessibilityRole="button"
					accessibilityLabel="Go to Today"
					style={({ pressed }) => [
						styles.button,
						{ backgroundColor: t.primarySolid },
						pressed && styles.buttonPressed,
					]}
				>
					<Text style={[styles.buttonLabel, { color: colors.primaryForeground }]}>
						Go to Today
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	content: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
	},
	art: {
		marginBottom: 16,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h1,
		marginBottom: 8,
		textAlign: "center",
	},
	body: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		textAlign: "center",
		lineHeight: 20,
	},
	button: {
		marginTop: 24,
		minHeight: 46,
		paddingHorizontal: 24,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii["4xl"],
		boxShadow: shadow.md,
	},
	buttonPressed: {
		opacity: 0.9,
	},
	buttonLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
});
