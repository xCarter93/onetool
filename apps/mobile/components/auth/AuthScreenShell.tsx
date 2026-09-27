import React from "react";
import {
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { frame, radii, spacing, useTokens } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

interface AuthScreenShellProps {
	children: React.ReactNode;
}

// 3.0 sign-in: the frame's graphite rail as a full-screen ground (no frame
// chrome, screen is outside the shell) with the wordmark up top and a white
// 8px card holding the auth surface (SignInCard — custom Clerk-hooks flow;
// the native AuthView was retired because its NavigationStack paints an
// unreachable opaque systemBackground).
export function AuthScreenShell({ children }: AuthScreenShellProps) {
	const t = useTokens();
	const { device } = useDevice();
	const insets = useSafeAreaInsets();
	const isPad = device === "ipad";

	const wordmark = (
		<Image
			source={require("@/assets/OneTool-wordmark-light.png")}
			style={styles.wordmark}
			resizeMode="contain"
		/>
	);

	if (isPad) {
		return (
			<View style={[styles.root, { backgroundColor: frame.rail }]}>
				{/* Graphite ground needs light status-bar glyphs; root layout's "auto"
				    resumes when this screen unmounts after sign-in. */}
				<StatusBar style="light" />
				<KeyboardAvoidingView
					style={styles.flex}
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<ScrollView
						style={styles.flex}
						contentContainerStyle={styles.scrollContentPad}
						keyboardShouldPersistTaps="handled"
					>
						{wordmark}
						<View
							style={[
								styles.padCard,
								{ backgroundColor: t.card, borderColor: t.line },
							]}
						>
							{children}
						</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</View>
		);
	}

	return (
		<View style={[styles.root, { backgroundColor: frame.rail }]}>
			<StatusBar style="light" />
			<View style={[styles.lockup, { top: insets.top + 48 }]} pointerEvents="none">
				{wordmark}
			</View>
			<KeyboardAvoidingView
				style={styles.cardHost}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<View
					style={[
						styles.card,
						{
							backgroundColor: t.card,
							borderColor: t.line,
							marginBottom: Math.max(insets.bottom, 18) + 12,
						},
					]}
				>
					{children}
				</View>
			</KeyboardAvoidingView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	flex: {
		flex: 1,
	},
	lockup: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
	},
	wordmark: {
		width: 140,
		height: 140 * (237 / 908),
	},
	cardHost: {
		flex: 1,
		justifyContent: "flex-end",
		paddingHorizontal: 18,
	},
	card: {
		borderRadius: radii.card,
		borderWidth: 1,
		paddingHorizontal: 22,
		paddingTop: 24,
		paddingBottom: 22,
	},
	scrollContentPad: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: spacing.xl,
		paddingHorizontal: spacing.lg,
		gap: spacing.lg,
	},
	padCard: {
		width: "100%",
		maxWidth: 440,
		borderRadius: radii.card,
		borderWidth: 1,
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.xl,
	},
});
