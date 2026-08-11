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
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fontFamily, hero, radii, spacing } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

interface AuthScreenShellProps {
	children: React.ReactNode;
}

// 3.0 sign-in (canvas 1m): the generated hero photo full-bleed, a 4-stop ink
// scrim, the logo lockup up top and a dark glass card holding the auth surface.
// The launch overlay uses the SAME photo, so cold start cross-fades into this
// screen as one continuous scene. AuthView renders its own heading + buttons —
// the shell deliberately carries no copy of its own (canvas headline dropped:
// two stacked headings read as clutter, and auth correctness beats pixel
// parity). AuthView's surface is themed to hero.authSurface via clerk-theme.json.
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
						<View style={styles.padCard}>{children}</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</View>
		);
	}

	// Phone: lockup floats over the photo's calm upper band; the glass card is
	// pinned low and rides the keyboard via KeyboardAvoidingView (AuthView needs
	// a definite height — see (auth)/index.tsx — so the card body sets one).
	return (
		<View style={styles.root}>
			{backdrop}
			<View
				style={[styles.lockup, { top: insets.top + 64 }]}
				pointerEvents="none"
				accessibilityElementsHidden
			>
				<View style={styles.logoTile}>
					<Image
						source={require("@/assets/OneTool-mark.png")}
						style={styles.logoMark}
						resizeMode="contain"
					/>
				</View>
				<Text style={styles.wordmark}>ONETOOL</Text>
			</View>
			<KeyboardAvoidingView
				style={styles.cardHost}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<View
					style={[
						styles.glassCard,
						{ marginBottom: Math.max(insets.bottom, 18) + 12 },
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
	logoTile: {
		width: 64,
		height: 64,
		borderRadius: 20,
		backgroundColor: "rgba(255,255,255,.92)",
		alignItems: "center",
		justifyContent: "center",
		boxShadow: "0 20px 50px rgba(0,0,0,.35)",
	},
	logoMark: {
		width: 44,
		height: 44,
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
		// Solid authSurface, not translucent glassBg: AuthView paints its themed
		// opaque background anyway, so true glass would only show at the card's
		// padding ring and read as a seam.
		backgroundColor: hero.authSurface,
		borderWidth: 1,
		borderColor: hero.glassBorder,
		boxShadow: "0 24px 60px rgba(0,0,0,.4)",
		paddingHorizontal: 8,
		paddingTop: 8,
		paddingBottom: 8,
		overflow: "hidden",
	},
	// iPad: centered floating card over the hero. Bg matches the AuthView
	// surface so card + component read as one continuous panel.
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
		backgroundColor: hero.authSurface,
		borderRadius: radii["3xl"],
		borderWidth: 1,
		borderColor: hero.glassBorder,
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.xl,
		boxShadow: "0 24px 60px rgba(0,0,0,.4)",
	},
});
