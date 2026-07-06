"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
	Loader2,
	RefreshCcw,
	ExternalLink,
	ChevronDown,
	Wallet,
} from "lucide-react";
import {
	ConnectPayouts,
	ConnectComponentsProvider,
} from "@stripe/react-connect-js";

import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useToast } from "@/hooks/use-toast";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { StripeConnectProvider } from "@/components/stripe/StripeConnectProvider";
import {
	ConnectionStatusStrip,
	PaymentsFlow,
	RequirementsSummary,
	FeeDisclosureTable,
	StripeDocLinks,
} from "@/components/stripe/payments-tab";
import { Frame, FramePanel } from "@/components/reui/frame";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { SettingsSection } from "./settings-section";

type StripeAccountStatus = {
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

// Helper component to render onboarding button with consistent behavior
interface OnboardingButtonProps {
	onboardingLoading: boolean;
	onboardingComplete: boolean;
	onClick: () => void;
	disabled?: boolean;
	variant?: "styled" | "plain";
	size?: "md" | "sm";
	intent?: "secondary" | "plain";
	className?: string;
}

function OnboardingButton({
	onboardingLoading,
	onboardingComplete,
	onClick,
	disabled = false,
	variant = "styled",
	size = "md",
	intent = "secondary",
	className = "",
}: OnboardingButtonProps) {
	// Don't render if onboarding is complete
	if (onboardingComplete) return null;

	const isDisabled = onboardingLoading || disabled;
	const buttonText = onboardingLoading
		? null
		: onboardingComplete
			? "Open onboarding"
			: "Continue onboarding";
	const ariaLabel = onboardingLoading
		? "Loading onboarding..."
		: onboardingComplete
			? "Open onboarding in Stripe"
			: "Continue onboarding in Stripe";

	if (variant === "plain") {
		return (
			<Button
				intent="plain"
				className={`text-sm ${className}`}
				onClick={onClick}
				isDisabled={isDisabled}
				aria-label={ariaLabel}
			>
				{onboardingLoading ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<ExternalLink className="mr-2 h-4 w-4" />
				)}
				{buttonText}
			</Button>
		);
	}

	return (
		<StyledButton
			size={size}
			intent={intent}
			onClick={onClick}
			disabled={isDisabled}
			aria-label={ariaLabel}
			className={className}
		>
			{onboardingLoading ? (
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
			) : (
				<ExternalLink className="mr-2 h-4 w-4" />
			)}
			{buttonText}
		</StyledButton>
	);
}

