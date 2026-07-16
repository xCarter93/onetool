import {
	Pressable,
	StyleSheet,
	Text,
	useColorScheme,
	View,
} from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { ConvexError } from "convex/values";
import { fontFamily } from "@/lib/theme";

// Route-level error screen (expo-router ErrorBoundary convention). Deliberately
// self-contained — the root boundary can render while app providers are down,
// so no useTokens/context, just static styling with a color-scheme check.
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
	const dark = useColorScheme() === "dark";
	const forbidden =
		error instanceof ConvexError &&
		(error.data as { code?: string } | undefined)?.code === "FORBIDDEN";

	const title = forbidden ? "No access" : "Something went wrong";
	const message = forbidden
		? "Your account doesn't have permission to view this. Ask an admin to update your access."
		: "An unexpected error occurred. Your data is safe — try again.";

	return (
		<View
			style={[styles.container, { backgroundColor: dark ? "#0b1220" : "#f6f8fa" }]}
		>
			<Text style={[styles.title, { color: dark ? "#f1f5f9" : "#0f172a" }]}>
				{title}
			</Text>
			<Text style={[styles.message, { color: dark ? "#94a3b8" : "#475569" }]}>
				{message}
			</Text>
			<Pressable
				onPress={() => void retry()}
				accessibilityRole="button"
				accessibilityLabel="Try again"
				style={({ pressed }) => [styles.button, pressed && styles.pressed]}
			>
				<Text style={styles.buttonLabel}>Try again</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	title: {
		fontSize: 20,
		fontFamily: fontFamily.bold,
		textAlign: "center",
	},
	message: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
		textAlign: "center",
		lineHeight: 21,
	},
	button: {
		marginTop: 14,
		paddingHorizontal: 22,
		paddingVertical: 12,
		borderRadius: 999,
		backgroundColor: "#1d4ed8",
	},
	pressed: {
		opacity: 0.85,
	},
	buttonLabel: {
		color: "#ffffff",
		fontSize: 14,
		fontFamily: fontFamily.semibold,
	},
});
