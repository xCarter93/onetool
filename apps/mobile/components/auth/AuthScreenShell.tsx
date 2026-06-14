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
import { HalftoneBg } from "@/components/ui";
import { fontFamily, radii, spacing, tokens, type } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";

interface AuthScreenShellProps {
	title: string;
	subtitle: string;
	children: React.ReactNode;
}

// Chrome-only auth surface. iPhone: bounded-height Home-matching HalftoneBg
// hero + body column. iPad: full-bleed BG.png + navy scrim + a centered
// floating white card (logo/tagline header lives inside the card). A single
// children body slot — the host fills it (AuthView).
export function AuthScreenShell({
	title,
	subtitle,
	children,
}: AuthScreenShellProps) {
	const { device, width, height } = useDevice();
	const isPad = device === "ipad";

	if (isPad) {
		return (
			<View style={styles.flex}>
				{/* Full-bleed illustration — sized to the live window (not absoluteFill,
				    which didn't expand the <Image> here) so cover fills any iPad aspect
				    and orientation with no gaps and no cropped band. */}
				<Image
					source={require("@/assets/BG.png")}
					style={[styles.bgImage, { width, height }]}
					resizeMode="cover"
				/>
				{/* Navy scrim so the white card + its shadow read cleanly over both
				    bright sky and dark-green hill regions of the illustration. */}
				<View
					pointerEvents="none"
					style={[styles.bgImage, { width, height }, styles.scrim]}
				/>
				{/* Transparent containers so the image + scrim behind them show
				    through — styles.flex carries the opaque gray page bg. */}
				<KeyboardAvoidingView
					style={styles.flexTransparent}
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<ScrollView
						style={styles.flexTransparent}
						contentContainerStyle={styles.scrollContentPad}
						keyboardShouldPersistTaps="handled"
					>
						<View style={styles.card}>
							<View style={styles.cardHeader}>
								<Image
									source={require("@/assets/OneTool.png")}
									style={styles.logo}
									resizeMode="contain"
								/>
								<Text style={styles.tagline}>
									Run your business from one place
								</Text>
							</View>

							<Text style={styles.title}>{title}</Text>
							<Text style={styles.subtitle}>{subtitle}</Text>

							{children}
						</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</View>
		);
	}

	return (
		<KeyboardAvoidingView
			style={styles.flex}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				style={styles.flex}
				contentContainerStyle={styles.scrollContent}
				keyboardShouldPersistTaps="handled"
			>
				{/* Hero — bounded 220 height so HalftoneBg's internal flex:1 neither
				    collapses nor overgrows inside the scroll/keyboard layout. */}
				<View style={styles.hero}>
					<HalftoneBg brand={0.85} imageFit="width" imageOffsetTop={-10}>
						<View style={styles.heroContent}>
							<Image
								source={require("@/assets/OneTool.png")}
								style={styles.logo}
								resizeMode="contain"
							/>
							<Text style={styles.tagline}>Run your business from one place</Text>
						</View>
					</HalftoneBg>
				</View>

				<View style={styles.body}>
					<Text style={styles.title}>{title}</Text>
					<Text style={styles.subtitle}>{subtitle}</Text>

					{children}
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
		backgroundColor: tokens.bg,
	},
	flexTransparent: {
		flex: 1,
		backgroundColor: "transparent",
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: spacing.xl,
	},
	// iPad: center the floating card vertically + horizontally over the
	// full-bleed illustration; outer padding keeps it off the screen edges
	// (and breathing room in a narrow Split View pane).
	scrollContentPad: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: spacing.xl,
		paddingHorizontal: spacing.lg,
	},
	// iPad: full-window background layers (illustration + scrim), pinned top-left.
	bgImage: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	// iPad: ~28% navy wash so the white card reads over any region of BG.png.
	scrim: {
		backgroundColor: "rgba(13, 27, 42, 0.28)",
	},
	// iPad: the floating auth card.
	card: {
		width: "100%",
		maxWidth: 440,
		backgroundColor: tokens.card,
		borderRadius: radii["3xl"],
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.xl,
		boxShadow: "0 18px 40px -12px rgba(13, 27, 42, 0.45)",
	},
	// iPad: logo + tagline header inside the card (replaces the phone hero band).
	cardHeader: {
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.sm,
	},
	hero: {
		height: 220,
	},
	heroContent: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
	},
	logo: {
		width: 160,
		height: 48,
	},
	tagline: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.sub,
		textAlign: "center",
	},
	body: {
		paddingHorizontal: spacing.lg,
		backgroundColor: tokens.bg,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
		marginTop: spacing.lg,
		marginBottom: spacing.xs,
	},
	subtitle: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.mutedForeground,
		marginBottom: spacing.xl,
	},
});
