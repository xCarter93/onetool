"use client";

import {
	useCallback,
	useEffect,
	useId,
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
	ShieldAlert,
	Settings2,
	ListChecks,
	Landmark,
	FileText,
	CircleAlert,
} from "lucide-react";
import {
	ConnectPayouts,
	ConnectDisputesList,
	ConnectDocuments,
	ConnectAccountManagement,
	ConnectNotificationBanner,
	ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import type { LoadError } from "@stripe/connect-js";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { LearnMoreLink } from "@/components/help/learn-more";
import { useToast } from "@/hooks/use-toast";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { formatRelativeTime } from "@/lib/notification-utils";
import {
	StripeConnectProvider,
	type StripeConnectSession,
} from "@/components/stripe/StripeConnectProvider";
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
	usePlatformFee,
} from "@/components/stripe/payments-tab";
import { useOrgOwner } from "../_hooks/use-org-owner";
import {
	useStripeOnboarding,
	type StripeAccountStatus,
} from "../_hooks/use-stripe-onboarding";
import { SectionHeading } from "./settings-card";

export function PaymentsTab() {
	const searchParams = useSearchParams();
	const toast = useToast();
	const { organization, isOwner } = useOrgOwner();

	const [statusLoading, setStatusLoading] = useState(false);
	const [payoutsOpen, setPayoutsOpen] = useState(false);
	// Dispute notifications deep-link here with ?section=disputes.
	const [disputesOpen, setDisputesOpen] = useState(
		() => searchParams.get("section") === "disputes",
	);
	const [documentsOpen, setDocumentsOpen] = useState(false);
	const [accountMgmtOpen, setAccountMgmtOpen] = useState(false);
	const [bannerNoticeCount, setBannerNoticeCount] = useState(0);
	const [stripeStatus, setStripeStatus] = useState<StripeAccountStatus | null>(
		null,
	);
	const platformFee = usePlatformFee();
	const onboardingComplete = Boolean(
		stripeStatus?.detailsSubmitted &&
			stripeStatus?.chargesEnabled &&
			stripeStatus?.payoutsEnabled,
	);
	// Stripe's management surfaces belong to any account that has been through
	// onboarding, even one restricted later — a dispute deadline doesn't wait
	// for re-verification. Only taking new payments depends on charges.
	const hasSubmittedAccount = Boolean(stripeStatus?.detailsSubmitted);

	// Clear cached Stripe status if the active organization changes underneath us.
	const lastOrganizationId = useRef<string | null>(null);
	useEffect(() => {
		const currentOrgId = organization?._id ?? null;
		if (lastOrganizationId.current !== currentOrgId) {
			lastOrganizationId.current = currentOrgId;
			setStripeStatus(null);
		}
	}, [organization?._id]);

	const {
		startOnboarding: handleStartStripeOnboarding,
		onboardingLoading,
	} = useStripeOnboarding({ onAccountStatus: setStripeStatus });

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

	const connectAccountId = organization?.stripeConnectAccountId;

	const renderTab = (session: StripeConnectSession) => (
		// pb-4 reserves room for the floating collapse toggle on the last frame.
		<div className="space-y-6 pb-4">
			<SectionHeading
				title="Payments"
				description="Onboard to Stripe to accept payments on behalf of your organization. Status is fetched live from Stripe each time you open this tab."
				aside={
					<LearnMoreLink
						article="settings-and-team/setting-up-online-payments"
						label="How payments setup works"
					/>
				}
			/>

			{/* Connection & status */}
			{!hasAccount ? (
				<Frame>
					<FramePanel className="max-w-2xl space-y-4">
						<p className="text-sm leading-relaxed text-foreground">
							Start by creating a connected account. You&apos;ll be redirected
							to Stripe&apos;s hosted onboarding to provide verification
							details. Processing fees come out of each payment, and if a
							client disputes a charge you submit evidence in the Disputes
							section here before Stripe&apos;s deadline.
						</p>
						<Button
							onClick={handleStartStripeOnboarding}
							disabled={onboardingLoading}
						>
							{onboardingLoading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<ExternalLink className="mr-2 h-4 w-4" />
							)}
							Onboard to collect payments
						</Button>
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
									<Button
										size="sm"
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
									</Button>
								)}
							</div>
						)}
					</FrameHeader>

					{/* Stripe-maintained requirement/risk alerts. Renders nothing unless
					    Stripe has an open task, so the wrapper only pads once notices
					    exist — never hide it, or the count callback would starve. */}
					{session.error ? (
						<div className="px-(--frame-panel-header-px) pb-3">
							<SessionErrorNotice session={session} />
						</div>
					) : (
						session.connectInstance && (
							<div
								className={cn(
									"px-(--frame-panel-header-px)",
									bannerNoticeCount > 0 && "pb-2",
								)}
							>
								<ConnectComponentsProvider
									connectInstance={session.connectInstance}
								>
									<ConnectNotificationBanner
										onNotificationsChange={({ total }) =>
											setBannerNoticeCount(total)
										}
									/>
								</ConnectComponentsProvider>
							</div>
						)
					)}

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
							{hasSubmittedAccount && isOwner && (
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

					{/* Stripe-hosted management surfaces as collapsible rows. Each loads
					    on its own so one failing component never hides the others.
					    Payouts keeps the change-bank scroll target id. */}
					{hasSubmittedAccount && isOwner && connectAccountId && (
						<>
							<ConnectSection
								id="payouts"
								icon={<Wallet className="size-4" aria-hidden="true" />}
								title="Payouts"
								description="Payout schedule, history, and instant or manual payouts."
								open={payoutsOpen}
								onToggle={() => setPayoutsOpen((v) => !v)}
								session={session}
								loadingLabel="Loading payouts..."
							>
								{(onLoadError) => <ConnectPayouts onLoadError={onLoadError} />}
							</ConnectSection>
							<ConnectSection
								id="disputes"
								icon={<ShieldAlert className="size-4" aria-hidden="true" />}
								title="Disputes"
								description="Respond to chargebacks before the evidence deadline — submit evidence, accept, or refund to resolve."
								open={disputesOpen}
								onToggle={() => setDisputesOpen((v) => !v)}
								session={session}
								loadingLabel="Loading disputes..."
							>
								{(onLoadError) => (
									<ConnectDisputesList onLoadError={onLoadError} />
								)}
							</ConnectSection>
							<ConnectSection
								id="documents"
								icon={<FileText className="size-4" aria-hidden="true" />}
								title="Tax documents"
								description="Download Stripe's fee invoices and 1099 tax forms for this account."
								open={documentsOpen}
								onToggle={() => setDocumentsOpen((v) => !v)}
								session={session}
								loadingLabel="Loading documents..."
							>
								{(onLoadError) => <ConnectDocuments onLoadError={onLoadError} />}
							</ConnectSection>
							<ConnectSection
								id="account-management"
								icon={<Settings2 className="size-4" aria-hidden="true" />}
								title="Account details"
								description="Update the business and verification details Stripe has on file."
								open={accountMgmtOpen}
								onToggle={() => setAccountMgmtOpen((v) => !v)}
								session={session}
								loadingLabel="Loading account details..."
							>
								{(onLoadError) => (
									<ConnectAccountManagement onLoadError={onLoadError} />
								)}
							</ConnectSection>
						</>
					)}
				</Frame>
			)}

			{/* How payments work — a self-contained interactive visual; intentionally
			    left as its own frame so it doesn't read as a card-within-a-card. */}
			<PaymentsFlow platformFeeDollars={platformFee.dollars} />

			{/* Fees & reference — collapsed by default; badges surface what needs
			    attention without opening. */}
			<div className="grid items-start gap-6 lg:grid-cols-2">
				<CollapsibleFrame
					title="Fees and responsibilities"
					description="Who is charged, how much, and who sets it."
					className={hasAccount ? undefined : "lg:col-span-2"}
				>
					<FeeDisclosureTable platformFee={platformFee} />
				</CollapsibleFrame>
				{hasAccount && (
					<CollapsibleFrame
						title="Onboarding requirements"
						description="What Stripe still needs from your account."
						icon={
							<span className="grid size-9 shrink-0 place-content-center rounded-lg border border-border bg-muted text-muted-foreground">
								<ListChecks className="size-4" aria-hidden="true" />
							</span>
						}
						meta={
							Boolean(stripeStatus) &&
							currentlyDue.length > 0 && (
								<Badge
									variant="warning-light"
									radius="full"
									className="shrink-0 px-2.5"
								>
									{currentlyDue.length} required
								</Badge>
							)
						}
					>
						<RequirementsSummary
							loaded={Boolean(stripeStatus)}
							currentlyDue={currentlyDue}
						/>
					</CollapsibleFrame>
				)}
			</div>
			<CollapsibleFrame
				title="Learn more"
				description="Stripe documentation, opens in a new tab."
			>
				<StripeDocLinks columns={2} />
			</CollapsibleFrame>
		</div>
	);

	// One Connect session powers the banner and every embedded section.
	if (hasAccount && isOwner && connectAccountId) {
		return (
			<StripeConnectProvider accountId={connectAccountId}>
				{renderTab}
			</StripeConnectProvider>
		);
	}
	return renderTab(NO_SESSION);
}

