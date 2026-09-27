import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Compass } from "lucide-react-native";
import { EmptyPanel } from "@/components/canvas";
import { Button } from "@/components/ui";
import { useTokens } from "@/lib/theme";

// Catch-all for unmatched routes (expo-router convention) — most often a stale
// or malformed push-notification deep link. One action only: back to Today,
// since a mistaken deep link may have no real back-stack to return to.
export default function NotFoundScreen() {
	const t = useTokens();
	const router = useRouter();

	return (
		<SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
			<View style={styles.content}>
				<EmptyPanel
					icon={Compass}
					title="Page not found"
					body="That link didn't lead anywhere. Let's get you back to today."
					action={
						<Button
							title="Go to Today"
							onPress={() => router.replace("/(tabs)" as Href)}
						/>
					}
				/>
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
		paddingHorizontal: 16,
	},
});
