import * as React from "react";
import {
	Text,
	TextInput,
	TouchableOpacity,
	View,
	StyleSheet,
	Platform,
	Alert,
} from "react-native";
import { useSignUp } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import { useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import {
	colors,
	spacing,
	fontFamily,
	styles as themeStyles,
} from "@/lib/theme";
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

export default function SignUpScreen() {
	useWarmUpBrowser();

	const { signUp } = useSignUp();
	const { startSSOFlow } = useSSO();
	const router = useRouter();

	const [emailAddress, setEmailAddress] = React.useState("");
	const [password, setPassword] = React.useState("");
	const [pendingVerification, setPendingVerification] = React.useState(false);
	const [code, setCode] = React.useState("");
	const [loading, setLoading] = React.useState(false);

	// Handle submission of sign-up form
	const onSignUpPress = async () => {
		try {
			setLoading(true);
			// Create the sign-up with email and password
			const { error } = await signUp.password({
				emailAddress,
				password,
			});

			if (error) {
				Alert.alert(
					"Error",
					error.longMessage || error.message || "Failed to sign up"
				);
				return;
			}

			// Send the verification code to the user's email
			const { error: sendError } = await signUp.verifications.sendEmailCode();
			if (sendError) {
				Alert.alert(
					"Error",
					sendError.longMessage ||
						sendError.message ||
						"Failed to send verification code"
				);
				return;
			}

			// Show the verification code form
			setPendingVerification(true);
		} catch (err: any) {
			Alert.alert("Error", err?.message || "Failed to sign up");
			console.error(JSON.stringify(err, null, 2));
		} finally {
			setLoading(false);
		}
	};

	// Handle submission of verification form
	const onVerifyPress = async () => {
		try {
			setLoading(true);
			// Verify the email with the code the user provided
			const { error } = await signUp.verifications.verifyEmailCode({ code });

			if (error) {
				Alert.alert(
					"Error",
					error.longMessage || error.message || "Failed to verify email"
				);
				return;
			}

			// Activate the new session, then redirect
			if (signUp.status === "complete") {
				await signUp.finalize();
				router.replace("/(tabs)");
			} else {
				// Further steps would be handled here
				console.error("Sign-up incomplete:", signUp.status);
			}
		} catch (err: any) {
			Alert.alert("Error", err?.message || "Failed to verify email");
			console.error(JSON.stringify(err, null, 2));
		} finally {
			setLoading(false);
		}
	};

	// Handle Google OAuth sign-up
	const handleGoogleSignUp = React.useCallback(async () => {
		try {
			setLoading(true);

			const {
				createdSessionId,
				setActive: ssoSetActive,
				signUp,
			} = await startSSOFlow({
				strategy: "oauth_google",
			});

			if (createdSessionId && ssoSetActive) {
				await ssoSetActive({ session: createdSessionId });
				router.replace("/(tabs)");
			} else if (signUp?.status === "missing_requirements") {
				Alert.alert(
					"Additional Information Required",
					"Please complete your profile to continue."
				);
			}
		} catch (err: any) {
			console.error("OAuth error:", JSON.stringify(err, null, 2));
			Alert.alert(
				"Error",
				err.errors?.[0]?.message || "Failed to sign up with Google"
			);
		} finally {
			setLoading(false);
		}
	}, [startSSOFlow]);

	if (pendingVerification) {
		return (
			<View style={styles.container}>
				<Text style={styles.title}>Verify your email</Text>
				<Text style={styles.subtitle}>
					We sent a verification code to {emailAddress}
				</Text>

			<TextInput
				style={styles.input}
				value={code}
				placeholder="Enter verification code"
				placeholderTextColor={colors.mutedForeground}
				keyboardType="number-pad"
				onChangeText={setCode}
				editable={!loading}
			/>

				<StyledButton
					intent="primary"
					size="lg"
					onPress={onVerifyPress}
					isLoading={loading}
					disabled={loading}
					showArrow={false}
					style={{ marginBottom: spacing.md }}
				>
					Verify Email
				</StyledButton>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Create your account</Text>
			<Text style={styles.subtitle}>Sign up to get started with OneTool</Text>

			{/* Google OAuth Button */}
			<StyledButton
				intent="outline"
				size="lg"
				onPress={handleGoogleSignUp}
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
				onPress={onSignUpPress}
				isLoading={loading}
				disabled={loading}
				showArrow={false}
				style={{ marginBottom: spacing.md }}
			>
				Sign Up
			</StyledButton>

			<View style={styles.footer}>
				<Text style={styles.footerText}>Already have an account? </Text>
				<Link href="/(auth)/sign-in" asChild>
					<TouchableOpacity disabled={loading}>
						<Text style={styles.linkText}>Sign in</Text>
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
		fontSize: 28,
		fontFamily: fontFamily.bold,
		marginBottom: spacing.xs,
		textAlign: "center",
		color: colors.foreground,
	},
	subtitle: {
		fontSize: 14,
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
		fontSize: 14,
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
		fontSize: 13,
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
		fontSize: 13,
	},
	linkText: {
		fontFamily: fontFamily.semibold,
		color: colors.primary,
		fontSize: 13,
	},
});
