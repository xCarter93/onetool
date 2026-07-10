"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
	Loader2,
	RefreshCcw,
	ExternalLink,
	ChevronDown,
	Wallet,
	ShieldCheck,
	ListChecks,
	Landmark,
} from "lucide-react";
import {
	ConnectPayouts,
	ConnectComponentsProvider,
} from "@stripe/react-connect-js";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useToast } from "@/hooks/use-toast";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { formatRelativeTime } from "@/lib/notification-utils";
import { StripeConnectProvider } from "@/components/stripe/StripeConnectProvider";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
	FrameFooter,
} from "@/components/reui/frame";
import { DotField } from "@/components/ui/dot-field";
import {
	PaymentsFlow,
	RequirementsSummary,
	FeeDisclosureTable,
	StripeDocLinks,
} from "@/components/stripe/payments-tab";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { SectionHeading } from "./settings-card";

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
	const doneCount = stripeStatus
		? [
				stripeStatus.detailsSubmitted,
				stripeStatus.chargesEnabled,
				stripeStatus.payoutsEnabled,
			].filter(Boolean).length
		: 0;
	const currentlyDue = stripeStatus?.requirements?.currently_due ?? [];

	return (
		<div className="space-y-6">
			<SectionHeading
				title="Payments"
				description="Onboard to Stripe to accept payments on behalf of your organization. Status is fetched live from Stripe each time you open this tab."
			/>

			{/* Connection & status */}
			{!hasAccount ? (
				<Frame>
					<FramePanel className="max-w-2xl space-y-4">
						<p className="text-sm leading-relaxed text-foreground">
							Start by creating a connected account. You&apos;ll be redirected
							to Stripe&apos;s hosted onboarding to provide verification
							details. Fees are paid by the connected account; disputes are
							handled by Stripe.
						</p>
						<StyledButton
							size="md"
							intent="primary"
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
							Note: The account ID will be stored on this organization so
							future visits reuse the same Stripe account.
						</p>
					</FramePanel>
				</Frame>
			) : (
				<Frame>
					<FrameHeader className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex min-w-0 items-center gap-4">
							{stripeStatus ? (
								<ProgressRing doneCount={doneCount} />
							) : (
								<span className="grid size-[70px] shrink-0 place-content-center rounded-full border border-dashed border-border text-muted-foreground">
									{statusLoading ? (
										<Loader2 className="size-5 animate-spin" aria-hidden="true" />
									) : (
										<ShieldCheck className="size-6" aria-hidden="true" />
									)}
								</span>
							)}
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<FrameTitle className="text-base">
										{stripeStatus
											? onboardingComplete
												? "Payments active"
												: "Finish account setup"
											: "Connected account"}
									</FrameTitle>
									{stripeStatus && <StatusPill active={onboardingComplete} />}
								</div>
								{!stripeStatus && (
									<FrameDescription className="mt-1 text-xs">
										{statusLoading
											? "Loading Stripe status…"
											: "Couldn't load Stripe status. Use Refresh status to retry."}
									</FrameDescription>
								)}
							</div>
						</div>

						{hasAccount && (
							<div className="flex shrink-0 flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={refreshStripeAccountStatus}
									disabled={statusLoading}
								>
									{statusLoading ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<RefreshCcw className="mr-2 h-4 w-4" />
									)}
									Refresh status
								</Button>
								{!onboardingComplete && (
									<StyledButton
										size="sm"
										intent="primary"
										onClick={handleStartStripeOnboarding}
										disabled={onboardingLoading}
										aria-label={
											onboardingLoading
												? "Loading onboarding..."
												: "Continue onboarding in Stripe"
										}
									>
										{onboardingLoading ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<ExternalLink className="mr-2 h-4 w-4" />
										)}
										Continue onboarding
									</StyledButton>
								)}
							</div>
						)}
					</FrameHeader>

					{stripeStatus && (
						<FramePanel className="isolate overflow-hidden [&::before]:z-0">
							<DotField className="text-primary opacity-[0.35] [mask-image:radial-gradient(120%_140%_at_100%_0%,black,transparent_75%)]" />
							<div className="relative z-10 flex flex-col md:flex-row">
								<HeroColumn
									label="Account"
									value={
										<span className="truncate font-mono text-sm font-semibold text-foreground">
											{stripeStatus.accountId}
										</span>
									}
								/>
								<HeroColumn
									label="Details submitted"
									value={<BooleanValue done={stripeStatus.detailsSubmitted} />}
								/>
								<HeroColumn
									label="Charges enabled"
									value={<BooleanValue done={stripeStatus.chargesEnabled} />}
								/>
								<HeroColumn
									label="Payouts enabled"
									value={<BooleanValue done={stripeStatus.payoutsEnabled} />}
								/>
							</div>
						</FramePanel>
					)}

					{stripeStatus && (
						<FrameFooter className="flex flex-row flex-wrap items-center justify-between gap-3">
							<div className="flex min-w-0 flex-1 items-center gap-3">
								<span className="grid size-9 shrink-0 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
									<Landmark className="size-4" aria-hidden="true" />
								</span>
								{organization?.stripeExternalAccountLast4 ? (
									<p className="min-w-0 truncate text-sm text-foreground">
										<span className="font-medium">
											{organization.stripeExternalAccountBankName ??
												"Linked bank"}
										</span>{" "}
										<span className="font-mono text-muted-foreground">
											••••{organization.stripeExternalAccountLast4}
										</span>
										{typeof organization.stripeExternalAccountUpdatedAt ===
											"number" && (
											<span className="text-muted-foreground">
												{" "}
												· Updated{" "}
												{formatRelativeTime(
													organization.stripeExternalAccountUpdatedAt,
												)}
											</span>
										)}
									</p>
								) : (
									<p className="text-sm text-muted-foreground">
										No bank account linked yet — finish Stripe onboarding to
										enable payouts.
									</p>
								)}
							</div>
							{onboardingComplete && isOwner && (
								<button
									type="button"
									onClick={() => {
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
									}}
									className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-opacity hover:opacity-80"
								>
									Change payout account
									<ChevronDown className="size-3.5" aria-hidden="true" />
								</button>
							)}
						</FrameFooter>
					)}
				</Frame>
			)}

			{/* How payments work — a self-contained interactive visual; intentionally
			    left as its own frame so it doesn't read as a card-within-a-card. */}
			<PaymentsFlow />

			{/* Fees & reference */}
			<div className="grid items-start gap-6 lg:grid-cols-2">
				<Frame>
					<FrameHeader>
						<FrameTitle className="text-base">
							Fees and responsibilities
						</FrameTitle>
						<FrameDescription className="text-xs">
							Who is charged, how much, and who sets it.
						</FrameDescription>
					</FrameHeader>
					<FramePanel>
						<FeeDisclosureTable />
					</FramePanel>
				</Frame>
				<div className="space-y-6">
					{hasAccount && (
						<Frame>
							<FrameHeader className="flex flex-row items-center justify-between gap-3">
								<div className="flex items-center gap-2.5">
									<span className="grid size-9 shrink-0 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
										<ListChecks className="size-4" aria-hidden="true" />
									</span>
									<FrameTitle className="text-base">
										Onboarding requirements
									</FrameTitle>
								</div>
								{Boolean(stripeStatus) && currentlyDue.length > 0 && (
									<span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
										{currentlyDue.length} required
									</span>
								)}
							</FrameHeader>
							<FramePanel>
								<RequirementsSummary
									loaded={Boolean(stripeStatus)}
									currentlyDue={currentlyDue}
								/>
							</FramePanel>
						</Frame>
					)}
					<Frame>
						<FrameHeader>
							<FrameTitle className="text-base">Learn more</FrameTitle>
							<FrameDescription className="text-xs">
								Stripe documentation, opens in a new tab.
							</FrameDescription>
						</FrameHeader>
						<FramePanel>
							<StripeDocLinks />
						</FramePanel>
					</Frame>
				</div>
			</div>

			{/* Payouts (Stripe Connect embedded component) — keeps its own
			    collapsible header + the change-bank scroll target */}
			{onboardingComplete && isOwner && organization?.stripeConnectAccountId && (
				<Frame>
					<h3 id="payouts-accordion-header" className="sr-only">
						Payouts
					</h3>
					<button
						type="button"
						onClick={() => setPayoutsOpen((v) => !v)}
						aria-expanded={payoutsOpen}
						aria-controls="payouts-accordion-panel"
						className="group flex w-full items-center justify-between gap-4 rounded-(--frame-radius) px-(--frame-panel-header-px) py-(--frame-panel-header-py) text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						<div className="flex min-w-0 items-center gap-3">
							<span className="grid size-9 shrink-0 place-content-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
								<Wallet className="size-4" aria-hidden="true" />
							</span>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<p className="text-sm font-semibold text-foreground">
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
								className={cn(
									"size-4 transition-transform duration-200",
									payoutsOpen && "rotate-180",
								)}
								aria-hidden="true"
							/>
						</div>
					</button>
					<div
						id="payouts-accordion-panel"
						role="region"
						aria-labelledby="payouts-accordion-header"
						hidden={!payoutsOpen}
					>
						{payoutsOpen && (
							<FramePanel>
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
							</FramePanel>
						)}
					</div>
				</Frame>
			)}
		</div>
	);
}