export function PaymentsTab() {
	const searchParams = useSearchParams();
	const toast = useToast();
	const { organization, isOwner } = useOrgOwner();

	const [onboardingLoading, setOnboardingLoading] = useState(false);
	const [statusLoading, setStatusLoading] = useState(false);
	const [payoutsOpen, setPayoutsOpen] = useState(false);
	const [stripeStatus, setStripeStatus] = useState<StripeAccountStatus | null>(
		null,
	);
	const onboardingComplete = Boolean(
		stripeStatus?.detailsSubmitted &&
			stripeStatus?.chargesEnabled &&
			stripeStatus?.payoutsEnabled,
	);

	// Clear cached Stripe status if the active organization changes underneath us.
	const lastOrganizationId = useRef<string | null>(null);
	useEffect(() => {
		const currentOrgId = organization?._id ?? null;
		if (lastOrganizationId.current !== currentOrgId) {
			lastOrganizationId.current = currentOrgId;
			setStripeStatus(null);
		}
	}, [organization?._id]);

	const handleStartStripeOnboarding = useCallback(async () => {
		if (!isOwner) {
			toast.error(
				"Permission required",
				"Only the organization owner can manage payments.",
			);
			return;
		}

		setOnboardingLoading(true);

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
			setStripeStatus({
				accountId,
				chargesEnabled: Boolean(accountData.chargesEnabled),
				payoutsEnabled: Boolean(accountData.payoutsEnabled),
				detailsSubmitted: Boolean(accountData.detailsSubmitted),
				requirements: accountData.requirements,
			});

			window.location.href = linkData.url;
		} catch (error) {
			logError(error, { action: "stripe_onboarding" });
			toast.error(
				"Stripe onboarding failed",
				getUserFriendlyErrorMessage(error) ??
					"Unable to start Stripe onboarding right now.",
			);
		} finally {
			setOnboardingLoading(false);
		}
	}, [isOwner, toast]);

	const refreshStripeAccountStatus = useCallback(async () => {
		if (!organization?.stripeConnectAccountId) {
			toast.warning(
				"No Stripe account yet",
				"Create an account first to check status.",
			);
			return;
		}

		setStatusLoading(true);
		try {
			// The route derives account identity from the Clerk session.
			const statusResponse = await fetch("/api/stripe-connect/status", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const statusData = await statusResponse.json();
			if (!statusResponse.ok) {
				throw new Error(
					statusData?.error ??
						"Stripe could not provide the latest onboarding status.",
				);
			}

			setStripeStatus({
				accountId: statusData.accountId,
				chargesEnabled: Boolean(statusData.chargesEnabled),
				payoutsEnabled: Boolean(statusData.payoutsEnabled),
				detailsSubmitted: Boolean(statusData.detailsSubmitted),
				requirements: statusData.requirements,
			});
		} catch (error) {
			logError(error, { action: "stripe_status" });
			toast.error(
				"Unable to load Stripe status",
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
			);
		} finally {
			setStatusLoading(false);
		}
	}, [organization?.stripeConnectAccountId, toast]);

	// Synchronous in-flight guard: the deferred fetch flips statusLoading only once
	// the microtask runs, so without this a re-render in between could schedule a
	// second fetch. Reset in finally so error retries still work.
	const statusInFlightRef = useRef(false);
	// One automatic fetch per account context, so a failed fetch (which leaves
	// stripeStatus null) doesn't re-trigger the effect and spam network/toasts.
	const statusAutoFetchedRef = useRef(false);
	useEffect(() => {
		statusAutoFetchedRef.current = false;
	}, [organization?.stripeConnectAccountId]);
	useEffect(() => {
		if (
			organization?.stripeConnectAccountId &&
			!stripeStatus &&
			!statusLoading &&
			!statusInFlightRef.current &&
			!statusAutoFetchedRef.current
		) {
			statusAutoFetchedRef.current = true;
			statusInFlightRef.current = true;
			// Defer so the effect doesn't trigger setState synchronously
			queueMicrotask(() => {
				void refreshStripeAccountStatus().finally(() => {
					statusInFlightRef.current = false;
				});
			});
		}
	}, [
		organization?.stripeConnectAccountId,
		refreshStripeAccountStatus,
		statusLoading,
		stripeStatus,
	]);

	// Stripe sends users here with refresh=1 when an onboarding link expires.
	const refreshTriggeredRef = useRef(false);
	useEffect(() => {
		if (refreshTriggeredRef.current) return;
		if (
			searchParams.get("refresh") === "1" &&
			isOwner &&
			!onboardingLoading
		) {
			refreshTriggeredRef.current = true;
			// Defer so the effect doesn't trigger setState synchronously
			queueMicrotask(() => void handleStartStripeOnboarding());
		}
	}, [searchParams, isOwner, onboardingLoading, handleStartStripeOnboarding]);

	const hasAccount = Boolean(organization?.stripeConnectAccountId);

	return (
		<div className="space-y-6">
			{/* Connection & status */}
			<SettingsSection
				title="Payments"
				description="Onboard to Stripe to accept payments on behalf of your organization. Status is fetched live from Stripe each time you open this tab."
				texture
				footer={
					hasAccount ? (
						<div className="flex w-full flex-wrap justify-end gap-3">
							<Button
								intent="outline"
								size="sm"
								onClick={refreshStripeAccountStatus}
								isDisabled={statusLoading}
							>
								{statusLoading ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<RefreshCcw className="mr-2 h-4 w-4" />
								)}
								Refresh status
							</Button>
							<OnboardingButton
								onboardingLoading={onboardingLoading}
								onboardingComplete={onboardingComplete}
								onClick={handleStartStripeOnboarding}
								variant="styled"
								size="sm"
								intent="secondary"
							/>
						</div>
					) : undefined
				}
			>
				{!hasAccount ? (
					<div className="max-w-2xl space-y-4">
						<p className="text-sm leading-relaxed text-foreground">
							Start by creating a connected account. You&apos;ll be redirected
							to Stripe&apos;s hosted onboarding to provide verification
							details. Fees are paid by the connected account; disputes are
							handled by Stripe.
						</p>
						<StyledButton
							size="md"
							onClick={handleStartStripeOnboarding}
							disabled={onboardingLoading}
						>
							{onboardingLoading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<ExternalLink className="mr-2 h-4 w-4" />
							)}
							Onboard to collect payments
						</StyledButton>
						<p className="text-xs text-muted-foreground">
							Note: The account ID will be stored on this organization so future
							visits reuse the same Stripe account.
						</p>
					</div>
				) : stripeStatus ? (
					<ConnectionStatusStrip
						accountId={organization!.stripeConnectAccountId!}
						detailsSubmitted={Boolean(stripeStatus.detailsSubmitted)}
						chargesEnabled={Boolean(stripeStatus.chargesEnabled)}
						payoutsEnabled={Boolean(stripeStatus.payoutsEnabled)}
						bankName={organization!.stripeExternalAccountBankName}
						last4={organization!.stripeExternalAccountLast4}
						updatedAt={organization!.stripeExternalAccountUpdatedAt}
						onChangeBank={
							onboardingComplete && isOwner
								? () => {
										setPayoutsOpen(true);
										// Wait for the accordion panel to mount before scrolling.
										requestAnimationFrame(() => {
											document
												.getElementById("payouts-accordion-panel")
												?.scrollIntoView({
													behavior: "smooth",
													block: "start",
												});
										});
									}
								: undefined
						}
					/>
				) : statusLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading Stripe status…
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						Couldn&apos;t load Stripe status. Use{" "}
						<strong className="font-medium text-foreground">
							Refresh status
						</strong>{" "}
						to retry.
					</p>
				)}
			</SettingsSection>

			{/* Payouts (Stripe Connect embedded component) — framed, keeps its own
			    collapsible header + the change-bank scroll target */}
			{onboardingComplete && isOwner && organization?.stripeConnectAccountId && (
				<Frame spacing="lg">
					<FramePanel>
						<h3 id="payouts-accordion-header" className="sr-only">
							Payouts
						</h3>
						<button
							type="button"
							onClick={() => setPayoutsOpen((v) => !v)}
							aria-expanded={payoutsOpen}
							aria-controls="payouts-accordion-panel"
							className="group flex w-full items-center justify-between gap-4 rounded-lg text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						>
							<div className="flex min-w-0 items-center gap-3">
								<span className="grid h-8 w-8 shrink-0 place-content-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
									<Wallet className="h-4 w-4" aria-hidden="true" />
								</span>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<p className="text-base font-semibold text-foreground">
											Payouts
										</p>
										<span className="whitespace-nowrap rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
											via Stripe
										</span>
									</div>
									<p className="text-sm text-muted-foreground">
										Payout schedule, history, and instant or manual payouts.
									</p>
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
								<span className="hidden sm:inline">
									{payoutsOpen ? "Hide" : "Show"}
								</span>
								<ChevronDown
									className={`h-4 w-4 transition-transform duration-200 ${
										payoutsOpen ? "rotate-180" : ""
									}`}
									aria-hidden="true"
								/>
							</div>
						</button>
						<div
							id="payouts-accordion-panel"
							role="region"
							aria-labelledby="payouts-accordion-header"
							hidden={!payoutsOpen}
							className="pt-4"
						>
							{payoutsOpen && (
								<StripeConnectProvider
									accountId={organization.stripeConnectAccountId}
								>
									{(connectInstance) => {
										if (!connectInstance) {
											return (
												<div className="flex items-center justify-center py-8">
													<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
													<span className="ml-2 text-sm text-muted-foreground">
														Loading payouts...
													</span>
												</div>
											);
										}
										return (
											<ConnectComponentsProvider
												connectInstance={connectInstance}
											>
												<ConnectPayouts />
											</ConnectComponentsProvider>
										);
									}}
								</StripeConnectProvider>
							)}
						</div>
					</FramePanel>
				</Frame>
			)}

			{/* How payments work — a self-contained interactive visual; intentionally
			    left unframed so its own cards don't read as cards-within-a-card. */}
			<PaymentsFlow
				bankName={organization?.stripeExternalAccountBankName}
				last4={organization?.stripeExternalAccountLast4}
			/>

			{/* Fees & reference — grouped into a single framed panel */}
			<Frame spacing="lg">
				<FramePanel>
					<div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.55fr_1fr] lg:items-start">
						<FeeDisclosureTable />
						<div className="space-y-8">
							{hasAccount && (
								<RequirementsSummary
									loaded={Boolean(stripeStatus)}
									currentlyDue={stripeStatus?.requirements?.currently_due ?? []}
								/>
							)}
							<StripeDocLinks />
						</div>
					</div>
				</FramePanel>
			</Frame>
		</div>
	);
}
