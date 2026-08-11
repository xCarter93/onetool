import React, { useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSignIn } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { dock, fontFamily, hero } from "@/lib/theme";

type Busy = null | "continue" | "verify" | "resend" | "apple" | "google";

// Custom 1m sign-in flow on Clerk hooks — replaces the native <AuthView>,
// whose NavigationStack paints an unreachable opaque systemBackground and can
// never sit on the shell's glass. SIGN-IN ONLY (Apple 3.1.1): email code +
// native Apple/Google sign-in (ID-token exchange — same mechanism AuthView
// used, so no new dashboard config; the Google client IDs live in app.json
// `extra`). No password, no in-app account/org registration UI.
// One deliberate exception: the native hooks transfer an unrecognized OAuth
// account into a sign-up internally — that's what lets an invited teammate's
// first "Continue with Google" work — and users without an org still dead-end
// at the complete-setup screen, so the 3.1.1 stance holds.
export function SignInCard() {
	const { signIn, fetchStatus } = useSignIn();
	const { startAppleAuthenticationFlow } = useSignInWithApple();
	const { startGoogleAuthenticationFlow } = useSignInWithGoogle();

	const [step, setStep] = useState<"start" | "code">("start");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState<Busy>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const codeRef = useRef<TextInput>(null);

	const locked = busy !== null || fetchStatus === "fetching";

	const submitEmail = async () => {
		const address = email.trim().toLowerCase();
		if (!address || locked) return;
		setBusy("continue");
		setFormError(null);
		try {
			const { error } = await signIn.create({ identifier: address });
			if (error) {
				setFormError(error.message);
				return;
			}
			const { error: sendError } = await signIn.emailCode.sendCode({
				emailAddress: address,
			});
			if (sendError) {
				setFormError(sendError.message);
				return;
			}
			setCode("");
			setStep("code");
			setTimeout(() => codeRef.current?.focus(), 80);
		} finally {
			setBusy(null);
		}
	};

	const verifyCode = async (value: string) => {
		if (value.length !== 6 || locked) return;
		setBusy("verify");
		setFormError(null);
		try {
			const { error } = await signIn.emailCode.verifyCode({ code: value });
			if (error) {
				setFormError(error.message);
				return;
			}
			// Session goes active here; (auth)/_layout sees it and redirects.
			await signIn.finalize();
		} finally {
			setBusy(null);
		}
	};

	const resendCode = async () => {
		if (locked) return;
		setBusy("resend");
		setFormError(null);
		try {
			const { error } = await signIn.emailCode.sendCode({
				emailAddress: email.trim().toLowerCase(),
			});
			if (error) setFormError(error.message);
		} finally {
			setBusy(null);
		}
	};

	const ssoSignIn = async (provider: "apple" | "google") => {
		if (locked) return;
		setBusy(provider);
		setFormError(null);
		try {
			// Both flows resolve with a null session id when the user cancels the
			// native sheet — say nothing in that case. Real failures throw.
			const { createdSessionId, setActive } =
				provider === "apple"
					? await startAppleAuthenticationFlow()
					: await startGoogleAuthenticationFlow();
			if (createdSessionId && setActive) {
				await setActive({ session: createdSessionId });
			}
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Sign-in failed.");
		} finally {
			setBusy(null);
		}
	};

	if (step === "code") {
		return (
			<View>
				<Text style={styles.heading}>Check your email</Text>
				<Text style={styles.sub}>
					Enter the 6-digit code we sent to {email.trim().toLowerCase()}
				</Text>
				<TextInput
					ref={codeRef}
					style={[styles.input, styles.codeInput]}
					value={code}
					onChangeText={(v) => {
						const digits = v.replace(/\D/g, "").slice(0, 6);
						setCode(digits);
						if (digits.length === 6) void verifyCode(digits);
					}}
					keyboardType="number-pad"
					textContentType="oneTimeCode"
					autoComplete="one-time-code"
					keyboardAppearance="dark"
					placeholder="••••••"
					placeholderTextColor={hero.textFaint}
					accessibilityLabel="Verification code"
				/>
				{formError ? <Text style={styles.error}>{formError}</Text> : null}
				<Pressable
					onPress={() => void verifyCode(code)}
					disabled={locked || code.length !== 6}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.primaryWrap,
						(pressed || locked || code.length !== 6) && styles.dimmed,
					]}
				>
					<LinearGradient
						colors={dock.orbGradient}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 1 }}
						style={styles.primary}
					>
						{busy === "verify" ? (
							<ActivityIndicator color={hero.text} />
						) : (
							<Text style={styles.primaryLabel}>Verify</Text>
						)}
					</LinearGradient>
				</Pressable>
				<View style={styles.linkRow}>
					<Pressable onPress={() => void resendCode()} disabled={locked} hitSlop={8}>
						<Text style={styles.link}>
							{busy === "resend" ? "Sending…" : "Resend code"}
						</Text>
					</Pressable>
					<Pressable
						onPress={() => {
							setStep("start");
							setCode("");
							setFormError(null);
						}}
						disabled={locked}
						hitSlop={8}
					>
						<Text style={styles.link}>Use a different email</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	return (
		<View>
			<Text style={styles.heading}>Welcome back</Text>
			<Text style={styles.sub}>Sign in to continue to OneTool</Text>
			<TextInput
				style={styles.input}
				value={email}
				onChangeText={setEmail}
				onSubmitEditing={() => void submitEmail()}
				placeholder="Email address"
				placeholderTextColor={hero.textSub}
				keyboardType="email-address"
				textContentType="emailAddress"
				autoComplete="email"
				autoCapitalize="none"
				autoCorrect={false}
				keyboardAppearance="dark"
				returnKeyType="go"
				accessibilityLabel="Email address"
			/>
			{formError ? <Text style={styles.error}>{formError}</Text> : null}
			<Pressable
				onPress={() => void submitEmail()}
				disabled={locked || !email.trim()}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.primaryWrap,
					(pressed || locked || !email.trim()) && styles.dimmed,
				]}
			>
				<LinearGradient
					colors={dock.orbGradient}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 1 }}
					style={styles.primary}
				>
					{busy === "continue" ? (
						<ActivityIndicator color={hero.text} />
					) : (
						<Text style={styles.primaryLabel}>Continue</Text>
					)}
				</LinearGradient>
			</Pressable>
			<View style={styles.dividerRow}>
				<View style={styles.dividerLine} />
				<Text style={styles.dividerLabel}>or</Text>
				<View style={styles.dividerLine} />
			</View>
			<Pressable
				onPress={() => void ssoSignIn("apple")}
				disabled={locked}
				accessibilityRole="button"
				accessibilityLabel="Continue with Apple"
				style={({ pressed }) => [styles.provider, (pressed || locked) && styles.dimmed]}
			>
				{busy === "apple" ? (
					<ActivityIndicator color={hero.text} />
				) : (
					<>
						<AppleMark />
						<Text style={styles.providerLabel}>Continue with Apple</Text>
					</>
				)}
			</Pressable>
			<Pressable
				onPress={() => void ssoSignIn("google")}
				disabled={locked}
				accessibilityRole="button"
				accessibilityLabel="Continue with Google"
				style={({ pressed }) => [styles.provider, (pressed || locked) && styles.dimmed]}
			>
				{busy === "google" ? (
					<ActivityIndicator color={hero.text} />
				) : (
					<>
						<GoogleMark />
						<Text style={styles.providerLabel}>Continue with Google</Text>
					</>
				)}
			</Pressable>
		</View>
	);
}

