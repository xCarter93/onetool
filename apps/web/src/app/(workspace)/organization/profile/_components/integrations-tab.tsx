"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ComponentType,
	type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
	Banknote,
	CircleAlert,
	CircleCheck,
	CircleMinus,
	CreditCard,
	FileText,
	Landmark,
	Lock,
	ShieldAlert,
} from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from "@/components/ui/item";
import { Badge } from "@/components/reui/badge";
import { DotField } from "@/components/ui/dot-field";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { QuickBooksMark, StripeMark } from "./integration-brand-marks";
import { useStripeOnboarding } from "../_hooks/use-stripe-onboarding";
import { QuickBooksSetupDialog } from "./quickbooks-setup-dialog";
import {
	QBO_IMPORT_REVIEW_URL,
	QuickBooksImportDialog,
} from "./quickbooks-import-dialog";
import { QuickBooksResetDialog } from "./quickbooks-reset-dialog";
import { QuickBooksSyncIssues } from "./quickbooks-sync-issues";
import { useQuickBooksEnabled } from "@/hooks/use-quickbooks-enabled";
import { useEntitlements } from "@/hooks/use-entitlements";
import Link from "next/link";
import {
	SectionHeading,
	SettingsCard,
	SettingsCardBody,
} from "./settings-card";

const CONNECT_URL = "/api/quickbooks/connect";
const PAYMENTS_TAB_URL = "/organization/profile?tab=payments";

const ERROR_MESSAGES: Record<string, string> = {
	denied: "Connection was cancelled in QuickBooks.",
	realm_in_use:
		"That QuickBooks company is already connected to a different organization.",
	realm_mismatch:
		"This QuickBooks company doesn't match the one previously connected. Reset the connection to link a different company.",
	unavailable:
		"The QuickBooks integration isn't available yet. It's coming soon.",
	not_owner: "Only the organization owner can connect QuickBooks.",
	not_premium: "QuickBooks sync requires the Business plan.",
	config: "QuickBooks is not configured for this environment yet.",
	state: "The connection request expired. Start again from this page.",
	org_changed:
		"Your active organization changed during the connection. Switch back and try again.",
	missing_params: "QuickBooks did not return the details we need. Try again.",
	exchange_failed: "QuickBooks rejected the connection request. Try again.",
	unknown: "Something went wrong connecting QuickBooks. Try again.",
};

const CONNECTOR_TILE =
	"flex items-center justify-center rounded-lg border-2 border-background bg-background shadow-sm dark:border-muted/80 dark:bg-muted/80";

type StatusTone = "connected" | "attention" | "off";

/**
 * Status icons follow the badge color language (`text-*-foreground` resolves
 * per theme), so they stay readable on the band in light and dark.
 */
const STATUS_TONE: Record<
	StatusTone,
	{ Icon: ComponentType<{ className?: string }>; className: string }
> = {
	connected: { Icon: CircleCheck, className: "text-success-foreground" },
	attention: { Icon: CircleAlert, className: "text-warning-foreground" },
	off: { Icon: CircleMinus, className: "text-muted-foreground" },
};

/**
 * Connection status for the card, anchored in the connector band. The label is
 * the accessible name and the tooltip text; degraded states also carry a text
 * chip beside the integration name, so this is never the only signal.
 */
function IntegrationStatusIcon({
	tone,
	label,
}: {
	tone: StatusTone;
	label: string;
}) {
	const { Icon, className } = STATUS_TONE[tone];
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						role="img"
						aria-label={label}
						tabIndex={0}
						className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					/>
				}
			>
				<Icon className={`size-4 ${className}`} />
			</TooltipTrigger>
			<TooltipContent side="left" className="px-2 py-1 text-xs">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Connector diagram in the card-5 grammar: data-type icons flank the brand
 * mark on a dashed line over a masked dot field. The diagram is decorative (the
 * integration is named in the header below) but the status icon pinned to its
 * top-right corner is not, so only the diagram is hidden from assistive tech.
 */
