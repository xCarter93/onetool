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

// Shared auth surface for sign-in and sign-up: bounded-height Home-matching
// hero + equal-weight Apple/Google provider pair (guideline 4.8) + "or" divider
// + a form slot. Two font weights only (bold labels, regular body) — the Google
// StyledButton label is force-overridden to bold (it defaults to semibold).
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

					{/* Equal-weight provider pair */}
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

					{/* "or" divider */}
					<View style={styles.divider}>
						<View style={styles.dividerLine} />
						<Text style={styles.dividerText}>or</Text>
						<View style={styles.dividerLine} />
					</View>

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
	scrollContent: {
		flexGrow: 1,
		paddingBottom: spacing.xl,
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
