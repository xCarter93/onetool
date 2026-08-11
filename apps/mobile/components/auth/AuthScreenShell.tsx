import React from "react";
import {
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fontFamily, hero, radii, spacing } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

interface AuthScreenShellProps {
	children: React.ReactNode;
}

// 3.0 sign-in (canvas 1m): the generated hero photo full-bleed, a 4-stop ink
// scrim, the wordmark up top and a dark glass card holding the auth surface
// (SignInCard — custom Clerk-hooks flow; the native AuthView was retired
// because its NavigationStack paints an opaque systemBackground that no theme
// value can clear). The launch overlay uses the SAME photo, so cold start
// cross-fades into this screen as one continuous scene.
export function AuthScreenShell({ children }: AuthScreenShellProps) {
	const { device, width, height } = useDevice();
	const insets = useSafeAreaInsets();
	const isPad = device === "ipad";

	const backdrop = (
		<>
			{/* Dark hero needs light status-bar glyphs; the root layout's "auto"
			    resumes when this screen unmounts after sign-in. */}
			<StatusBar style="light" />
			{/* Sized to the live window, not absoluteFill — see the iPad note in
			    the 2.0 shell: absoluteFill didn't expand the <Image> here. */}
			<Image
				source={require("@/assets/launch-hero.png")}
				style={[styles.bgImage, { width, height }]}
				resizeMode="cover"
			/>
			<LinearGradient
				colors={hero.scrim as unknown as [string, string, ...string[]]}
				locations={[0, 0.34, 0.58, 1]}
				pointerEvents="none"
				style={[styles.bgImage, { width, height }]}
			/>
		</>
	);

	// Real glass: SignInCard paints no background of its own, so this card is
	// the only surface — system blur + the canvas's ink wash over the photo.
	const glass = (content: React.ReactNode, style: object) => (
		<View style={style}>
			<BlurView
				intensity={55}
				tint="dark"
				style={StyleSheet.absoluteFill}
			/>
			<View
				style={[StyleSheet.absoluteFill, { backgroundColor: hero.glassBg }]}
			/>
			{content}
		</View>
	);

	if (isPad) {
		return (
			<View style={styles.root}>
				{backdrop}
				{/* Transparent containers so the photo + scrim show through. */}
				<KeyboardAvoidingView
					style={styles.flexTransparent}
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<ScrollView
						style={styles.flexTransparent}
						contentContainerStyle={styles.scrollContentPad}
						keyboardShouldPersistTaps="handled"
					>
						{glass(children, styles.padCard)}
					</ScrollView>
				</KeyboardAvoidingView>
			</View>
		);
	}

	// Phone: lockup floats over the photo's calm upper band; the glass card is
	// pinned low, content-sized, and rides the keyboard via KeyboardAvoidingView.
	return (
		<View style={styles.root}>
			{backdrop}
			<View
				style={[styles.lockup, { top: insets.top + 64 }]}
				pointerEvents="none"
				accessibilityElementsHidden
			>
				<Text style={styles.wordmark}>ONETOOL</Text>
			</View>
			<KeyboardAvoidingView
				style={styles.cardHost}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				{glass(
					children,
					StyleSheet.flatten([
						styles.glassCard,
						{ marginBottom: Math.max(insets.bottom, 18) + 12 },
					]),
				)}
			</KeyboardAvoidingView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: hero.ink,
	},
	flexTransparent: {
		flex: 1,
		backgroundColor: "transparent",
	},
	bgImage: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	lockup: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
		gap: 14,
	},
	wordmark: {
		fontFamily: fontFamily.semibold,
		fontSize: 13,
		letterSpacing: 2.5,
		color: hero.textStrong,
	},
	cardHost: {
		flex: 1,
		justifyContent: "flex-end",
		paddingHorizontal: 18,
	},
	glassCard: {
		borderRadius: 26,
		borderWidth: 1,
		borderColor: hero.glassBorder,
		boxShadow: "0 24px 60px rgba(0,0,0,.4)",
		paddingHorizontal: 22,
		paddingTop: 24,
		paddingBottom: 22,
		overflow: "hidden",
	},
	// iPad: centered floating glass card over the hero.
	scrollContentPad: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: spacing.xl,
		paddingHorizontal: spacing.lg,
	},
	padCard: {
		width: "100%",
		maxWidth: 440,
		borderRadius: radii["3xl"],
		borderWidth: 1,
		borderColor: hero.glassBorder,
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.xl,
		boxShadow: "0 24px 60px rgba(0,0,0,.4)",
		overflow: "hidden",
	},
});