const NO_SESSION: StripeConnectSession = {
	connectInstance: null,
	error: null,
	retry: () => {},
};

function SessionErrorNotice({ session }: { session: StripeConnectSession }) {
	return (
		<div
			role="alert"
			className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.05] px-3.5 py-3"
		>
			<CircleAlert
				className="mt-0.5 size-4 shrink-0 text-destructive"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1 text-sm">
				<p className="font-medium text-foreground">
					Couldn&apos;t load Stripe&apos;s embedded tools
				</p>
				<p className="text-muted-foreground">{session.error}</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={session.retry}
				className="shrink-0"
			>
				Try again
			</Button>
		</div>
	);
}

/** Collapsible panel row inside the main status frame, hosting one Stripe
 *  Connect embedded component. */
function ConnectSection({
	id,
	icon,
	title,
	description,
	open,
	onToggle,
	session,
	loadingLabel,
	children,
}: {
	id: string;
	icon: ReactNode;
	title: string;
	description: string;
	open: boolean;
	onToggle: () => void;
	session: StripeConnectSession;
	loadingLabel: string;
	children: (onLoadError: (event: LoadError) => void) => ReactNode;
}) {
	const [loadError, setLoadError] = useState<string | null>(null);
	// Remounting the provider subtree is how a failed component gets retried.
	const [attempt, setAttempt] = useState(0);
	const { connectInstance } = session;

	const onLoadError = ({ error }: LoadError) => {
		setLoadError(
			error.message ?? "Stripe couldn't load this section for your account.",
		);
	};

	let body: ReactNode;
	if (session.error) {
		// The full notice with its retry sits above in the status frame.
		body = (
			<p className="py-2 text-sm text-muted-foreground">
				Stripe&apos;s tools couldn&apos;t load. Use Try again above.
			</p>
		);
	} else if (loadError) {
		body = (
			<div
				role="alert"
				className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.05] px-3.5 py-3"
			>
				<CircleAlert
					className="mt-0.5 size-4 shrink-0 text-destructive"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1 text-sm">
					<p className="font-medium text-foreground">
						{title} didn&apos;t load
					</p>
					<p className="text-muted-foreground">{loadError}</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setLoadError(null);
						setAttempt((n) => n + 1);
					}}
					className="shrink-0"
				>
					Try again
				</Button>
			</div>
		);
	} else if (!connectInstance) {
		body = (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				<span className="ml-2 text-sm text-muted-foreground">
					{loadingLabel}
				</span>
			</div>
		);
	} else {
		body = (
			<ConnectComponentsProvider key={attempt} connectInstance={connectInstance}>
				{children(onLoadError)}
			</ConnectComponentsProvider>
		);
	}

	return (
		<FramePanel className="p-0" fit>
			<h3 id={`${id}-accordion-header`} className="sr-only">
				{title}
			</h3>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				aria-controls={`${id}-accordion-panel`}
				className="group flex w-full items-center justify-between gap-4 px-(--frame-panel-px) py-3 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<div className="flex min-w-0 items-center gap-3">
					<span className="grid size-9 shrink-0 place-content-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
						{icon}
					</span>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="text-sm font-semibold text-foreground">{title}</p>
							<span className="whitespace-nowrap rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
								via Stripe
							</span>
						</div>
						<p className="text-sm text-muted-foreground">{description}</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
					<span className="hidden sm:inline">{open ? "Hide" : "Show"}</span>
					<ChevronDown
						className={cn(
							"size-4 transition-transform duration-200",
							open && "rotate-180",
						)}
						aria-hidden="true"
					/>
				</div>
			</button>
			<div
				id={`${id}-accordion-panel`}
				role="region"
				aria-labelledby={`${id}-accordion-header`}
				hidden={!open}
			>
				{open && (
					<div className="border-t border-border/60 px-(--frame-panel-px) py-(--frame-panel-py)">
						{body}
					</div>
				)}
			</div>
		</FramePanel>
	);
}

