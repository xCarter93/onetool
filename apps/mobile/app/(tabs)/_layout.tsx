import { Tabs, Redirect } from "expo-router";
import type { Href } from "expo-router";
import { View } from "react-native";
import { SpeedDialFab } from "@/components/speed-dial-fab";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { GlassDock } from "@/components/glass-dock";
import { resolveAuthDestination, SETUP_ROUTE } from "@/lib/postAuthRouting";
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

  // Defensive gate: a signed-in user with no active org resolves to the setup
  // screen — never let them fall through to blank tabs. (Incomplete metadata no
  // longer routes here; that user reaches tabs and is nudged by the Home prompt.)
  if (dest === SETUP_ROUTE) {
    return <Redirect href={dest as Href} />;
  }

  // iPad branch (P26) — gated AFTER all auth redirects so the iPhone path below
  // stays byte-identical (RESP-04). The shell replaces Tabs + FieldKitTabBar.
  if (device === "ipad") {
    return <IpadShell />;
  }

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GlassDock {...props} />}
    >
      {/* Dock order: Today · Work · [assistant orb] · Money · Routes. The orb
          is a non-route center column owned by GlassDock. Activity left the
          dock in 3.0 — it on-ramps from Today's hero. */}
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="work" options={{ title: "Work" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      <Tabs.Screen name="routes" options={{ title: "Routes" }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      {/* Record surfaces stay routable for detail navigation but are reached
          THROUGH Work, so they hold no bar slot. */}
      <Tabs.Screen name="clients" options={{ href: null }} />
      <Tabs.Screen name="projects" options={{ href: null }} />
      {/* Profile reached via the header avatar (per CONTEXT) */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
    {/* Speed-dial capture fan — sibling of Tabs so its open-state backdrop
        paints over screens AND the dock (slice 5). */}
    <SpeedDialFab />
    </View>
  );
}
