import { StyleSheet, Text, View } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { ConvexError } from "convex/values";
import { ShieldOff, TriangleAlert } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { fontFamily, radii, tokens, type } from "@/lib/theme";

// Route-level error screen (expo-router ErrorBoundary convention). Deliberately
// self-contained — the root boundary can render while app providers are down,
// so it binds `tokens` directly (no useTokens/context) and avoids the canvas
// module (frame/notch + Badge) so a crash never depends on more of the tree.
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
	const forbidden =
		error instanceof ConvexError &&
		(error.data as { code?: string } | undefined)?.code === "FORBIDDEN";

	const title = forbidden ? "No access" : "Something went wrong";
	const message = forbidden
		? "Your account doesn't have permission to view this. Ask an admin to update your access."
		: "An unexpected error occurred. Your data is safe, try again.";
	const Icon = forbidden ? ShieldOff : TriangleAlert;

	return (
		<View style={[styles.container, { backgroundColor: tokens.bg }]}>
			<View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.line }]}>
				<View style={[styles.icon, { backgroundColor: tokens.secondary }]}>
					<Icon size={20} color={tokens.sub} strokeWidth={2} />
				</View>
				<Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
				<Text style={[styles.message, { color: tokens.sub }]}>{message}</Text>
				{forbidden ? null : (
					<Button title="Try again" onPress={() => void retry()} style={styles.button} />
				)}
				<Button
					title="Go to Today"
					variant={forbidden ? "primary" : "secondary"}
					onPress={() => {
						router.dismissTo("/");
						void retry();
					}}
					style={forbidden ? styles.button : styles.buttonNext}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
	},
	card: {
		width: "100%",
		maxWidth: 340,
		borderRadius: radii.card,
		borderWidth: 1,
		padding: 20,
		alignItems: "center",
		gap: 6,
	},
	icon: {
		width: 40,
		height: 40,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	title: {
		fontSize: type.h2,
		fontFamily: fontFamily.semibold,
		textAlign: "center",
	},
	message: {
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		textAlign: "center",
		lineHeight: 20,
	},
	button: {
		marginTop: 10,
		alignSelf: "stretch",
	},
	buttonNext: {
		alignSelf: "stretch",
	},
});
