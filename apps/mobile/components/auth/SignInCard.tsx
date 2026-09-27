import React, { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Linking,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useClerk, useSignIn } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { useSignInWithGoogle } from "@clerk/expo/google";
import Svg, { Path } from "react-native-svg";
import { fontFamily, radii, useTokens } from "@/lib/theme";

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
	const t = useTokens();
	const clerk = useClerk();
	const { signIn, fetchStatus } = useSignIn();
	const { startAppleAuthenticationFlow } = useSignInWithApple();
	const { startGoogleAuthenticationFlow } = useSignInWithGoogle();

	// Clerk recreates the SSO flow functions each render, and each closes over
	// that render's isLoaded. A tap that waits out the bootstrap must call the
	// LATEST function, not the stale not-yet-loaded one it captured at tap time.
	const ssoFlowsRef = useRef({
		apple: startAppleAuthenticationFlow,
		google: startGoogleAuthenticationFlow,
	});
	useEffect(() => {
		ssoFlowsRef.current = {
			apple: startAppleAuthenticationFlow,
			google: startGoogleAuthenticationFlow,
		};
	});

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

	// Clerk's native SSO hooks silently return { createdSessionId: null } if the
	// client hasn't bootstrapped yet (App Review hit this as a "dead" button), so
	// hold the tap until it loads instead of dropping it.
	const waitForClerk = async () => {
		const deadline = Date.now() + 10_000;
		while (!clerk.loaded && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		return clerk.loaded;
	};

	const ssoSignIn = async (provider: "apple" | "google") => {
		if (busy !== null) return;
		setBusy(provider);
		setFormError(null);
		try {
			if (!(await waitForClerk())) {
				setFormError("Couldn't connect. Check your connection and try again.");
				return;
			}
			// Both flows resolve with a null session id when the user cancels the
			// native sheet. Real failures throw — except sheet-presentation failures,
			// which iOS also reports as "canceled". Disambiguate by elapsed time: a
			// near-instant null means the sheet never presented.
			const startedAt = Date.now();
			const { createdSessionId, setActive } = await ssoFlowsRef.current[provider]();
			if (createdSessionId && setActive) {
				await setActive({ session: createdSessionId });
			} else if (Date.now() - startedAt < 1500) {
				// Copy must stay accurate for a fast human cancel too, which lands in
				// this same window — "didn't finish" covers both, "couldn't start" lies.
				setFormError(
					`${provider === "apple" ? "Apple" : "Google"} sign-in didn't finish. Try again, or sign in with your email.`
				);
			}
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Sign-in failed.");
		} finally {
			setBusy(null);
		}
	};

	// Brand mark shared by both steps — the wordmark lives in the shell's lockup;
	// the card carries just the glyph.
	const brandMark = (
		<Image
			source={require("@/assets/OneTool-mark.png")}
			style={styles.brandMark}
			resizeMode="contain"
			accessibilityElementsHidden
		/>
	);

	if (step === "code") {
		return (
			<View>
				{brandMark}
				<Text style={[styles.heading, { color: t.ink }]}>Check your email</Text>
				<Text style={[styles.sub, { color: t.sub }]}>
					Enter the 6-digit code we sent to {email.trim().toLowerCase()}
				</Text>
				<TextInput
					ref={codeRef}
					style={[
						styles.input,
						styles.codeInput,
						{ borderColor: t.input, backgroundColor: t.card, color: t.ink },
					]}
					value={code}
					onChangeText={(v) => {
						const digits = v.replace(/\D/g, "").slice(0, 6);
						setCode(digits);
						if (digits.length === 6) void verifyCode(digits);
					}}
					keyboardType="number-pad"
					textContentType="oneTimeCode"
					autoComplete="one-time-code"
					placeholder="••••••"
					placeholderTextColor={t.sub}
					accessibilityLabel="Verification code"
				/>
				{formError ? (
					<Text style={[styles.error, { color: t.danger }]}>{formError}</Text>
				) : null}
				<Pressable
					onPress={() => void verifyCode(code)}
					disabled={locked || code.length !== 6}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.primary,
						{ backgroundColor: pressed ? t.primarySolidPressed : t.primarySolid },
						(locked || code.length !== 6) && styles.dimmed,
					]}
				>
					{busy === "verify" ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<Text style={styles.primaryLabel}>Verify</Text>
					)}
				</Pressable>
				<View style={styles.linkRow}>
					<Pressable onPress={() => void resendCode()} disabled={locked} hitSlop={8}>
						<Text style={[styles.link, { color: t.frostedInk }]}>
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
						<Text style={[styles.link, { color: t.frostedInk }]}>
							Use a different email
						</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	return (
		<View>
			{brandMark}
			<Text style={[styles.heading, { color: t.ink }]}>Welcome back</Text>
			<Text style={[styles.sub, { color: t.sub }]}>
				Sign in to continue to OneTool
			</Text>
			<TextInput
				style={[styles.input, { borderColor: t.input, backgroundColor: t.card, color: t.ink }]}
				value={email}
				onChangeText={setEmail}
				onSubmitEditing={() => void submitEmail()}
				placeholder="Email address"
				placeholderTextColor={t.sub}
				keyboardType="email-address"
				textContentType="emailAddress"
				autoComplete="email"
				autoCapitalize="none"
				autoCorrect={false}
				returnKeyType="go"
				accessibilityLabel="Email address"
			/>
			{formError ? (
				<Text style={[styles.error, { color: t.danger }]}>{formError}</Text>
			) : null}
			<Pressable
				onPress={() => void submitEmail()}
				disabled={locked || !email.trim()}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.primary,
					{ backgroundColor: pressed ? t.primarySolidPressed : t.primarySolid },
					(locked || !email.trim()) && styles.dimmed,
				]}
			>
				{busy === "continue" ? (
					<ActivityIndicator color="#ffffff" />
				) : (
					<Text style={styles.primaryLabel}>Continue</Text>
				)}
			</Pressable>
			<View style={styles.dividerRow}>
				<View style={[styles.dividerLine, { backgroundColor: t.lineSoft }]} />
				<Text style={[styles.dividerLabel, { color: t.sub }]}>or</Text>
				<View style={[styles.dividerLine, { backgroundColor: t.lineSoft }]} />
			</View>
			{/* SSO stays tappable while Clerk loads (ssoSignIn waits internally) —
			    only an in-flight flow disables it. */}
			<Pressable
				onPress={() => void ssoSignIn("apple")}
				disabled={busy !== null}
				accessibilityRole="button"
				accessibilityLabel="Continue with Apple"
				style={({ pressed }) => [
					styles.provider,
					{ borderColor: t.input, backgroundColor: pressed ? t.secondary : t.card },
					busy !== null && styles.dimmed,
				]}
			>
				{busy === "apple" ? (
					<ActivityIndicator color={t.sub} />
				) : (
					<>
						<AppleMark color={t.ink} />
						<Text style={[styles.providerLabel, { color: t.ink }]}>
							Continue with Apple
						</Text>
					</>
				)}
			</Pressable>
			<Pressable
				onPress={() => void ssoSignIn("google")}
				disabled={busy !== null}
				accessibilityRole="button"
				accessibilityLabel="Continue with Google"
				style={({ pressed }) => [
					styles.provider,
					{ borderColor: t.input, backgroundColor: pressed ? t.secondary : t.card },
					busy !== null && styles.dimmed,
				]}
			>
				{busy === "google" ? (
					<ActivityIndicator color={t.sub} />
				) : (
					<>
						<GoogleMark />
						<Text style={[styles.providerLabel, { color: t.ink }]}>
							Continue with Google
						</Text>
					</>
				)}
			</Pressable>
			{/* Sign-in-wrap assent: Clerk's express-consent checkbox is off (native
			    token sign-ups can't render it), so this notice carries agreement. */}
			<Text style={[styles.legal, { color: t.sub }]}>
				By continuing, you agree to our{" "}
				<Text
					style={[styles.legalLink, { color: t.frostedInk }]}
					accessibilityRole="link"
					onPress={() =>
						void Linking.openURL(
							"https://www.onetool.biz/terms-of-service"
						).catch(() => {})
					}
				>
					Terms of Service
				</Text>{" "}
				and{" "}
				<Text
					style={[styles.legalLink, { color: t.frostedInk }]}
					accessibilityRole="link"
					onPress={() =>
						void Linking.openURL(
							"https://www.onetool.biz/privacy-policy"
						).catch(() => {})
					}
				>
					Privacy Policy
				</Text>
				.
			</Text>
		</View>
	);
}

