import { Redirect } from "expo-router";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { View, ActivityIndicator } from "react-native";
import type { Href } from "expo-router";
import { resolveAuthDestination } from "@/lib/postAuthRouting";

export default function Index() {
	const { isSignedIn, isLoaded: authLoaded } = useAuth();
	const { organization, isLoaded: orgLoaded } = useOrganization();
	const { userMemberships, isLoaded: listLoaded } = useOrganizationList({
		userMemberships: true,
	});
	const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);

	const dest = resolveAuthDestination({
		isLoaded: Boolean(authLoaded && orgLoaded && listLoaded),
		isSignedIn: Boolean(isSignedIn),
		hasActiveOrg: Boolean(organization),
		membershipCount: userMemberships?.data?.length ?? 0,
		needsMetadata,
	});

	// "loading" sentinel: orgs/metadata still resolving — hold the splash, do
	// NOT redirect. A signed-in no-org user resolves to the wizard, never a
	// /(tabs) flash on cold start.
	if (dest === "loading") {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return <Redirect href={dest as Href} />;
}