function IntegrationConnectorBand({
	brand,
	leftIcon: LeftIcon,
	rightIcon: RightIcon,
	status,
	locked = false,
}: {
	brand: ReactNode;
	leftIcon: ComponentType<{ className?: string }>;
	rightIcon: ComponentType<{ className?: string }>;
	status: ReactNode;
	/** Plan-gated: dims the diagram and locks the brand mark. The plan badge and
	    description in the header carry the meaning; this overlay is decorative. */
	locked?: boolean;
}) {
	return (
		<div className="relative isolate overflow-hidden border-b border-border bg-muted/40 px-6 py-6">
			<div aria-hidden="true" className={locked ? "opacity-55" : undefined}>
				<DotField className="text-muted-foreground [mask-image:radial-gradient(86%_76%_at_50%_46%,black,transparent)]" />
				<div className="relative z-10 flex items-center justify-center">
					<div className={`size-10 ${CONNECTOR_TILE}`}>
						<LeftIcon className="size-4 text-muted-foreground" />
					</div>
					<div className="mx-1 w-8 border-t border-dashed border-foreground/20" />
					<div className={`size-13 rounded-xl ${CONNECTOR_TILE}`}>{brand}</div>
					<div className="mx-1 w-8 border-t border-dashed border-foreground/20" />
					<div className={`size-10 ${CONNECTOR_TILE}`}>
						<RightIcon className="size-4 text-muted-foreground" />
					</div>
				</div>
			</div>
			{locked && (
				// Centered on the band = centered on the brand tile (the diagram is
				// symmetric), so the scrim sits exactly over the brand mark.
				<span
					aria-hidden="true"
					className="absolute inset-0 z-20 flex items-center justify-center"
				>
					<span className="flex size-13 items-center justify-center rounded-xl bg-background/60 backdrop-blur-[1px]">
						<Lock className="size-5 text-foreground" />
					</span>
				</span>
			)}
			<div className="absolute right-3 top-3 z-10">{status}</div>
		</div>
	);
}

/** Compact tile header: name + status inline, primary action right. */
function IntegrationTileHeader({
	name,
	status,
	description,
	meta,
	action,
}: {
	name: string;
	status: ReactNode;
	description: ReactNode;
	meta?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-sm font-semibold tracking-tight">{name}</h3>
					{status}
				</div>
				<p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
				{meta}
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
	);
}

function NotConnectedBadge() {
	return (
		<Badge variant="secondary" radius="full" size="sm">
			Not connected
		</Badge>
	);
}

/** Shown while an integration is built but deliberately not yet released. */
function BusinessPlanBadge() {
	return (
		<Badge variant="primary-light" radius="full" size="sm">
			Business plan
		</Badge>
	);
}

function ComingSoonBadge() {
	return (
		<Badge variant="primary-light" radius="full" size="sm">
			Coming soon
		</Badge>
	);
}

