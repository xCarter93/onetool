import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { StyledButton } from "@/components/styled";
import { fontFamily, spacing, tokens, type } from "@/lib/theme";

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

	// Activate an existing membership when the session has none active. Mirrors
	// the wizard's membership-activation path (async work + state set live in an
	// IIFE, not the effect body — apps/mobile lints sync setState-in-effect).
	useEffect(() => {
		if (!listLoaded || activeOrg || !firstOrgId || attemptedRef.current) return;
		attemptedRef.current = true;
		void (async () => {
			try {
				if (setActive) await setActive({ organization: firstOrgId });
			} catch {
				setActivationFailed(true);
			}
		})();
	}, [listLoaded, activeOrg, firstOrgId, setActive]);

	// Once an active org exists, this user belongs in the app. Metadata no longer
	// gates tabs, so navigate unconditionally (routing won't bounce back here).
	useEffect(() => {
		if (activeOrg) {
			router.replace("/(tabs)" as Parameters<typeof router.replace>[0]);
		}
	}, [activeOrg, router]);

	// Show the "finish in the web app" dead-end only when we're certain there's
	// nothing to resolve in-app: no active org and no membership to activate (or
	// activation failed). Everything else is a transient → spinner.
	const isDeadEnd =
		listLoaded && !activeOrg && (!firstOrgId || activationFailed);

	if (!isDeadEnd) {
		return (
			<View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.body}>Loading your workspace…</Text>
			</View>
		);
	}

	return (
		<View
			style={[
				styles.screen,
				styles.center,
				{ paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg },
			]}
		>
			<View style={styles.box}>
				<Text style={styles.title}>Almost there</Text>
				<Text style={styles.body}>
					Finish setting up your business in the OneTool web app, then sign in
					here to get started.
				</Text>
				<View style={styles.cta}>
					<StyledButton
						intent="outline"
						label="Sign out"
						showArrow={false}
						onPress={() => signOut()}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: tokens.bg,
		paddingHorizontal: spacing.lg,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
	box: {
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		maxWidth: 420,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
		color: tokens.ink,
		textAlign: "center",
	},
	body: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.sub,
		textAlign: "center",
	},
	cta: {
		marginTop: spacing.lg,
		alignSelf: "stretch",
	},
});
