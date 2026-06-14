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
import { StyledButton } from "@/components/styled";
import { GoogleIcon } from "@/components/GoogleIcon";
import { fontFamily, radii, spacing, tokens, type } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";
import { AppleButton } from "./AppleButton";

interface AuthScreenShellProps {
	title: string;
	subtitle: string;
	appleType: "SIGN_IN" | "SIGN_UP";
	onGoogle: () => void;
	loading: boolean;
	onProviderError: (message: string) => void;
	onAppleSuccess: () => void;
	children: React.ReactNode;
}

// Shared auth surface for sign-in and sign-up. iPhone: bounded-height
// Home-matching HalftoneBg hero + body column. iPad: full-bleed BG.png +
// navy scrim + a centered floating white card (logo/tagline header lives
// inside the card — the illustration is the page, so there's no cropped band).
// Both share an equal-weight Apple/Google provider pair (guideline 4.8), an
// "or" divider, and the form slot. Two font weights only (bold labels, regular
// body) — the Google StyledButton label is force-overridden to bold.
export function AuthScreenShell({
	title,
	subtitle,
	appleType,
	onGoogle,
	loading,
	onProviderError,
	onAppleSuccess,
	children,
}: AuthScreenShellProps) {
	const { device, width, height } = useDevice();
	const isPad = device === "ipad";

	// Providers + divider + form — identical on both layouts; only the frame
	// (hero band vs. floating card) differs.
	const providersAndForm = (
		<>
			<View style={styles.providerPair}>
				<AppleButton
					type={appleType}
					disabled={loading}
					onError={onProviderError}
					onSuccess={onAppleSuccess}
				/>
				<StyledButton
					intent="outline"
					size="lg"
					onPress={onGoogle}
					isLoading={loading}
					disabled={loading}
					showArrow={false}
					icon={<GoogleIcon size={20} />}
					textStyle={{ fontFamily: fontFamily.bold }}
					style={styles.googleButton}
				>
					Continue with Google
				</StyledButton>
			</View>

			<View style={styles.divider}>
				<View style={styles.dividerLine} />
				<Text style={styles.dividerText}>or</Text>
				<View style={styles.dividerLine} />
			</View>

			{children}
		</>
	);

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

							{providersAndForm}
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

					{providersAndForm}
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
	providerPair: {
		gap: spacing.md,
	},
	googleButton: {
		borderRadius: radii.lg,
	},
	divider: {
		flexDirection: "row",
		alignItems: "center",
		marginVertical: spacing.lg,
	},
	dividerLine: {
		flex: 1,
		height: 1,
		backgroundColor: tokens.border,
	},
	dividerText: {
		marginHorizontal: spacing.md,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.mutedForeground,
	},
});
