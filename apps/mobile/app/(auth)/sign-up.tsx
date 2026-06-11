import * as React from "react";
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import {
	useAuth,
	useOrganization,
	useOrganizationList,
	useSignUp,
	useSSO,
} from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, spacing, tokens, type } from "@/lib/theme";
import { StyledButton } from "@/components/styled";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import {
	isCancellation,
	isOAuthDismissed,
	mapAuthError,
} from "@/lib/authErrors";
import {
	navigateAfterAuth,
	resolveAuthDestination,
} from "@/lib/postAuthRouting";

// Preloads the browser for Android devices
const useWarmUpBrowser = () => {
	React.useEffect(() => {
		if (Platform.OS !== "android") return;
		void WebBrowser.warmUpAsync();
		return () => {
			void WebBrowser.coolDownAsync();
		};
	}, []);
};

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
	useWarmUpBrowser();

	const { signUp } = useSignUp();
	const { startSSOFlow } = useSSO();
	const router = useRouter();

	// Routing state hooks — build AuthRoutingState for navigateAfterAuth.
	const { isLoaded: authLoaded, isSignedIn } = useAuth();
	const { organization } = useOrganization();
	const { userMemberships } = useOrganizationList({ userMemberships: true });
	const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);

	const [emailAddress, setEmailAddress] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [pendingVerification, setPendingVerification] = React.useState(false);
	const [code, setCode] = React.useState("");
	const [loading, setLoading] = React.useState(false);

	// Inline Field Kit error state (no OS alert popups).
	const [emailError, setEmailError] = React.useState<string | null>(null);
	const [passwordError, setPasswordError] = React.useState<string | null>(null);
	const [codeError, setCodeError] = React.useState<string | null>(null);
	const [formError, setFormError] = React.useState<string | null>(null);

	// Single post-auth navigation point. A brand-new signup has no active org,
	// so resolveAuthDestination returns the create-organization wizard.
	const goAfterAuth = React.useCallback(() => {
		// router.replace is typed to a Href union; the helper deals in plain
		// strings, so cast at the boundary (matches the 25-04 wizard).
		navigateAfterAuth(
			(href) => router.replace(href as Parameters<typeof router.replace>[0]),
			resolveAuthDestination({
				isLoaded: authLoaded,
				isSignedIn: Boolean(isSignedIn),
				hasActiveOrg: Boolean(organization),
				membershipCount: userMemberships?.data?.length ?? 0,
				needsMetadata,
			})
		);
	}, [
		router,
		authLoaded,
		isSignedIn,
		organization,
		userMemberships?.data?.length,
		needsMetadata,
	]);

	// Email/password sign-up → send the 6-digit code, then show the verify view.
	const onSignUpPress = async () => {
		try {
			setLoading(true);
			setEmailError(null);
			setPasswordError(null);
			setFormError(null);

			const { error } = await signUp.password({ emailAddress, password });
			if (error) {
				const mapped = mapAuthError(error);
				if (mapped.field === "email") setEmailError(mapped.message);
				else if (mapped.field === "password") setPasswordError(mapped.message);
				else setFormError(mapped.message);
				return;
			}

			const { error: sendError } =
				await signUp.verifications.sendEmailCode();
			if (sendError) {
				setFormError(mapAuthError(sendError).message);
				return;
			}

			setPendingVerification(true);
		} catch (err) {
			setFormError(mapAuthError(err).message);
		} finally {
			setLoading(false);
		}
	};

	// Verify the 6-digit email code → finalize → centralized nav.
	const onVerifyPress = async () => {
		try {
			setLoading(true);
			setCodeError(null);

			const { error } = await signUp.verifications.verifyEmailCode({ code });
			if (error) {
				setCodeError(mapAuthError(error).message);
				return;
			}

			if (signUp.status === "complete") {
				await signUp.finalize();
				goAfterAuth();
			}
		} catch (err) {
			setCodeError(mapAuthError(err).message);
		} finally {
			setLoading(false);
		}
	};

	// Resend the verification code (verify sub-view "Resend code" link).
	const onResendPress = async () => {
		try {
			setLoading(true);
			setCodeError(null);
			const { error } = await signUp.verifications.sendEmailCode();
			if (error) setCodeError(mapAuthError(error).message);
		} catch (err) {
			setCodeError(mapAuthError(err).message);
		} finally {
			setLoading(false);
		}
	};

	// Google OAuth sign-up — silent dismiss, pre-verified (skips verification).
	const handleGoogleSignUp = React.useCallback(async () => {
		try {
			setLoading(true);
			setFormError(null);

			const { createdSessionId, setActive, authSessionResult } =
				await startSSOFlow({ strategy: "oauth_google" });

			// Silent dismiss: user closed the browser without authenticating.
			if (isOAuthDismissed(authSessionResult)) return;

			if (createdSessionId && setActive) {
				await setActive({ session: createdSessionId });
				goAfterAuth();
			}
		} catch (err) {
			if (isCancellation(err) || isOAuthDismissed(err)) return;
			setFormError(mapAuthError(err).message);
		} finally {
			setLoading(false);
		}
	}, [startSSOFlow, goAfterAuth]);

	// Verification sub-view (Field Kit — no provider pair / shell here).
	if (pendingVerification) {
		return (
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<ScrollView
					style={styles.flex}
					contentContainerStyle={styles.verifyContent}
					keyboardShouldPersistTaps="handled"
				>
					<Text style={styles.title}>Verify your email</Text>
					<Text style={styles.subtitle}>
						We sent a 6-digit code to {emailAddress}
					</Text>

					<TextInput
						style={[styles.input, codeError ? styles.inputError : null]}
						value={code}
						placeholder="6-digit code"
						placeholderTextColor={tokens.mutedForeground}
						keyboardType="number-pad"
						onChangeText={(v) => {
							setCode(v);
							if (codeError) setCodeError(null);
						}}
						editable={!loading}
					/>
					{codeError ? (
						<Text style={styles.errorText}>{codeError}</Text>
					) : null}

					<StyledButton
						intent="primary"
						size="lg"
						onPress={onVerifyPress}
						isLoading={loading}
						disabled={loading}
						showArrow={false}
						textStyle={styles.ctaLabel}
						style={styles.cta}
					>
						Verify email
					</StyledButton>

					<View style={styles.footer}>
						<Text style={styles.footerText}>Didn&apos;t get it? </Text>
						<TouchableOpacity onPress={onResendPress} disabled={loading}>
							<Text style={styles.linkText}>Resend code</Text>
						</TouchableOpacity>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		);
	}

	// Create-account view — shared AuthScreenShell (Apple/Google pair + hero).
	return (
		<AuthScreenShell
			title="Create your account"
			subtitle="Sign up to get started with OneTool"
			appleType="SIGN_UP"
			loading={loading}
			onGoogle={handleGoogleSignUp}
			onProviderError={setFormError}
			onAppleSuccess={goAfterAuth}
		>
			<TextInput
				style={[styles.input, emailError ? styles.inputError : null]}
				autoCapitalize="none"
				value={emailAddress}
				placeholder="Email"
				placeholderTextColor={tokens.mutedForeground}
				keyboardType="email-address"
				onChangeText={(v) => {
					setEmailAddress(v);
					if (emailError) setEmailError(null);
				}}
				editable={!loading}
			/>
			{emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

			<TextInput
				style={[styles.input, passwordError ? styles.inputError : null]}
				value={password}
				placeholder="Password"
				placeholderTextColor={tokens.mutedForeground}
				secureTextEntry
				onChangeText={(v) => {
					setPassword(v);
					if (passwordError) setPasswordError(null);
				}}
				editable={!loading}
			/>
			{passwordError ? (
				<Text style={styles.errorText}>{passwordError}</Text>
			) : null}

			{formError ? (
				<Text style={[styles.errorText, styles.formError]}>{formError}</Text>
			) : null}

			<StyledButton
				intent="primary"
				size="lg"
				onPress={onSignUpPress}
				isLoading={loading}
				disabled={loading}
				showArrow={false}
				textStyle={styles.ctaLabel}
				style={styles.cta}
			>
				Create account
			</StyledButton>

			<View style={styles.footer}>
				<Text style={styles.footerText}>Already have an account? </Text>
				<Link href="/(auth)/sign-in" asChild>
					<TouchableOpacity disabled={loading}>
						<Text style={styles.linkText}>Sign in</Text>
					</TouchableOpacity>
				</Link>
			</View>
		</AuthScreenShell>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
		backgroundColor: tokens.bg,
	},
	verifyContent: {
		flexGrow: 1,
		justifyContent: "center",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.xl,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
		marginBottom: spacing.xs,
	},
	subtitle: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.mutedForeground,
		marginBottom: spacing.xl,
	},
	input: {
		borderWidth: 1,
		borderColor: tokens.border,
		borderRadius: 8,
		padding: spacing.md,
		marginTop: spacing.md,
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		backgroundColor: tokens.card,
		color: tokens.ink,
	},
	inputError: {
		borderColor: tokens.destructive,
	},
	errorText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.destructive,
		marginTop: spacing.sm,
	},
	formError: {
		marginTop: spacing.md,
	},
	cta: {
		marginTop: spacing.md,
	},
	ctaLabel: {
		fontFamily: fontFamily.bold,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		marginTop: spacing.md,
	},
	footerText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.mutedForeground,
	},
	linkText: {
		fontFamily: fontFamily.bold,
		fontSize: type.body,
		color: tokens.accent,
	},
});
