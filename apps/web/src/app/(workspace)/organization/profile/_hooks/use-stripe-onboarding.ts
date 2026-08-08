"use client";

import { useCallback, useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { useOrgOwner } from "./use-org-owner";

export type StripeAccountStatus = {
	accountId: string;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	requirements?: {
		currently_due?: string[];
		eventually_due?: string[];
		past_due?: string[];
	};
};

/**
 * Shared Stripe Connect onboarding kickoff: creates (or reuses) the connected
 * account, generates a hosted onboarding link, and redirects. Used by both the
 * Payments tab and the Stripe card on the Integrations tab.
 *
 * `onAccountStatus` receives the reduced account status captured just before the
 * redirect, so a caller can cache it.
 */
export function useStripeOnboarding(options?: {
	onAccountStatus?: (status: StripeAccountStatus) => void;
}) {
	const toast = useToast();
	const { isOwner } = useOrgOwner();
	const onAccountStatus = options?.onAccountStatus;

	const [onboardingLoading, setOnboardingLoading] = useState(false);

	const startOnboarding = useCallback(async () => {
		if (!isOwner) {
			toast.error(
				"Permission required",
				"Only the organization owner can manage payments.",
			);
			return;
		}

		setOnboardingLoading(true);

		const loadingToastId = toast.loading(
			"Connecting to Stripe…",
			"Setting up your connected account",
		);

		try {
			// The route derives account identity from the Clerk session.
			const accountResponse = await fetch("/api/stripe-connect/account", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const accountData = await accountResponse.json();
			if (!accountResponse.ok) {
				throw new Error(
					accountData?.error ??
						"Stripe could not create or retrieve the connected account.",
				);
			}

			const accountId: string | undefined = accountData?.accountId;
			if (!accountId) {
				throw new Error("Stripe did not return an account ID.");
			}

			// Generate an onboarding link and redirect the user.
			const linkResponse = await fetch("/api/stripe-connect/account-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const linkData = await linkResponse.json();
			if (!linkResponse.ok) {
				throw new Error(
					linkData?.error ??
						"Stripe could not generate an onboarding link. Try again.",
				);
			}

			if (!linkData?.url) {
				throw new Error("Stripe did not return an onboarding URL.");
			}

			// Capture the reduced status response; no full Stripe account is returned.
			onAccountStatus?.({
				accountId,
				chargesEnabled: Boolean(accountData.chargesEnabled),
				payoutsEnabled: Boolean(accountData.payoutsEnabled),
				detailsSubmitted: Boolean(accountData.detailsSubmitted),
				requirements: accountData.requirements,
			});

			toast.removeToast(loadingToastId);
			window.location.href = linkData.url;
		} catch (error) {
			toast.removeToast(loadingToastId);
			logError(error, { action: "stripe_onboarding" });
			toast.error(
				"Stripe onboarding failed",
				getUserFriendlyErrorMessage(error) ??
					"Unable to start Stripe onboarding right now.",
			);
		} finally {
			setOnboardingLoading(false);
		}
	}, [isOwner, toast, onAccountStatus]);

	return { startOnboarding, onboardingLoading };
}
