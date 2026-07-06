"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";

/**
 * Shared organization + ownership state for the profile tabs. Convex dedupes the
 * underlying queries across every tab that calls this, so each tab can own its
 * data without extra network cost.
 */
export function useOrgOwner() {
	const organization = useQuery(api.organizations.get, {});
	const currentUser = useQuery(api.users.current, {});

	const isLoading = organization === undefined || currentUser === undefined;
	const isOwner = Boolean(
		organization &&
			currentUser &&
			"ownerUserId" in organization &&
			organization.ownerUserId === currentUser._id,
	);

	return { organization, currentUser, isOwner, isLoading };
}