export function IntegrationsTab() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const { organization, isOwner, isLoading: ownerLoading } = useOrgOwner();
	const { confirm: confirmDialog } = useConfirmDialog();

	// Held behind a PostHog flag until Intuit grants production credentials. The
	// OAuth routes enforce the same flag server-side, so this only controls what
	// the card offers — it is not the security boundary.
	const qboEnabled = useQuickBooksEnabled();
	// The tab itself is open to every plan (it's the Stripe front door); only
	// the QuickBooks tile is Business-gated. Server mutations enforce the same.
	const { allows, isLoading: planLoading } = useEntitlements();
	const qboPlanLocked = !planLoading && !allows("quickbooks");

	const connection = useQuery(api.quickbooks.getConnectionStatus);
	const importRun = useQuery(api.quickbooksImport.getImportRun);
	const updateSyncSettings = useMutation(api.quickbooks.updateSyncSettings);
	const disconnect = useMutation(api.quickbooks.disconnect);

	const { startOnboarding, onboardingLoading } = useStripeOnboarding();

	const [saving, setSaving] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [setupOpen, setSetupOpen] = useState(false);
	// A fresh connect should land straight in setup, but the connection query is
	// still loading on first render — capture the OAuth outcome at mount (the
	// effect below strips the param) and open once the connection resolves.
	const [armSetup] = useState(() => searchParams.get("qbo") === "connected");
	const [setupDismissed, setSetupDismissed] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [importDismissed, setImportDismissed] = useState(false);
	const [resetOpen, setResetOpen] = useState(false);
	// The realm-mismatch failure only arrives as a URL param, and the effect
	// below strips it — capture it at mount so the tile can offer the way out.
	const [realmMismatch] = useState(
		() =>
			searchParams.get("qbo") === "error" &&
			searchParams.get("reason") === "realm_mismatch",
	);

	// Show the OAuth outcome once, then strip the params so a refresh is quiet.
	const resultHandledRef = useRef(false);
	useEffect(() => {
		if (resultHandledRef.current) return;
		const result = searchParams.get("qbo");
		if (!result) return;
		resultHandledRef.current = true;

		if (result === "connected") {
			toast.success("QuickBooks connected", "Your company is linked.");
		} else {
			const reason = searchParams.get("reason") ?? "unknown";
			toast.error(
				"QuickBooks not connected",
				ERROR_MESSAGES[reason] ?? ERROR_MESSAGES.unknown,
			);
		}
		// Strip only the OAuth params so anything else on the URL survives.
		const params = new URLSearchParams(searchParams.toString());
		params.delete("qbo");
		params.delete("reason");
		params.set("tab", "integrations");
		router.replace(`/organization/profile?${params.toString()}`);
	}, [searchParams, router, toast]);

	const needsSetup =
		connection != null &&
		connection.status === "connected" &&
		!connection.defaultServiceItemQboId;

	// Derived rather than set from an effect: the auto-open resolves as soon as
	// the connection and ownership queries land, and closes itself once setup is
	// done (needsSetup flips false) or the owner dismisses it.
	const setupDialogOpen =
		qboEnabled &&
		(setupOpen ||
			(armSetup && !setupDismissed && !ownerLoading && isOwner && needsSetup));

	// Setup finishing is the only signal the parent gets that the setup dialog
	// completed (dismiss and done both close it), so remember that setup was
	// pending: needsSetup flips true→false exactly once, on completion.
	const [sawNeedsSetup, setSawNeedsSetup] = useState(false);
	if (needsSetup && !sawNeedsSetup) setSawNeedsSetup(true);

	// Same derived-not-effect shape as the setup auto-open. `=== null` (not
	// falsy) so the loading tick can't open the wizard on a live run.
	const importDialogOpen =
		qboEnabled &&
		(importOpen ||
			(!importDismissed &&
				!ownerLoading &&
				isOwner &&
				connection?.status === "connected" &&
				!needsSetup &&
				importRun === null &&
				(armSetup || sawNeedsSetup)));

	// Full-page redirect to Intuit takes a beat — hold a visible pending state
	// until the browser actually navigates away.
	const startConnect = useCallback(() => {
		setConnecting(true);
		toast.loading("Connecting to QuickBooks…", "Taking you to Intuit to sign in");
		window.location.href = CONNECT_URL;
	}, [toast]);

	const saveSettings = useCallback(
		async (
			patch: Parameters<typeof updateSyncSettings>[0],
			successMessage: string,
		) => {
			setSaving(true);
			try {
				await updateSyncSettings(patch);
				toast.success("Sync settings updated", successMessage);
			} catch (error) {
				logError(error, { action: "quickbooks_update_sync_settings" });
				toast.error(
					"Couldn't update sync settings",
					getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
				);
			} finally {
				setSaving(false);
			}
		},
		[updateSyncSettings, toast],
	);

	const handleDisconnect = useCallback(async () => {
		const confirmed = await confirmDialog({
			title: "Disconnect QuickBooks",
			message:
				"This stops all syncing and revokes OneTool's access. Your synced records stay in QuickBooks.",
			confirmLabel: "Disconnect",
			cancelLabel: "Cancel",
			variant: "destructive",
		});
		if (!confirmed) return;

		setDisconnecting(true);
		try {
			await disconnect({});
			toast.success("QuickBooks disconnected", "Syncing has stopped.");
		} catch (error) {
			logError(error, { action: "quickbooks_disconnect" });
			toast.error(
				"Couldn't disconnect QuickBooks",
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
			);
		} finally {
			setDisconnecting(false);
		}
	}, [confirmDialog, disconnect, toast]);

	const heading = (
		<SectionHeading
			title="Integrations"
			description="Connect OneTool to the other tools your business runs on."
		/>
	);

	if (connection === undefined || organization === undefined) {
		return (
			<div className="space-y-6">
				{heading}
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{[0, 1].map((index) => (
						<SettingsCard key={index}>
							<div className="h-[100px] border-b border-border bg-muted/40" />
							<SettingsCardBody className="space-y-2 px-4 py-3">
								<Skeleton className="h-4 w-40" />
								<Skeleton className="h-4 w-full max-w-xs" />
							</SettingsCardBody>
						</SettingsCard>
					))}
				</div>
			</div>
		);
	}

	// One lever for the whole card: with the flag off nothing downstream of a
	// connection renders, whatever the connection query says.
	const isConnected =
		qboEnabled && connection !== null && connection.status !== "disconnected";
	const needsReauth = isConnected && connection.status === "needs_reauth";
	const controlsDisabled = !isOwner || saving;

	// Stripe Connect state comes straight off the org doc, kept current by webhooks.
	const stripeAccountId = organization?.stripeConnectAccountId;
	const stripeActive = Boolean(
		organization?.stripeChargesEnabled &&
		organization?.stripePayoutsEnabled &&
		organization?.stripeDetailsSubmitted,
	);

	const ownerHint = (text: string) => (
		<p className="mt-1 text-xs text-muted-foreground">{text}</p>
	);

	// A fetched run is reviewed on its own page, so those states route there
	// instead of opening the dialog. Re-running after a completed import is
	// safe (already-linked customers just re-link), so the action stays.
	const importAction = (() => {
		if (importRun === undefined) return null;

		const reviewing = importRun?.status === "reviewing";
		const committing = importRun?.status === "committing";
		const label =
			importRun === null ||
			importRun.status === "failed" ||
			importRun.status === "completed"
				? "Import customers"
				: reviewing
					? `Review import (${importRun.totalFetched})`
					: importRun.status === "awaiting_review"
						? `Review import (${importRun.ambiguous})`
						: committing
							? "View progress"
							: "Importing…";

		return (
			<Button
				variant="outline"
				size="sm"
				onClick={() =>
					reviewing || committing
						? router.push(QBO_IMPORT_REVIEW_URL)
						: setImportOpen(true)
				}
			>
				{label}
			</Button>
		);
	})();

	return (
		<div className="space-y-6">
			{heading}

			<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
				{/* QuickBooks Online */}
				<SettingsCard>
					<IntegrationConnectorBand
						brand={<QuickBooksMark className="size-7" />}
						leftIcon={FileText}
						rightIcon={Banknote}
						locked={qboEnabled && qboPlanLocked && !isConnected}
						status={
							<IntegrationStatusIcon
								tone={
									!isConnected
										? "off"
										: needsReauth || needsSetup
											? "attention"
											: "connected"
								}
								label={
									!qboEnabled
										? "QuickBooks is not available yet"
										: qboPlanLocked && !isConnected
											? "QuickBooks is part of the Business plan"
											: !isConnected
											? "QuickBooks not connected"
											: needsReauth
												? "QuickBooks needs to be reconnected"
												: needsSetup
													? "QuickBooks setup is not finished"
													: "QuickBooks connected and syncing"
								}
							/>
						}
					/>
					<IntegrationTileHeader
						name="QuickBooks Online"
						status={
							!qboEnabled ? (
								<ComingSoonBadge />
							) : qboPlanLocked && !isConnected ? (
								<BusinessPlanBadge />
							) : !isConnected ? (
								<NotConnectedBadge />
							) : (
								<>
									{(needsReauth || needsSetup) && (
										<Badge variant="warning-light" radius="full" size="sm">
											{needsReauth ? "Reconnect needed" : "Setup incomplete"}
										</Badge>
									)}
									{connection.environment === "sandbox" && (
										<Badge variant="warning-light" radius="full" size="sm">
											Sandbox
										</Badge>
									)}
								</>
							)
						}
						description={
							!qboEnabled
								? "Sync clients, invoices, and payments to QuickBooks. We're finishing certification with Intuit — this will open up soon."
								: qboPlanLocked && !isConnected
									? "Sync clients, invoices, and payments to QuickBooks. Included with the Business plan."
									: isConnected
									? (connection.companyName ?? "QuickBooks company")
									: "Sync clients, invoices, and payments to QuickBooks."
						}
						meta={
							!qboEnabled ? undefined : isConnected ? (
								<>
									<p className="mt-0.5 font-mono text-xs text-muted-foreground">
										Realm {connection.realmId}
									</p>
									{connection.incomeAccountName && (
										<p className="mt-0.5 text-xs text-muted-foreground">
											Revenue account: {connection.incomeAccountName}
										</p>
									)}
								</>
							) : !isOwner ? (
								ownerHint("Only the organization owner can connect QuickBooks.")
							) : undefined
						}
						action={
							!qboEnabled ? (
								// Kept visible but inert: the card reads as a real integration
								// that isn't open yet, rather than one that failed to load.
								<Button size="sm" disabled>
									Connect
								</Button>
							) : qboPlanLocked && !isConnected ? (
								<Button
									size="sm"
									variant="outline"
									render={<Link href="/organization/profile?tab=billing" />}
								>
									View plans
								</Button>
							) : !isConnected ? (
								<Button
									size="sm"
									onClick={startConnect}
									disabled={!isOwner || connecting}
								>
									{connecting ? "Connecting…" : "Connect"}
								</Button>
							) : undefined
						}
					/>

					{realmMismatch && (
						<div className="mx-4 mb-3 flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.05] px-3 py-2.5">
							<ShieldAlert
								className="mt-0.5 size-4 shrink-0 text-destructive"
								aria-hidden="true"
							/>
							<p className="min-w-0 flex-1 text-xs text-muted-foreground">
								{ERROR_MESSAGES.realm_mismatch}
							</p>
							{isOwner && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => setResetOpen(true)}
									className="shrink-0"
								>
									Reset &amp; connect…
								</Button>
							)}
						</div>
					)}

					{isConnected && (
						<>
							{needsReauth && (
								<div className="mx-4 mb-3 flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/[0.05] px-3 py-2.5">
									<ShieldAlert
										className="mt-0.5 size-4 shrink-0 text-warning"
										aria-hidden="true"
									/>
									<p className="min-w-0 flex-1 text-xs text-muted-foreground">
										The connection expired or was revoked from QuickBooks.
									</p>
									<Button
										size="sm"
										onClick={startConnect}
										disabled={!isOwner || connecting}
										className="shrink-0"
									>
										{connecting ? "Connecting…" : "Reconnect"}
									</Button>
								</div>
							)}

							{!needsReauth && needsSetup && (
								<div className="mx-4 mb-3 flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/[0.05] px-3 py-2.5">
									<ShieldAlert
										className="mt-0.5 size-4 shrink-0 text-warning"
										aria-hidden="true"
									/>
									<p className="min-w-0 flex-1 text-xs text-muted-foreground">
										{isOwner
											? "Finish setup to start syncing. Choose which income account QuickBooks invoices should post to."
											: "Setup is not finished yet. Only the organization owner can choose the income account QuickBooks invoices post to."}
									</p>
									<Button
										size="sm"
										onClick={() => setSetupOpen(true)}
										disabled={!isOwner}
										className="shrink-0"
									>
										Finish setup
									</Button>
								</div>
							)}

							<div className="border-t border-border px-4 py-1">
								<Item className="gap-3 px-0 py-2">
									<ItemContent className="gap-0.5">
										<ItemTitle className="text-sm">Send invoices</ItemTitle>
										<ItemDescription className="text-xs">
											When an invoice reaches QuickBooks.
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<SegmentedControl
											value={connection.syncInvoicesOn}
											disabled={controlsDisabled}
											onValueChange={(value) => {
												if (value === connection.syncInvoicesOn) return;
												void saveSettings(
													{ syncInvoicesOn: value },
													value === "sent"
														? "Invoices sync when sent."
														: "Invoices sync when created.",
												);
											}}
											options={[
												{ value: "sent", label: "Sent" },
												{ value: "created", label: "Created" },
											]}
										/>
									</ItemActions>
								</Item>

								<Item className="gap-3 px-0 py-2">
									<ItemContent className="gap-0.5">
										<ItemTitle className="text-sm">Sync payments</ItemTitle>
										<ItemDescription className="text-xs">
											Record payments on the matching invoice.
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Switch
											checked={connection.syncPayments}
											disabled={controlsDisabled}
											onCheckedChange={(checked) => {
												void saveSettings(
													{ syncPayments: Boolean(checked) },
													checked
														? "Payments will sync."
														: "Payments will not sync.",
												);
											}}
										/>
									</ItemActions>
								</Item>

								<Item className="gap-3 px-0 py-2">
									<ItemContent className="gap-0.5">
										<ItemTitle className="text-sm">
											Auto-resolve duplicate names
										</ItemTitle>
										<ItemDescription className="text-xs">
											Appends a suffix when a name already exists.
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Switch
											checked={connection.autoDisambiguateNames}
											disabled={controlsDisabled}
											onCheckedChange={(checked) => {
												void saveSettings(
													{ autoDisambiguateNames: Boolean(checked) },
													checked
														? "Duplicate names will be resolved automatically."
														: "Duplicate names will be reported instead.",
												);
											}}
										/>
									</ItemActions>
								</Item>
							</div>

							<div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
								<p className="text-xs text-muted-foreground">
									{isOwner
										? "Records already in QuickBooks stay there."
										: "Only the organization owner can change these settings."}
								</p>
								<div className="flex shrink-0 items-center gap-1">
									{isOwner && importAction}
									<Button
										variant="ghost"
										size="sm"
										onClick={handleDisconnect}
										disabled={!isOwner || disconnecting}
										className="text-destructive hover:bg-destructive/10 hover:text-destructive"
									>
										{disconnecting ? "Disconnecting…" : "Disconnect"}
									</Button>
								</div>
							</div>
						</>
					)}
				</SettingsCard>

				{/* Stripe payments */}
				<SettingsCard>
					<IntegrationConnectorBand
						brand={<StripeMark className="size-7" />}
						leftIcon={CreditCard}
						rightIcon={Landmark}
						status={
							<IntegrationStatusIcon
								tone={
									!stripeAccountId
										? "off"
										: stripeActive
											? "connected"
											: "attention"
								}
								label={
									!stripeAccountId
										? "Stripe payments not connected"
										: stripeActive
											? "Stripe charges and payouts enabled"
											: "Stripe setup is not finished"
								}
							/>
						}
					/>
					<IntegrationTileHeader
						name="Stripe payments"
						status={
							!stripeAccountId ? (
								<NotConnectedBadge />
							) : stripeActive ? null : (
								<Badge variant="warning-light" radius="full" size="sm">
									Setup incomplete
								</Badge>
							)
						}
						description={
							!stripeAccountId
								? "Accept card payments on invoices with Stripe. Payouts go to your bank account."
								: stripeActive
									? "Charges and payouts are enabled."
									: "Stripe still needs a few details before you can take payments."
						}
						meta={
							!isOwner && !stripeActive
								? ownerHint("Only the organization owner can set up payments.")
								: undefined
						}
						action={
							!stripeAccountId || !stripeActive ? (
								<Button
									size="sm"
									onClick={() => void startOnboarding()}
									disabled={!isOwner || onboardingLoading}
								>
									{onboardingLoading
										? "Connecting…"
										: stripeAccountId
											? "Finish setup"
											: "Set up payments"}
								</Button>
							) : undefined
						}
					/>

					{stripeAccountId && (
						<div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
							<p className="text-xs text-muted-foreground">
								Payouts, disputes, and account details.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => router.push(PAYMENTS_TAB_URL)}
								className="shrink-0"
							>
								Open Payments
							</Button>
						</div>
					)}
				</SettingsCard>
			</div>

			{isConnected && <QuickBooksSyncIssues />}

			<QuickBooksSetupDialog
				open={setupDialogOpen}
				onOpenChange={(open) => {
					setSetupOpen(open);
					if (!open) setSetupDismissed(true);
				}}
			/>

			<QuickBooksImportDialog
				open={importDialogOpen}
				onOpenChange={(open) => {
					setImportOpen(open);
					if (!open) setImportDismissed(true);
				}}
			/>

			<QuickBooksResetDialog open={resetOpen} onOpenChange={setResetOpen} />
		</div>
	);
}
