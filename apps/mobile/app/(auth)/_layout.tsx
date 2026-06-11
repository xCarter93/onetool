import { Redirect, Stack } from "expo-router";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Href } from "expo-router";
import { resolveAuthDestination } from "@/lib/postAuthRouting";

export default function AuthRoutesLayout() {
	const { isSignedIn, isLoaded: authLoaded } = useAuth();
	const { organization, isLoaded: orgLoaded } = useOrganization();
	const { userMemberships, isLoaded: listLoaded } = useOrganizationList({
		userMemberships: true,
	});
	const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);

	const isSignedInBool = Boolean(isSignedIn);
	const dest = resolveAuthDestination({
		isLoaded: Boolean(authLoaded && orgLoaded && listLoaded),
		isSignedIn: isSignedInBool,
		hasActiveOrg: Boolean(organization),
		membershipCount: userMemberships?.data?.length ?? 0,
		needsMetadata,
	});

	// Hold while orgs/metadata resolve — avoid a tabs/wizard flicker.
	if (dest === "loading") {
		return null;
	}

	// Signed in: route off the enriched decision (tabs, or the wizard when
	// there's no active org / metadata is incomplete) — never a bare /(tabs).
	if (isSignedInBool) {
		return <Redirect href={dest as Href} />;
	}

	return <Stack screenOptions={{ headerShown: false }} />;
}
