import { StyleSheet, Text, View } from "react-native";
import { Map } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { DotGrid } from "@/components/ui";

// Routes tab — P2 placeholder. P4 replaces this body with the native Mapbox map
// (idle: saved routes in a bottom sheet; running: instrument panel). Route
// CREATION stays web-only at v1, which is why this says "on the web" rather than
// offering a create action.
//
// headerMode default "root" → the iPhone path (own AppHeader) is byte-identical.
// The iPad shell passes "pane" (no detail body, so it has no onSelect/selected).
export default function RoutesScreen({
	headerMode = "root",
}: {
	headerMode?: "root" | "pane";
} = {}) {
	const t = useTokens();
	const isPane = headerMode === "pane";

	return (
		<View style={[styles.screen, { backgroundColor: t.bg }]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{!isPane ? <AppHeader mode="root" title="Routes" /> : null}
			<View style={styles.body}>
				<View style={[styles.mark, { backgroundColor: t.muted }]}>
					<Map size={26} color={t.sub} strokeWidth={2} />
				</View>
				<Text style={[styles.title, { color: t.ink }]}>Routes are coming</Text>
				<Text style={[styles.copy, { color: t.sub }]}>
					Plan a route on the web and it will show up here, ready to drive.
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	body: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingHorizontal: 40,
		paddingBottom: 60,
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
		fontSize: type.h3,
	},
	copy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
		textAlign: "center",
	},
});
