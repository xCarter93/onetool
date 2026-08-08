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
import { CreditCard, Landmark, ShieldAlert } from "lucide-react";

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
import { StatusBadge } from "@/components/domain/status-badge";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { useStripeOnboarding } from "../_hooks/use-stripe-onboarding";
import {
	SectionHeading,
	SettingsCard,
	SettingsCardBody,
} from "./settings-card";

const CONNECT_URL = "/api/quickbooks/connect";
const TAB_URL = "/organization/profile?tab=integrations";
const PAYMENTS_TAB_URL = "/organization/profile?tab=payments";

const ERROR_MESSAGES: Record<string, string> = {
	denied: "Connection was cancelled in QuickBooks.",
	realm_in_use:
		"That QuickBooks company is already connected to a different organization.",
	realm_mismatch:
		"This organization is already linked to a different QuickBooks company.",
	not_owner: "Only the organization owner can connect QuickBooks.",
	not_premium: "QuickBooks sync requires the Business plan.",
	config: "QuickBooks is not configured for this environment yet.",
	state: "The connection request expired. Start again from this page.",
	missing_params: "QuickBooks did not return the details we need. Try again.",
	exchange_failed: "QuickBooks rejected the connection request. Try again.",
	unknown: "Something went wrong connecting QuickBooks. Try again.",
};

/** Compact tile header: icon + name + status inline, primary action right. */
function IntegrationTileHeader({
	icon: Icon,
	name,
	status,
	description,
	meta,
	action,
}: {
	icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
	name: string;
	status: ReactNode;
	description: ReactNode;
	meta?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<Icon
				className="mt-0.5 size-4.5 shrink-0 text-muted-foreground"
				aria-hidden={true}
			/>
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

export function IntegrationsTab() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const { organization, isOwner } = useOrgOwner();
	const { confirm: confirmDialog } = useConfirmDialog();

	const connection = useQuery(api.quickbooks.getConnectionStatus);
	const updateSyncSettings = useMutation(api.quickbooks.updateSyncSettings);
	const disconnect = useMutation(api.quickbooks.disconnect);

	const { startOnboarding, onboardingLoading } = useStripeOnboarding();

	const [saving, setSaving] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);
	const [connecting, setConnecting] = useState(false);

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
		router.replace(TAB_URL);
	}, [searchParams, router, toast]);

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

	const isConnected =
		connection !== null && connection.status !== "disconnected";
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

	return (
		<div className="space-y-6">
			{heading}

			<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
				{/* QuickBooks Online */}
				<SettingsCard>
					<IntegrationTileHeader
						icon={Landmark}
						name="QuickBooks Online"
						status={
							!isConnected ? (
								<NotConnectedBadge />
							) : (
								<>
									{needsReauth ? (
										<Badge variant="warning-light" radius="full" size="sm">
											Needs attention
										</Badge>
									) : (
										<StatusBadge role="success" size="sm">
											Active
										</StatusBadge>
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
							isConnected
								? (connection.companyName ?? "QuickBooks company")
								: "Sync clients, invoices, and payments to QuickBooks."
						}
						meta={
							isConnected ? (
								<p className="mt-0.5 font-mono text-xs text-muted-foreground">
									Realm {connection.realmId}
								</p>
							) : !isOwner ? (
								ownerHint("Only the organization owner can connect QuickBooks.")
							) : undefined
						}
						action={
							!isConnected ? (
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
								<Button
									variant="ghost"
									size="sm"
									onClick={handleDisconnect}
									disabled={!isOwner || disconnecting}
									className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
								>
									{disconnecting ? "Disconnecting…" : "Disconnect"}
								</Button>
							</div>
						</>
					)}
				</SettingsCard>

				{/* Stripe payments */}
				<SettingsCard>
					<IntegrationTileHeader
						icon={CreditCard}
						name="Stripe payments"
						status={
							!stripeAccountId ? (
								<NotConnectedBadge />
							) : stripeActive ? (
								<StatusBadge role="success" size="sm">
									Active
								</StatusBadge>
							) : (
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
		</div>
	);
}