function AppleMark({ color }: { color: string }) {
	return (
		<Svg width={17} height={17} viewBox="0 0 384 512">
			<Path
				fill={color}
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
	brandMark: {
		width: 40,
		height: 40,
		marginBottom: 14,
	},
	heading: {
		fontFamily: fontFamily.semibold,
		fontSize: 22,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 4,
		marginBottom: 18,
	},
	input: {
		height: 44,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		paddingHorizontal: 16,
		fontFamily: fontFamily.regular,
		fontSize: 16,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
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
		marginTop: 10,
	},
	primary: {
		marginTop: 14,
		height: 40,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: "#ffffff",
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
	},
	dividerLabel: {
		fontFamily: fontFamily.regular,
		fontSize: 12,
	},
	provider: {
		height: 40,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginBottom: 10,
	},
	providerLabel: {
		fontFamily: fontFamily.medium,
		fontSize: 14,
	},
	linkRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 16,
	},
	link: {
		fontFamily: fontFamily.medium,
		fontSize: 12.5,
	},
	legal: {
		fontFamily: fontFamily.regular,
		fontSize: 11.5,
		textAlign: "center",
		lineHeight: 17,
		marginTop: 8,
	},
	legalLink: {
		fontFamily: fontFamily.medium,
		textDecorationLine: "underline",
	},
});
