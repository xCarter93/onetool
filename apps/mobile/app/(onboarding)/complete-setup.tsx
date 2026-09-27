import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { Button } from "@/components/ui";
import { fontFamily, frame, radii, spacing, type, useTokens } from "@/lib/theme";

// Post-auth "finish setup" screen. The app is SIGN-IN ONLY (Apple 3.1.1) — it no
// longer creates organizations. Reached only when the session has NO active org.
// Two jobs:
//   1. Existing member whose session has no active org: silently activate their
//      first membership (setActive), which was previously the wizard's job, so an
//      existing customer signing in on a fresh device lands in the app.
//   2. A user with no membership at all (e.g. a bare account): nothing to
//      activate — direct them to finish setup in the web app, then sign out.
// (Incomplete org metadata is NOT handled here anymore — that user has an active
// org, lands in tabs, and completes details via the Home prompt / Business
// details editor.)
export default function CompleteSetupScreen() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { signOut } = useAuth();
	const { organization: activeOrg } = useOrganization();
	const { userMemberships, setActive, isLoaded: listLoaded } =
		useOrganizationList({ userMemberships: true });

	const memberships = userMemberships?.data ?? [];
	const firstOrgId = memberships[0]?.organization?.id ?? null;

	// One-shot guard: setActive remounts the tree (root ConvexProvider re-keys on
	// the active org), so on the remounted instance activeOrg is already set and
	// this effect no-ops via the !activeOrg guard — no activation loop.
	const attemptedRef = useRef(false);
	const [activationFailed, setActivationFailed] = useState(false);
	const [signingOut, setSigningOut] = useState(false);

	// Activate an existing membership when the session has none active. Mirrors
	// the wizard's membership-activation path (async work + state set live in a
	// callback, not the effect body — apps/mobile lints sync setState-in-effect).
	// Shared by the one-shot auto-attempt and the manual Retry.
	const activateFirstMembership = useCallback(async () => {
		if (!firstOrgId || !setActive) return;
		setActivationFailed(false);
		try {
			await setActive({ organization: firstOrgId });
		} catch {
			setActivationFailed(true);
		}
	}, [firstOrgId, setActive]);

	useEffect(() => {
		if (!listLoaded || activeOrg || !firstOrgId || attemptedRef.current) return;
		attemptedRef.current = true;
		void activateFirstMembership();
	}, [listLoaded, activeOrg, firstOrgId, activateFirstMembership]);

	// Once an active org exists, this user belongs in the app. Metadata no longer
	// gates tabs, so navigate unconditionally (routing won't bounce back here).
	useEffect(() => {
		if (activeOrg) {
			router.replace("/(tabs)" as Parameters<typeof router.replace>[0]);
		}
	}, [activeOrg, router]);

	async function handleSignOut() {
		setSigningOut(true);
		try {
			await signOut();
		} catch {
			// Sign-out is this screen's only exit — a silently swallowed failure
			// would strand the user. Re-enable the button so they can retry.
			setSigningOut(false);
		}
	}

	// A member whose activation failed still HAS an org (transient failure, e.g.
	// network) — offer Retry, not the web-setup dead-end.
	const activationError =
		listLoaded && !activeOrg && Boolean(firstOrgId) && activationFailed;
	// No membership to activate at all → finish setup in the web app.
	const noMembership = listLoaded && !activeOrg && !firstOrgId;

	// Anything else (including the moment between a Retry and its result) is a
	// transient → spinner.
	if (!activationError && !noMembership) {
		return (
			<View style={[styles.screen, styles.center, { backgroundColor: frame.rail }]}>
				<StatusBar style="light" />
				<ActivityIndicator color={frame.railMuted} />
				<Text style={[styles.loadingBody, { color: frame.railText }]}>
					Loading your workspace…
				</Text>
			</View>
		);
	}

	return (
		<View
			style={[
				styles.screen,
				styles.center,
				{ backgroundColor: frame.rail, paddingBottom: insets.bottom + spacing.lg },
			]}
		>
			<StatusBar style="light" />
			<View style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}>
				<Text style={[styles.title, { color: t.ink }]}>
					{activationError ? "Couldn't open your workspace" : "Almost there"}
				</Text>
				<Text style={[styles.body, { color: t.sub }]}>
					{activationError
						? "Check your connection and try again."
						: "Finish setting up your business in the OneTool web app, then sign in here to get started."}
				</Text>
				<View style={styles.cta}>
					{activationError ? (
						<Button
							title="Try again"
							onPress={() => void activateFirstMembership()}
						/>
					) : null}
					<Button
						title={signingOut ? "Signing out…" : "Sign out"}
						variant="secondary"
						disabled={signingOut}
						onPress={() => void handleSignOut()}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		paddingHorizontal: spacing.lg,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
	loadingBody: {
		marginTop: spacing.sm,
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
	},
	card: {
		width: "100%",
		maxWidth: 420,
		borderRadius: radii.card,
		borderWidth: 1,
		padding: spacing.lg,
		alignItems: "center",
		gap: spacing.sm,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
		textAlign: "center",
	},
	body: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		textAlign: "center",
	},
	cta: {
		marginTop: spacing.lg,
		alignSelf: "stretch",
		gap: spacing.sm,
	},
});
