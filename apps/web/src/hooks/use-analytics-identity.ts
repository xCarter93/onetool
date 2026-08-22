"use client";

import { useEffect, useRef } from "react";
import { useUser, useOrganization, useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	identifyUser,
	setPersonPlan,
	setUserOnce,
	setOrganizationGroup,
	resetAnalytics,
} from "@/lib/analytics";

/**
 * Hook that handles PostHog user and organization identification.
 * Automatically identifies users when they sign in via Clerk and
 * associates them with their organization for B2B analytics.
 *
 * User identification happens immediately when Clerk data is available.
 * Plan properties come from entitlements.getMine — the backend-resolved
 * plan (overrides, trial, grace included) — and are (re)applied whenever
 * the resolution changes, so a checkout or override flip updates cohorts
 * without a fresh sign-in.
 *
 * Call this hook once in a layout that wraps all authenticated routes.
 */
export function useAnalyticsIdentity() {
	const { user, isSignedIn, isLoaded: userLoaded } = useUser();
	const { organization, isLoaded: orgLoaded } = useOrganization();
	const { orgRole } = useAuth();
	const orgData = useQuery(api.organizations.get, {});
	const entitlements = useQuery(
		api.entitlements.getMine,
		isSignedIn ? {} : "skip"
	);

	const hasIdentified = useRef(false);
	const lastPlanSent = useRef<string | null>(null);
	const lastGroupPlanSent = useRef<string | null>(null);
	const prevSignedIn = useRef<boolean | null>(null);

	// Handle sign-out - reset PostHog identity and flags
	useEffect(() => {
		if (prevSignedIn.current === true && isSignedIn === false) {
			resetAnalytics();
			hasIdentified.current = false;
			lastPlanSent.current = null;
			lastGroupPlanSent.current = null;
		}
		prevSignedIn.current = isSignedIn ?? null;
	}, [isSignedIn]);

	// Identify user immediately when Clerk data is available (don't wait for Convex)
	useEffect(() => {
		if (!userLoaded || !orgLoaded) return;
		if (!isSignedIn || !user || !organization) return;
		if (hasIdentified.current) return;

		const role = orgRole?.toLowerCase().includes("admin") ? "admin" : "member";

		identifyUser(user.id, {
			email: user.primaryEmailAddress?.emailAddress ?? "",
			name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
			role,
			orgId: organization.id,
			orgName: organization.name,
		});

		setUserOnce({
			first_login: new Date().toISOString(),
			initial_referrer: document.referrer || "direct",
		});

		hasIdentified.current = true;
	}, [user, organization, orgRole, isSignedIn, userLoaded, orgLoaded]);

	// Person-level plan from the resolved entitlements — re-sent on change,
	// so the pre-Convex identify above never freezes plan_type at "free".
	useEffect(() => {
		if (!isSignedIn || !user || !entitlements) return;
		const key = `${entitlements.plan}:${entitlements.source}`;
		if (lastPlanSent.current === key) return;
		setPersonPlan(entitlements.plan, entitlements.source);
		lastPlanSent.current = key;
	}, [isSignedIn, user, entitlements]);

	// Set organization group when Convex org data becomes available, and
	// again whenever the resolved plan changes.
	useEffect(() => {
		if (!isSignedIn || !organization) return;
		if (!orgData || !entitlements) return;
		const key = `${organization.id}:${entitlements.plan}:${entitlements.source}`;
		if (lastGroupPlanSent.current === key) return;

		setOrganizationGroup(organization.id, {
			name: organization.name,
			planType: entitlements.plan,
			planSource: entitlements.source,
			stripeConnected: !!orgData.stripeConnectAccountId,
		});

		lastGroupPlanSent.current = key;
	}, [isSignedIn, organization, orgData, entitlements]);
}
