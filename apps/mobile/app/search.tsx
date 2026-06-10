import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "@/lib/theme";

// Stub — full search overlay lands in Plan 24-02, which REPLACES this file.
export default function SearchStub() {
	const t = useTokens();
	const insets = useSafeAreaInsets();

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.surface, paddingTop: insets.top },
			]}
		>
			<ActivityIndicator color={t.accent} />
			<Text style={[styles.label, { color: t.sub }]}>Search</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	label: {
		fontSize: 13,
	},
});
