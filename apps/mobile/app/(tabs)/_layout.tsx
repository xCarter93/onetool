import { Tabs, Redirect } from "expo-router";
import type { Href } from "expo-router";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { FieldKitTabBar } from "@/components/field-kit-tab-bar";
import { resolveAuthDestination } from "@/lib/postAuthRouting";
import { useDevice } from "@/lib/use-device";
import { IpadShell } from "@/components/ipad/ipad-shell";

// Tab-level error boundary: a screen throw (e.g. a Convex FORBIDDEN) recovers
// here without tearing down the root providers/auth session.
export { ErrorScreen as ErrorBoundary } from "@/components/ErrorScreen";

export default function TabLayout() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { userMemberships, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: true,
  });
  const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);
  const { device } = useDevice();

  const dest = resolveAuthDestination({
    authLoaded: Boolean(authLoaded),
    orgLoaded: Boolean(orgLoaded && listLoaded),
    isSignedIn: Boolean(isSignedIn),
    hasActiveOrg: Boolean(organization),
    membershipCount: userMemberships?.data?.length ?? 0,
    needsMetadata,
  });

  // Hold while auth/orgs/metadata resolve — don't gate tabs on a half-loaded
  // state. isSignedIn is undefined (falsy) while Clerk loads, so resolving the
  // sign-in redirect through `dest` avoids bouncing a signed-in user on boot.
  if (dest === "loading") {
    return null;
  }

  // Not signed in — resolved AFTER the loading gate (see above).
  if (dest === "/(auth)") {
    return <Redirect href="/(auth)" />;
  }

  // Defensive gate: a signed-in user with no active org / incomplete metadata
  // resolves to the wizard — never let them fall through to blank tabs.
  if (dest === "/(onboarding)/create-organization") {
    return <Redirect href={dest as Href} />;
  }

  // iPad branch (P26) — gated AFTER all auth redirects so the iPhone path below
  // stays byte-identical (RESP-04). The shell replaces Tabs + FieldKitTabBar.
  if (device === "ipad") {
    return <IpadShell />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FieldKitTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="clients" options={{ title: "Clients" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      {/* Work kept routable, OFF the bar (per CONTEXT) */}
      <Tabs.Screen name="projects" options={{ href: null }} />
      {/* Profile reached via the header avatar (per CONTEXT) */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