function StatusPill({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
				active
					? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					active ? "bg-emerald-500" : "bg-amber-500",
				)}
			/>
			{active ? "Active" : "Restricted"}
		</span>
	);
}

function ProgressRing({ doneCount }: { doneCount: number }) {
	const r = 29;
	const c = 2 * Math.PI * r;
	const fraction = doneCount / 3;
	const dash = fraction * c;
	return (
		<div className="relative grid size-[70px] shrink-0 place-content-center">
			<svg width={70} height={70} viewBox="0 0 70 70" className="-rotate-90">
				<circle
					cx={35}
					cy={35}
					r={r}
					fill="none"
					strokeWidth={6}
					className="stroke-amber-500/20"
				/>
				<circle
					cx={35}
					cy={35}
					r={r}
					fill="none"
					strokeWidth={6}
					strokeLinecap="round"
					strokeDasharray={`${dash} ${c}`}
					className="stroke-amber-500 transition-[stroke-dasharray] duration-500 ease-out dark:stroke-amber-400"
				/>
			</svg>
			<span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-foreground">
				{doneCount}/3
			</span>
		</div>
	);
}

/** One label→value column in the hero's card-9-style status row. */
function HeroColumn({
	label,
	value,
}: {
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="flex flex-1 basis-0 flex-col gap-1.5 border-b border-border/60 px-5 py-4 last:border-0 md:border-r md:border-b-0">
			<span className="text-xs text-muted-foreground">{label}</span>
			<div className="min-w-0">{value}</div>
		</div>
	);
}

function BooleanValue({ done }: { done: boolean }) {
	return (
		<span
			className={cn(
				"text-sm font-semibold",
				done
					? "text-emerald-600 dark:text-emerald-400"
					: "text-amber-600 dark:text-amber-400",
			)}
		>
			{done ? "Yes" : "Pending"}
		</span>
	);
}
