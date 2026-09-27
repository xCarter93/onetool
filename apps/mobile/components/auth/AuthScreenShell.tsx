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
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { frame, hero, radii, spacing, useTokens } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

interface AuthScreenShellProps {
	children: React.ReactNode;
}

// Sign-in: the launch hero photo under its ink scrim (the launch overlay uses the
// same photo, so cold start cross-fades into this screen), the wordmark up top
// and a white card holding the auth surface (SignInCard — custom Clerk-hooks
// flow; the native AuthView was retired because its NavigationStack paints an
// unreachable opaque systemBackground).
export function AuthScreenShell({ children }: AuthScreenShellProps) {
	const t = useTokens();
	const { device, width, height } = useDevice();
	const insets = useSafeAreaInsets();
	const isPad = device === "ipad";

	const wordmark = (
		<Image
			source={require("@/assets/OneTool-wordmark-light.png")}
			style={styles.wordmark}
			resizeMode="contain"
		/>
	);

	// Sized to the live window: absoluteFill didn't expand the <Image> on iPad.
	const backdrop = (
		<>
			<StatusBar style="light" />
			<Image
				source={require("@/assets/launch-hero.png")}
				style={[styles.backdrop, { width, height }]}
				resizeMode="cover"
			/>
			<LinearGradient
				colors={hero.scrim as unknown as [string, string, ...string[]]}
				locations={[0, 0.34, 0.58, 1]}
				pointerEvents="none"
				style={[styles.backdrop, { width, height }]}
			/>
		</>
	);

	if (isPad) {
		return (
			<View style={[styles.root, { backgroundColor: frame.rail }]}>
				{backdrop}
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
			{backdrop}
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
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
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
