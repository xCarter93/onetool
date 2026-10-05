import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { Href } from "expo-router";
import { WorkingSetPrefetcher } from "@/components/offline/working-set-prefetcher";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { PhoneFrame } from "@/components/frame/phone-frame";
import { fontFamily, tokens } from "@/lib/theme";
import { ShellAccessory } from "@/components/frame/context-tier";
import { useTabBarMinimize } from "@/lib/shell-chrome";
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
  const minimizeBehavior = useTabBarMinimize();

  const dest = resolveAuthDestination({
    authLoaded: Boolean(authLoaded),
    orgLoaded: Boolean(orgLoaded),
    membershipsLoaded: Boolean(listLoaded),
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
  // stays untouched (RESP-04). The shell replaces the native tabs and frame.
  if (device === "ipad") {
    return (
      <>
        <WorkingSetPrefetcher />
        <IpadShell />
      </>
    );
  }

  return (
    <>
      <WorkingSetPrefetcher />
      <PhoneFrame>
        <NativeTabs
          tintColor={tokens.primary}
          labelStyle={{ fontFamily: fontFamily.medium }}
          minimizeBehavior={minimizeBehavior}
        >
          <NativeTabs.BottomAccessory>
            <ShellAccessory />
          </NativeTabs.BottomAccessory>
          <NativeTabs.Trigger name="(today)">
            <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="calendar" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="(work)">
            <NativeTabs.Trigger.Label>Work</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="(money)">
            <NativeTabs.Trigger.Label>Money</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: "wallet.bifold", selected: "wallet.bifold.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="(routes)">
            <NativeTabs.Trigger.Label>Routes</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              sf={{
                default: "point.topleft.down.to.point.bottomright.curvepath",
                selected: "point.topleft.down.to.point.bottomright.curvepath.fill",
              }}
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="(search)" role="search">
            <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </PhoneFrame>
    </>
  );
}