/** Collapsible content frame styled after the sidebar "Getting started" card:
 *  clickable header, height-animated panel, floating round chevron toggle
 *  straddling the bottom edge. */
function CollapsibleFrame({
	title,
	description,
	icon,
	meta,
	className,
	children,
}: {
	title: string;
	description: string;
	icon?: ReactNode;
	meta?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	return (
		// overflow-visible + pb-1 so the floating toggle can hang off the bottom
		// edge; surrounding grid/stack gaps reserve room for it.
		<Frame stacked className={cn("relative w-full overflow-visible pb-1", className)}>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				aria-expanded={open}
				aria-controls={panelId}
				className="flex w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<FrameHeader className="flex grow flex-row items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						{icon}
						<div className="flex min-w-0 flex-col items-start">
							<FrameTitle className="text-base">{title}</FrameTitle>
							<FrameDescription className="text-xs">
								{description}
							</FrameDescription>
						</div>
					</div>
					{meta && <div className="shrink-0">{meta}</div>}
				</FrameHeader>
			</button>
			{/* Height-animated (grid-rows 0fr→1fr) rather than mounted/unmounted,
			    so the panel slides open to its natural height with no clipping cap.
			    `inert` drops collapsed content out of tab order and the AT tree. */}
			<div
				id={panelId}
				inert={!open}
				className={cn(
					"grid transition-[grid-template-rows] duration-500 ease-in-out motion-reduce:transition-none",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<FramePanel>{children}</FramePanel>
				</div>
			</div>
			{/* Floating toggle straddling the bottom edge */}
			<div className="absolute -bottom-3.5 left-1/2 z-10 -translate-x-1/2">
				<Button
					variant="outline"
					size="icon-sm"
					aria-expanded={open}
					aria-controls={panelId}
					onClick={() => setOpen((prev) => !prev)}
					className="rounded-full bg-background shadow-sm hover:bg-background"
				>
					<ChevronDown
						aria-hidden="true"
						className={cn(
							"transition-transform duration-300 motion-reduce:transition-none",
							open && "rotate-180",
						)}
					/>
					<span className="sr-only">
						{open ? "Collapse" : "Expand"} {title}
					</span>
				</Button>
			</div>
		</Frame>
	);
}

function StatusPill({ active }: { active: boolean }) {
	return (
		<StatusBadge role={active ? "success" : "warning"} className="gap-1.5">
			<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
			{active ? "Active" : "Restricted"}
		</StatusBadge>
	);
}

function ProgressRing({ doneCount }: { doneCount: number }) {
	const r = 29;
	const c = 2 * Math.PI * r;
	const fraction = doneCount / 3;
	const dash = fraction * c;
	const complete = doneCount === 3;
	return (
		<div className="relative grid size-[70px] shrink-0 place-content-center">
			<svg width={70} height={70} viewBox="0 0 70 70" className="-rotate-90">
				<circle
					cx={35}
					cy={35}
					r={r}
					fill="none"
					strokeWidth={6}
					className={cn(
						complete ? "stroke-emerald-500/20" : "stroke-amber-500/20",
					)}
				/>
				<circle
					cx={35}
					cy={35}
					r={r}
					fill="none"
					strokeWidth={6}
					strokeLinecap="round"
					strokeDasharray={`${dash} ${c}`}
					className={cn(
						"transition-[stroke-dasharray] duration-500 ease-out",
						complete
							? "stroke-emerald-500 dark:stroke-emerald-400"
							: "stroke-amber-500 dark:stroke-amber-400",
					)}
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
