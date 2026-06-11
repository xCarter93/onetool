import {
	useSignIn,
	useSSO,
	useAuth,
	useOrganization,
	useOrganizationList,
} from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import { Text, TextInput, TouchableOpacity, View, StyleSheet, Platform } from "react-native";
import React from "react";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, radii, spacing, tokens, type } from "@/lib/theme";
import { StyledButton } from "@/components/styled";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import {
	mapAuthError,
	isCancellation,
	isOAuthDismissed,
	isIncompleteSignIn,
	mapIncompleteStatus,
} from "@/lib/authErrors";
import { navigateAfterAuth, resolveAuthDestination } from "@/lib/postAuthRouting";

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

type FieldErrors = { email?: string; password?: string };

export default function SignInScreen() {
	useWarmUpBrowser();

	const { signIn } = useSignIn();
	const { startSSOFlow } = useSSO();
	const router = useRouter();

	// Post-auth routing inputs — the single destination resolver consumes these.
	const { isLoaded: authLoaded, isSignedIn } = useAuth();
	const { organization: activeOrg } = useOrganization();
	const { userMemberships, isLoaded: orgListLoaded } = useOrganizationList({
		userMemberships: true,
	});
	const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);

	const [emailAddress, setEmailAddress] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
	const [formError, setFormError] = React.useState<string | null>(null);

	// Centralized post-auth navigation — every success path routes through here;
	// never a hardcoded tabs destination. router.replace is typed to a Href
	// literal union; the helper deals in plain strings — cast at the boundary.
	const goAfterAuth = React.useCallback(() => {
		navigateAfterAuth(
			(href) => router.replace(href as Parameters<typeof router.replace>[0]),
			resolveAuthDestination({
				authLoaded: Boolean(authLoaded),
				orgLoaded: Boolean(orgListLoaded),
				isSignedIn: Boolean(isSignedIn),
				hasActiveOrg: Boolean(activeOrg),
				membershipCount: userMemberships?.data?.length ?? 0,
				needsMetadata,
			})
		);
	}, [
		router,
		authLoaded,
		orgListLoaded,
		isSignedIn,
		activeOrg,
		userMemberships,
		needsMetadata,
	]);

	const clearErrors = () => {
		setFieldErrors({});
		setFormError(null);
	};

	// Email/password sign-in via the Clerk future API.
	const onSignInPress = async () => {
		try {
			setLoading(true);
			clearErrors();

			const { error } = await signIn.password({
				identifier: emailAddress,
				password,
			});

			if (error) {
				const mapped = mapAuthError(error);
				if (mapped.field === "email" || mapped.field === "password") {
					setFieldErrors({ [mapped.field]: mapped.message });
				} else {
					setFormError(mapped.message);
				}
				return;
			}

			if (signIn.status === "complete") {
				await signIn.finalize();
				goAfterAuth();
			} else if (isIncompleteSignIn(signIn.status)) {
				// Preserve the MFA / missing_requirements branch as an inline message
				// rather than silently dropping it.
				setFormError(mapIncompleteStatus(signIn.status).message);
			}
		} catch (err) {
			const mapped = mapAuthError(err);
			if (mapped.field === "email" || mapped.field === "password") {
				setFieldErrors({ [mapped.field]: mapped.message });
			} else {
				setFormError(mapped.message);
			}
		} finally {
			setLoading(false);
		}
	};

	// Google OAuth sign-in. Dismissal is silent — detected both via the
	// authSessionResult (non-throwing dismiss) and via a thrown cancellation.
	const handleGoogleSignIn = React.useCallback(async () => {
		try {
			setLoading(true);
			clearErrors();

			const { createdSessionId, setActive, authSessionResult } =
				await startSSOFlow({ strategy: "oauth_google" });

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

	return (
		<AuthScreenShell
			title="Welcome back"
			subtitle="Sign in to continue to OneTool"
			appleType="SIGN_IN"
			loading={loading}
			onGoogle={handleGoogleSignIn}
			onProviderError={setFormError}
			onAppleSuccess={goAfterAuth}
		>
			<View>
				<TextInput
					style={[styles.input, fieldErrors.email ? styles.inputError : null]}
					autoCapitalize="none"
					value={emailAddress}
					placeholder="Email"
					placeholderTextColor={tokens.mutedForeground}
					keyboardType="email-address"
					onChangeText={(t) => {
						setEmailAddress(t);
						if (fieldErrors.email)
							setFieldErrors((prev) => ({ ...prev, email: undefined }));
					}}
					editable={!loading}
				/>
				{fieldErrors.email ? (
					<Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>
				) : null}

				<TextInput
					style={[
						styles.input,
						styles.inputSpacingTop,
						fieldErrors.password ? styles.inputError : null,
					]}
					value={password}
					placeholder="Password"
					placeholderTextColor={tokens.mutedForeground}
					secureTextEntry
					onChangeText={(t) => {
						setPassword(t);
						if (fieldErrors.password)
							setFieldErrors((prev) => ({ ...prev, password: undefined }));
					}}
					editable={!loading}
				/>
				{fieldErrors.password ? (
					<Text style={styles.fieldErrorText}>{fieldErrors.password}</Text>
				) : null}

				{formError ? (
					<View style={styles.formError}>
						<Text style={styles.formErrorText}>{formError}</Text>
					</View>
				) : null}

				<StyledButton
					intent="primary"
					size="lg"
					onPress={onSignInPress}
					isLoading={loading}
					disabled={loading}
					showArrow={false}
					textStyle={{ fontFamily: fontFamily.bold }}
					style={styles.cta}
				>
					Sign in
				</StyledButton>

				<View style={styles.footer}>
					<Text style={styles.footerText}>Don&apos;t have an account? </Text>
					<Link href="/(auth)/sign-up" asChild>
						<TouchableOpacity disabled={loading}>
							<Text style={styles.linkText}>Sign up</Text>
						</TouchableOpacity>
					</Link>
				</View>
			</View>
		</AuthScreenShell>
	);
}

const styles = StyleSheet.create({
	input: {
		borderWidth: 1,
		borderColor: tokens.border,
		borderRadius: radii.lg,
		padding: spacing.md,
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		backgroundColor: tokens.card,
		color: tokens.ink,
	},
	inputSpacingTop: {
		marginTop: spacing.md,
	},
	inputError: {
		borderColor: tokens.danger,
	},
	fieldErrorText: {
		marginTop: spacing.sm,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.danger,
	},
	formError: {
		marginTop: spacing.md,
	},
	formErrorText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.danger,
	},
	cta: {
		marginTop: spacing.lg,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "center",
		marginTop: spacing.lg,
		alignItems: "center",
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
