import { useSignIn } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import {
	Text,
	TextInput,
	TouchableOpacity,
	View,
	StyleSheet,
	Platform,
	Alert,
} from "react-native";
import React from "react";
import { useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import { colors, spacing, fontFamily } from "@/lib/theme";
import { StyledButton } from "@/components/styled";
import { GoogleIcon } from "@/components/GoogleIcon";

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

export default function SignInScreen() {
	useWarmUpBrowser();

	const { signIn } = useSignIn();
	const { startSSOFlow } = useSSO();
	const router = useRouter();

	const [emailAddress, setEmailAddress] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [loading, setLoading] = React.useState(false);

	// Handle the submission of the sign-in form
	const onSignInPress = async () => {
		try {
			setLoading(true);
			// Submit the identifier and password
			const { error } = await signIn.password({
				identifier: emailAddress,
				password,
			});

			if (error) {
				Alert.alert(
					"Error",
					error.longMessage || error.message || "Failed to sign in"
				);
				return;
			}

			// Activate the new session, then redirect
			if (signIn.status === "complete") {
				await signIn.finalize();
				router.replace("/(tabs)");
			} else {
				// Further steps (e.g. MFA) would be handled here
				console.error("Sign-in incomplete:", signIn.status);
			}
		} catch (err: any) {
			Alert.alert("Error", err?.message || "Failed to sign in");
			console.error(JSON.stringify(err, null, 2));
		} finally {
			setLoading(false);
		}
	};

	// Handle Google OAuth sign-in
	const handleGoogleSignIn = React.useCallback(async () => {
		try {
			setLoading(true);

			const {
				createdSessionId,
				setActive: ssoSetActive,
				signIn,
				signUp,
			} = await startSSOFlow({
				strategy: "oauth_google",
			});

			if (createdSessionId && ssoSetActive) {
				await ssoSetActive({ session: createdSessionId });
				router.replace("/(tabs)");
			} else {
				// Handle cases where user needs to complete additional steps
				if (signUp?.status === "missing_requirements") {
					Alert.alert(
						"Additional Information Required",
						"Please complete your profile to continue."
					);
				} else if (signIn?.status && signIn.status !== "complete") {
					Alert.alert(
						"Additional Verification Required",
						"Please complete the additional verification steps."
					);
				}
			}
		} catch (err: any) {
			console.error("OAuth error:", JSON.stringify(err, null, 2));
			Alert.alert(
				"Error",
				err.errors?.[0]?.message || "Failed to sign in with Google"
			);
		} finally {
			setLoading(false);
		}
	}, [startSSOFlow]);

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Welcome back</Text>
			<Text style={styles.subtitle}>Sign in to continue to OneTool</Text>

			{/* Google OAuth Button */}
			<StyledButton
				intent="outline"
				size="lg"
				onPress={handleGoogleSignIn}
				isLoading={loading}
				disabled={loading}
				showArrow={false}
				icon={<GoogleIcon size={20} />}
				style={{ marginBottom: spacing.md }}
			>
				Continue with Google
			</StyledButton>

			<View style={styles.divider}>
				<View style={styles.dividerLine} />
				<Text style={styles.dividerText}>or</Text>
				<View style={styles.dividerLine} />
			</View>

			{/* Email/Password Form */}
			<TextInput
				style={styles.input}
				autoCapitalize="none"
				value={emailAddress}
				placeholder="Email"
				placeholderTextColor={colors.mutedForeground}
				keyboardType="email-address"
				onChangeText={setEmailAddress}
				editable={!loading}
			/>

			<TextInput
				style={styles.input}
				value={password}
				placeholder="Password"
				placeholderTextColor={colors.mutedForeground}
				secureTextEntry={true}
				onChangeText={setPassword}
				editable={!loading}
			/>

			<StyledButton
				intent="primary"
				size="lg"
				onPress={onSignInPress}
				isLoading={loading}
				disabled={loading}
				showArrow={false}
				style={{ marginBottom: spacing.md }}
			>
				Sign In
			</StyledButton>

			<View style={styles.footer}>
				<Text style={styles.footerText}>Don't have an account? </Text>
				<Link href="/(auth)/sign-up" asChild>
					<TouchableOpacity disabled={loading}>
						<Text style={styles.linkText}>Sign up</Text>
					</TouchableOpacity>
				</Link>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		padding: spacing.lg,
		backgroundColor: colors.background,
	},
	title: {
		fontSize: 32,
		fontFamily: fontFamily.bold,
		marginBottom: spacing.xs,
		textAlign: "center",
		color: colors.foreground,
	},
	subtitle: {
		fontSize: 16,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		marginBottom: spacing.xl,
		textAlign: "center",
	},
	input: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: spacing.md,
		marginBottom: spacing.md,
		fontSize: 16,
		fontFamily: fontFamily.regular,
		backgroundColor: colors.background,
		color: colors.foreground,
	},
	divider: {
		flexDirection: "row",
		alignItems: "center",
		marginVertical: spacing.lg,
	},
	dividerLine: {
		flex: 1,
		height: 1,
		backgroundColor: colors.border,
	},
	dividerText: {
		marginHorizontal: spacing.md,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		fontSize: 14,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "center",
		marginTop: spacing.md,
		alignItems: "center",
	},
	footerText: {
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
		fontSize: 14,
	},
	linkText: {
		fontFamily: fontFamily.semibold,
		color: colors.primary,
		fontSize: 14,
	},
});
