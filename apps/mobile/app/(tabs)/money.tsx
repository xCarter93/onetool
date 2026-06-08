import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fontFamily, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow } from "@/components/ui";

// Themed placeholder for P19 — the real Money surface (quotes + invoices) lands
// in P23. No mock data here (per CONTEXT: no throwaway money UI).
export default function MoneyScreen() {
	const t = useTokens();

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: t.surface }}
			edges={[]}
		>
			<AppHeader mode="root" title="Money" />
			<View style={styles.center}>
				<Card style={styles.card}>
					<Eyebrow>Coming together</Eyebrow>
					<Text style={[styles.body, { color: t.sub }]}>
						Quotes and invoices arrive in a later update.
					</Text>
				</Card>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	card: {
		width: "100%",
		gap: 8,
	},
	body: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
		lineHeight: 20,
	},
});