function AppleMark() {
	return (
		<Svg width={17} height={17} viewBox="0 0 384 512">
			<Path
				fill={hero.text}
				d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.7-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
			/>
		</Svg>
	);
}

function GoogleMark() {
	return (
		<Svg width={17} height={17} viewBox="0 0 48 48">
			<Path
				fill="#FFC107"
				d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"
			/>
			<Path
				fill="#FF3D00"
				d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
			/>
			<Path
				fill="#4CAF50"
				d="M24 44c5.2 0 9.9-1.7 13.4-4.7l-6.2-5.2C29.2 35.5 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
			/>
			<Path
				fill="#1976D2"
				d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.4 44 30.2 44 24c0-1.3-.1-2.7-.4-3.9z"
			/>
		</Svg>
	);
}

const styles = StyleSheet.create({
	heading: {
		fontFamily: fontFamily.semibold,
		fontSize: 22,
		color: hero.textStrong,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		color: hero.textMid,
		marginTop: 4,
		marginBottom: 18,
	},
	input: {
		height: 50,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: hero.buttonBorder,
		backgroundColor: hero.cellBg,
		paddingHorizontal: 16,
		fontFamily: fontFamily.regular,
		fontSize: 15,
		color: hero.text,
	},
	codeInput: {
		textAlign: "center",
		fontFamily: fontFamily.semibold,
		fontSize: 22,
		letterSpacing: 10,
	},
	error: {
		fontFamily: fontFamily.medium,
		fontSize: 12.5,
		color: hero.alertDot,
		marginTop: 10,
	},
	primaryWrap: {
		marginTop: 14,
		borderRadius: 14,
		overflow: "hidden",
	},
	primary: {
		height: 50,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 15.5,
		color: hero.text,
	},
	dimmed: {
		opacity: 0.6,
	},
	dividerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginVertical: 18,
	},
	dividerLine: {
		flex: 1,
		height: StyleSheet.hairlineWidth,
		backgroundColor: hero.buttonBorder,
	},
	dividerLabel: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
		color: hero.textSub,
	},
	provider: {
		height: 48,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: hero.buttonBorder,
		backgroundColor: hero.buttonBg,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginBottom: 10,
	},
	providerLabel: {
		fontFamily: fontFamily.medium,
		fontSize: 14.5,
		color: hero.textStrong,
	},
	linkRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 16,
	},
	link: {
		fontFamily: fontFamily.medium,
		fontSize: 13,
		color: hero.textMid,
	},
});
