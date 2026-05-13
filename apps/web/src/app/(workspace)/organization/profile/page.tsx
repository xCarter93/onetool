"use client";

import React, { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { OrganizationProfile, useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import {
	Users,
	Building2,
	AlertTriangle,
	FileText,
	Upload,
	Trash2,
	Download,
	Eye,
	Edit,
	Plus,
	Check,
	X,
	Lock,
	Loader2,
	RefreshCcw,
	ExternalLink,
	Globe,
} from "lucide-react";
import {
	ConnectPayouts,
	ConnectComponentsProvider,
} from "@stripe/react-connect-js";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Card, CardContent } from "@/components/ui/card";
import SelectService from "@/components/shared/choice-set";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger";
import { StripeConnectProvider } from "@/components/stripe/StripeConnectProvider";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

const TAB_VALUES = [
	"overview",
	"business",
	"payments",
	"documents",
	"skus",
] as const;
type TabValue = (typeof TAB_VALUES)[number];

const companySizeOptions = [
	{
		icon: Users,
		text: "1-10",
		value: "1-10",
	},
	{
		icon: Building2,
		text: "10-100",
		value: "10-100",
	},
	{
		icon: Globe,
		text: "100+",
		value: "100+",
	},
];

const primaryActionButtonClasses =
	"group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-all duration-200 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/15 ring-1 ring-primary/30 hover:ring-primary/40 shadow-sm hover:shadow-md backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:text-primary disabled:hover:bg-primary/10 disabled:hover:ring-primary/30";

type BusinessFormState = {
	email: string;
	website: string;
	phone: string;
	addressStreet: string;
	addressCity: string;
	addressState: string;
	addressZip: string;
	addressCountry: string;
	latitude: number | null;
	longitude: number | null;
	companySize: string;
	logoInvertInDarkMode: boolean;
};

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

const initialBusinessForm: BusinessFormState = {
	email: "",
	website: "",
	phone: "",
	addressStreet: "",
	addressCity: "",
	addressState: "",
	addressZip: "",
	addressCountry: "United States",
	latitude: null,
	longitude: null,
	companySize: "",
	logoInvertInDarkMode: true,
};

function parseAddress(address?: string) {
	if (!address) {
		return {
			street: "",
			city: "",
			state: "",
			zip: "",
		};
	}

	const parts = address.split(",").map((part) => part.trim());
	return {
		street: parts[0] ?? "",
		city: parts[1] ?? "",
		state: parts[2] ?? "",
		zip: parts[3] ?? "",
	};
}

const isTabValue = (value: string): value is TabValue =>
	TAB_VALUES.includes(value as TabValue);

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

export default function OrganizationProfilePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { organization: clerkOrganization } = useOrganization();
	const toast = useToast();
	const { hasPremiumAccess } = useFeatureAccess();

	const organization = useQuery(api.organizations.get, {});
	const currentUser = useQuery(api.users.current, {});
	const updateOrganization = useMutation(api.organizations.update);
	// Plan 14.2-02 — public setStripeConnectAccountId mutation removed. The
	// account-creation route now persists the accountId server-side via
	// api.organizations.setStripeConnectAccountIdInternal (called from the
	// route handler, not from the client).

	const [businessForm, setBusinessForm] =
		React.useState<BusinessFormState>(initialBusinessForm);
	const [businessDirty, setBusinessDirty] = React.useState(false);
	const [savingBusiness, setSavingBusiness] = React.useState(false);
	const [onboardingLoading, setOnboardingLoading] = React.useState(false);
	const [statusLoading, setStatusLoading] = React.useState(false);
	const [stripeStatus, setStripeStatus] =
		React.useState<StripeAccountStatus | null>(null);
	const lastOrganizationId = React.useRef<string | null>(null);
	const onboardingComplete = Boolean(
		stripeStatus?.detailsSubmitted &&
		stripeStatus?.chargesEnabled &&
		stripeStatus?.payoutsEnabled
	);

	const statusTone = React.useCallback((flag?: boolean) => {
		return flag
			? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-100"
			: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-100";
	}, []);

	// Get active tab from search params
	const tabParam = searchParams.get("tab");
	const activeTab: TabValue =
		tabParam && isTabValue(tabParam) ? tabParam : "overview";

	React.useEffect(() => {
		const currentOrgId = organization?._id ?? null;
		if (lastOrganizationId.current !== currentOrgId) {
			lastOrganizationId.current = currentOrgId;
			setBusinessDirty(false);
			setStripeStatus(null);
		}
	}, [organization?._id]);

	const handleTabChange = React.useCallback(
		(value: string) => {
			if (!isTabValue(value)) {
				return;
			}

			// Check if trying to access premium feature without premium access
			if (
				(value === "documents" || value === "skus" || value === "payments") &&
				!hasPremiumAccess
			) {
				toast.error("Premium Feature", "Upgrade to access this feature");
				return;
			}

			// Use search params for tab navigation
			const params = new URLSearchParams();
			if (value !== "overview") {
				params.set("tab", value);
			}
			const newUrl =
				params.toString() === ""
					? "/organization/profile"
					: `/organization/profile?${params.toString()}`;
			router.push(newUrl);
		},
		[router, hasPremiumAccess, toast]
	);

	React.useEffect(() => {
		if (organization === undefined) {
			return;
		}

		if (!businessDirty) {
			// Use structured fields if available, otherwise parse from legacy address
			const { street, city, state, zip } = parseAddress(organization?.address);
			setBusinessForm({
				email: organization?.email ?? "",
				website: organization?.website?.replace(/^https?:\/\//i, "") ?? "",
				phone: organization?.phone ?? "",
				addressStreet: organization?.addressStreet ?? street,
				addressCity: organization?.addressCity ?? city,
				addressState: organization?.addressState ?? state,
				addressZip: organization?.addressZip ?? zip,
				addressCountry: organization?.addressCountry ?? "United States",
				latitude: organization?.latitude ?? null,
				longitude: organization?.longitude ?? null,
				companySize: organization?.companySize ?? "",
				logoInvertInDarkMode: organization?.logoInvertInDarkMode ?? true,
			});
		}
	}, [organization, businessDirty]);

	const isLoading = organization === undefined || currentUser === undefined;
	const isOwner = Boolean(
		organization &&
		currentUser &&
		"ownerUserId" in organization &&
		organization.ownerUserId === currentUser._id
	);

	const combineAddress = React.useCallback(() => {
		const values = [
			businessForm.addressStreet.trim(),
			businessForm.addressCity.trim(),
			businessForm.addressState.trim(),
			businessForm.addressZip.trim(),
		].filter(Boolean);
		return values.length > 0 ? values.join(", ") : undefined;
	}, [
		businessForm.addressStreet,
		businessForm.addressCity,
		businessForm.addressState,
		businessForm.addressZip,
	]);

	const validateBusinessForm = React.useCallback(() => {
		const requiredFields = [
			businessForm.email.trim(),
			businessForm.phone.trim(),
			businessForm.addressStreet.trim(),
			businessForm.addressCity.trim(),
			businessForm.addressState.trim(),
			businessForm.addressZip.trim(),
		];
		if (!requiredFields.every(Boolean)) {
			toast.warning(
				"Missing required information",
				"Email, phone, and full mailing address are required."
			);
			return false;
		}

		if (!businessForm.companySize) {
			toast.warning(
				"Select company size",
				"Choose the option that best represents your team."
			);
			return false;
		}

		return true;
	}, [businessForm, toast]);

	const handleSaveBusiness = React.useCallback(async () => {
		if (!isOwner) {
			toast.error(
				"Permission required",
				"Only the organization owner can update business details."
			);
			return;
		}

		if (!validateBusinessForm()) {
			return;
		}

		const normalizedWebsite = businessForm.website.trim()
			? `https://${businessForm.website.trim().replace(/^https?:\/\//i, "")}`
			: undefined;

		setSavingBusiness(true);

		try {
			await updateOrganization({
				email: businessForm.email.trim(),
				phone: businessForm.phone.trim(),
				website: normalizedWebsite,
				// Structured address fields
				addressStreet: businessForm.addressStreet.trim() || undefined,
				addressCity: businessForm.addressCity.trim() || undefined,
				addressState: businessForm.addressState.trim() || undefined,
				addressZip: businessForm.addressZip.trim() || undefined,
				addressCountry: businessForm.addressCountry.trim() || undefined,
				// Geocoding (from Mapbox Address Autofill)
				latitude: businessForm.latitude ?? undefined,
				longitude: businessForm.longitude ?? undefined,
				companySize: businessForm.companySize as "1-10" | "10-100" | "100+",
				logoUrl: clerkOrganization?.imageUrl ?? undefined,
				logoInvertInDarkMode: businessForm.logoInvertInDarkMode,
			});

			setBusinessDirty(false);
			toast.success(
				"Business info updated",
				"Organization details have been saved."
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to save business information.";
			toast.error("Update failed", message);
		} finally {
			setSavingBusiness(false);
		}
	}, [
		businessForm,
		clerkOrganization?.imageUrl,
		isOwner,
		toast,
		updateOrganization,
		validateBusinessForm,
	]);

	const handleStartStripeOnboarding = React.useCallback(async () => {
		if (!isOwner) {
			toast.error(
				"Permission required",
				"Only the organization owner can manage payments."
			);
			return;
		}

		setOnboardingLoading(true);

		try {
			// Plan 14.2-02 lockdown: no account-identifying fields are sent in
			// the request body. The route derives everything from the Clerk
			// session and persists the new account ID server-side via the
			// lockdown mutation.
			const accountResponse = await fetch("/api/stripe-connect/account", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const accountData = await accountResponse.json();
			if (!accountResponse.ok) {
				throw new Error(
					accountData?.error ??
						"Stripe could not create or retrieve the connected account."
				);
			}

			const accountId: string | undefined = accountData?.accountId;
			if (!accountId) {
				throw new Error("Stripe did not return an account ID.");
			}

			// Generate an onboarding link and redirect the user. The route
			// also derives the account ID from the Clerk session — request
			// payload is empty.
			const linkResponse = await fetch("/api/stripe-connect/account-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const linkData = await linkResponse.json();
			if (!linkResponse.ok) {
				throw new Error(
					linkData?.error ??
						"Stripe could not generate an onboarding link. Try again."
				);
			}

			if (!linkData?.url) {
				throw new Error("Stripe did not return an onboarding URL.");
			}

			// Capture a snapshot of the (now reduced) response shape. The
			// route no longer leaks the full Stripe.Account object — the
			// booleans land on the top-level body (audit #9 / FINDINGS T-14.2-05).
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
					"Unable to start Stripe onboarding right now."
			);
		} finally {
			setOnboardingLoading(false);
		}
	}, [isOwner, toast]);

	const refreshStripeAccountStatus = React.useCallback(async () => {
		if (!organization?.stripeConnectAccountId) {
			toast.warning(
				"No Stripe account yet",
				"Create an account first to check status."
			);
			return;
		}

		setStatusLoading(true);
		try {
			// Plan 14.2-02 lockdown: body is empty — the route derives the
			// account ID from the Clerk session, never from the request body.
			const statusResponse = await fetch("/api/stripe-connect/status", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			const statusData = await statusResponse.json();
			if (!statusResponse.ok) {
				throw new Error(
					statusData?.error ??
						"Stripe could not provide the latest onboarding status."
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
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment."
			);
		} finally {
			setStatusLoading(false);
		}
	}, [organization?.stripeConnectAccountId, toast]);

	React.useEffect(() => {
		if (
			activeTab === "payments" &&
			organization?.stripeConnectAccountId &&
			!stripeStatus &&
			!statusLoading
		) {
			void refreshStripeAccountStatus();
		}
	}, [
		activeTab,
		organization?.stripeConnectAccountId,
		refreshStripeAccountStatus,
		statusLoading,
		stripeStatus,
	]);

	// Plan 14.2-02 audit #11 — `?refresh=1` recovery flow. Stripe redirects
	// to /organization/profile?tab=payments&refresh=1 when an onboarding
	// link expires; the user expects another link to be minted automatically.
	const refreshTriggeredRef = React.useRef(false);
	React.useEffect(() => {
		if (refreshTriggeredRef.current) return;
		if (
			activeTab === "payments" &&
			searchParams.get("refresh") === "1" &&
			isOwner &&
			!onboardingLoading
		) {
			refreshTriggeredRef.current = true;
			void handleStartStripeOnboarding();
		}
	}, [
		activeTab,
		searchParams,
		isOwner,
		onboardingLoading,
		handleStartStripeOnboarding,
	]);

	if (isLoading) {
		return (
			<div className="min-h-screen flex-1 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
					<h2 className="text-xl font-semibold text-foreground mb-2">
						Loading organization settings...
					</h2>
					<p className="text-muted-foreground">
						Please wait while we fetch your organization data.
					</p>
				</div>
			</div>
		);
	}

	if (!organization) {
		return (
			<div className="min-h-screen flex-1 flex items-center justify-center">
				<div className="text-center space-y-4 max-w-md">
					<AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto" />
					<h2 className="text-2xl font-semibold text-foreground">
						No active organization
					</h2>
					<p className="text-muted-foreground">
						Switch to an organization from the sidebar to manage settings, or
						create a new one.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="relative p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col">
			<div className="flex-1 flex flex-col py-8">
				<div className="mb-10">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-2 h-8 bg-linear-to-b from-primary to-primary/60 rounded-full" />
						<h1 className="text-3xl font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent tracking-tight">
							Organization Settings
						</h1>
					</div>
					<p className="text-muted-foreground ml-5 leading-relaxed max-w-2xl">
						Manage the active organization&apos;s profile, team, and operational
						preferences from one cohesive workspace.
					</p>
				</div>

				<Tabs
					value={activeTab}
					onValueChange={handleTabChange}
					className="flex-1"
				>
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="business">Business Info</TabsTrigger>
						<TabsTrigger
							value="payments"
							disabled={!hasPremiumAccess}
							className={!hasPremiumAccess ? "cursor-not-allowed" : ""}
						>
							{!hasPremiumAccess && <Lock className="h-3 w-3 mr-1" />}
							Payments
						</TabsTrigger>
						<TabsTrigger
							value="documents"
							disabled={!hasPremiumAccess}
							className={!hasPremiumAccess ? "cursor-not-allowed" : ""}
						>
							{!hasPremiumAccess && <Lock className="h-3 w-3 mr-1" />}
							Documents
						</TabsTrigger>
						<TabsTrigger
							value="skus"
							disabled={!hasPremiumAccess}
							className={!hasPremiumAccess ? "cursor-not-allowed" : ""}
						>
							{!hasPremiumAccess && <Lock className="h-3 w-3 mr-1" />}
							SKUs
						</TabsTrigger>
					</TabsList>

					<div className="mt-8 space-y-8">
						<TabsContent value="overview">
							<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-2xl p-8 shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
								<OrganizationProfile
									routing="hash"
									appearance={{
										elements: {
											cardBox: "w-full",
											rootBox: "w-full text-foreground",
											card: "w-full !shadow-none !bg-transparent !border-none !p-0",
											headerTitle:
												"text-2xl font-bold !text-foreground dark:!text-foreground mb-2 tracking-tight",
											headerSubtitle:
												"text-sm !text-muted-foreground dark:!text-muted-foreground mb-6 leading-relaxed",
											navbar:
												"border-b !border-border/60 dark:!border-border/40 !bg-transparent w-full",
											navbarButton:
												"px-4 py-2 !text-muted-foreground dark:!text-muted-foreground hover:!text-foreground dark:hover:!text-foreground hover:!bg-muted/40 dark:hover:!bg-muted/20 rounded-lg transition-all duration-200 font-medium",
											navbarButtonActive:
												"!bg-primary/10 dark:!bg-primary/20 !text-primary dark:!text-primary px-4 py-2 rounded-lg font-medium !shadow-none ring-1 !ring-primary/20",
											navbarButtonText:
												"!text-foreground dark:!text-foreground text-lg",
											tabButton: "text-lg",
											profileSectionTitleText:
												"text-lg font-bold !text-foreground dark:!text-foreground mb-2 tracking-tight",
											profileSectionDescriptionText:
												"text-sm !text-muted-foreground dark:!text-muted-foreground mb-6 leading-relaxed",
											profileSectionContent: "space-y-6 text-lg",
											profileSectionContentItem: "flex items-center gap-3",
											profileSectionContentItemLabel:
												"text-sm font-semibold !text-foreground tracking-wide",
											profileSectionContentItemValue:
												"text-sm !text-muted-foreground dark:!text-muted-foreground",
											profileSectionPrimaryButton: "text-lg",
											profileSectionPrimaryButtonText: "text-lg",
											paymentMethodRowType: "text-lg",
											paymentMethodRowValue: "text-lg",
											paymentMethodRowBadge: "text-lg",
											profileSectionContentItemValueInput:
												"w-full !bg-background/95 dark:!bg-card/60 border !border-border dark:!border-border/60 focus:!border-primary focus:!ring-2 focus:!ring-primary/20 rounded-lg px-3 py-2.5 !text-foreground dark:!text-foreground placeholder:!text-muted-foreground dark:!placeholder:text-muted-foreground transition-all duration-200 shadow-sm dark:!shadow-none",
											profileSectionContentItemValueInputShowPasswordButton:
												"!text-muted-foreground hover:!text-foreground dark:!text-muted-foreground dark:hover:!text-foreground",
											pageScrollBox: "!bg-transparent",
											page: "space-y-8 !bg-transparent",
											form: "space-y-6",
											formFieldLabel:
												"text-sm font-semibold !text-foreground tracking-wide",
											formFieldInput:
												"w-full !bg-background/95 dark:!bg-card/60 border !border-border dark:!border-border/60 focus:!border-primary focus:!ring-2 focus:!ring-primary/20 rounded-lg px-3 py-2.5 !text-foreground dark:!text-foreground placeholder:!text-muted-foreground dark:!placeholder:text-muted-foreground transition-all duration-200 shadow-sm dark:!shadow-none",
											formFieldInputShowPasswordButton:
												"!text-muted-foreground hover:!text-foreground dark:!text-muted-foreground dark:hover:!text-foreground",
											formButtonPrimary:
												"bg-linear-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary !text-primary-foreground font-medium py-2.5 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 border-0",
											formButtonSecondary:
												"!bg-muted/80 hover:!bg-muted/70 dark:!bg-muted/40 dark:hover:!bg-muted/30 !text-muted-foreground hover:!text-foreground dark:!text-muted-foreground dark:hover:!text-foreground font-medium py-2.5 px-6 rounded-lg border !border-border/60 dark:!border-border/40 transition-all duration-200",
											table: "w-full border-collapse",
											tableHead:
												"border-b !border-border dark:!border-border !bg-muted/30 dark:!bg-muted/20",
											tableHeadRow:
												"border-b !border-border dark:!border-border",
											tableHeadCell:
												"text-left p-4 font-semibold !text-foreground dark:!text-foreground text-lg",
											tableBody:
												"divide-y !divide-border dark:!divide-border/60",
											tableBodyCell: "text-lg",
											tableRow:
												"hover:!bg-muted/30 dark:hover:!bg-muted/20 transition-colors",
											tableCell:
												"p-4 text-sm !text-foreground dark:!text-foreground",
											badge:
												"inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
											badgeSecondary:
												"!bg-muted dark:!bg-muted/40 !text-muted-foreground dark:!text-muted-foreground",
											badgePrimary: "!bg-primary !text-primary-foreground",
											membersPageInviteButton:
												"bg-linear-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary !text-primary-foreground font-medium py-2.5 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 border-0",
											avatarBox:
												"w-10 h-10 rounded-lg !bg-muted dark:!bg-muted/40 flex items-center justify-center",
											avatarImage: "w-10 h-10 rounded-lg object-cover",
											footer:
												"mt-8 pt-6 border-t !border-border dark:!border-border/60",
											footerActionText:
												"text-xs !text-muted-foreground dark:!text-muted-foreground",
											footerActionLink:
												"!text-primary hover:!text-primary/80 dark:!text-primary dark:hover:!text-primary/80 font-medium text-xs",
											spinner: "!text-primary dark:!text-primary",
											modalContent:
												"!bg-card dark:!bg-card border !border-border/60 dark:!border-border/40 shadow-xl dark:!shadow-xl rounded-xl",
											modalCloseButton:
												"!text-muted-foreground hover:!text-foreground dark:!text-muted-foreground dark:hover:!text-foreground",
											selectOptionsContainer:
												"!bg-background border !border-border/60 dark:!border-border/40 rounded-lg p-2",
										},
										variables: {
											colorPrimary: "hsl(var(--primary))",
											colorText: "hsl(var(--foreground))",
											colorTextSecondary: "hsl(var(--muted-foreground))",
											colorNeutral: "hsl(var(--muted-foreground))",
											colorBackground: "transparent",
											colorInputBackground: "hsl(var(--background))",
											colorInputText: "hsl(var(--foreground))",
											fontFamily: "inherit",
											borderRadius: "0.75rem",
											spacingUnit: "1rem",
										},
									}}
									afterLeaveOrganizationUrl="/organization/complete"
								/>
							</div>
						</TabsContent>

						<TabsContent value="business">
							<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-2xl p-8 shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50 space-y-8">
								{!isOwner && (
									<div className="border border-border/60 dark:border-border/40 rounded-xl p-4 flex items-start gap-3 bg-muted/40 text-muted-foreground">
										<AlertTriangle className="w-5 h-5 mt-0.5" />
										<div>
											<p className="font-medium text-foreground">View only</p>
											<p className="text-sm">
												Only the organization owner can update business details.
											</p>
										</div>
									</div>
								)}

								<div>
									<div className="flex items-center gap-3 mb-3">
										<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
										<h2 className="text-2xl font-semibold text-foreground tracking-tight">
											Business Information
										</h2>
									</div>
									<p className="text-muted-foreground ml-5 leading-relaxed">
										Keep your public-facing business details up to date for
										clients and documents.
									</p>
								</div>

								<div className="space-y-6">
									<div className="grid gap-6 md:grid-cols-2">
										<div className="md:col-span-2">
											<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
												Business Email
											</label>
											<Input
												value={businessForm.email}
												onChange={(event) => {
													setBusinessDirty(true);
													setBusinessForm((prev) => ({
														...prev,
														email: event.target.value,
													}));
												}}
												disabled={!isOwner || savingBusiness}
												className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
												placeholder="your.business@company.com"
												type="email"
											/>
										</div>

										<div>
											<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
												Company Website
											</label>
											<div className="mt-2 flex">
												<span className="flex shrink-0 items-center rounded-l-md border border-border bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
													https://
												</span>
												<Input
													value={businessForm.website}
													onChange={(event) => {
														setBusinessDirty(true);
														const nextValue = event.target.value.replace(
															/^https?:\/\//i,
															""
														);
														setBusinessForm((prev) => ({
															...prev,
															website: nextValue,
														}));
													}}
													disabled={!isOwner || savingBusiness}
													className="w-full rounded-l-none border border-l-0 border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
													placeholder="www.yourcompany.com"
													type="text"
												/>
											</div>
										</div>

										<div>
											<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
												Phone Number
											</label>
											<Input
												value={businessForm.phone}
												onChange={(event) => {
													setBusinessDirty(true);
													setBusinessForm((prev) => ({
														...prev,
														phone: event.target.value,
													}));
												}}
												disabled={!isOwner || savingBusiness}
												className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
												placeholder="+1 (555) 123-4567"
												type="tel"
											/>
										</div>
									</div>

									<div>
										<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
											Business Address
										</label>
										<div className="grid gap-4 sm:grid-cols-2">
											<div className="sm:col-span-2">
												<AddressAutocomplete
													value={businessForm.addressStreet}
													onChange={(value) => {
														setBusinessDirty(true);
														setBusinessForm((prev) => ({
															...prev,
															addressStreet: value,
														}));
													}}
													onAddressSelect={(address: AddressData) => {
														setBusinessDirty(true);
														setBusinessForm((prev) => ({
															...prev,
															addressStreet: address.streetAddress,
															addressCity: address.city,
															addressState: address.state,
															addressZip: address.zipCode,
															addressCountry: address.country,
															latitude: address.latitude,
															longitude: address.longitude,
														}));
													}}
													disabled={!isOwner || savingBusiness}
													className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
													placeholder="Start typing your business address..."
												/>
											</div>
											<div>
												<Input
													value={businessForm.addressCity}
													onChange={(event) => {
														setBusinessDirty(true);
														setBusinessForm((prev) => ({
															...prev,
															addressCity: event.target.value,
														}));
													}}
													disabled={!isOwner || savingBusiness}
													className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
													placeholder="City"
												/>
											</div>
											<div className="grid grid-cols-2 gap-4">
												<Input
													value={businessForm.addressState}
													onChange={(event) => {
														setBusinessDirty(true);
														setBusinessForm((prev) => ({
															...prev,
															addressState: event.target.value,
														}));
													}}
													disabled={!isOwner || savingBusiness}
													className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
													placeholder="State"
												/>
												<Input
													value={businessForm.addressZip}
													onChange={(event) => {
														setBusinessDirty(true);
														setBusinessForm((prev) => ({
															...prev,
															addressZip: event.target.value,
														}));
													}}
													disabled={!isOwner || savingBusiness}
													className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
													placeholder="ZIP"
												/>
											</div>
										</div>
									</div>

									<div>
										<label className="block text-sm font-semibold text-foreground mb-6 tracking-wide">
											How many people work at your company? *
										</label>
										<SelectService
											options={companySizeOptions}
											selected={businessForm.companySize}
											onChange={(value) => {
												if (!isOwner || savingBusiness) {
													return;
												}
												setBusinessDirty(true);
												setBusinessForm((prev) => ({
													...prev,
													companySize: value,
												}));
											}}
										/>
									</div>

									<div>
										<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
											Logo Display Preferences
										</label>
										<div className="space-y-4 border border-border dark:border-border/80 rounded-xl p-5">
											<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
												<div>
													<p className="text-sm font-medium text-foreground">
														Invert logo colors in dark mode
													</p>
													<p className="text-xs text-muted-foreground">
														Enable this if your logo is dark so it stays visible
														on dark backgrounds.
													</p>
												</div>
												<div className="flex items-center gap-3">
													<Checkbox
														checked={businessForm.logoInvertInDarkMode}
														onCheckedChange={(checked) => {
															if (!isOwner || savingBusiness) {
																return;
															}
															setBusinessDirty(true);
															setBusinessForm((prev) => ({
																...prev,
																logoInvertInDarkMode: Boolean(checked),
															}));
														}}
														className="size-5"
														disabled={!isOwner || savingBusiness}
													/>
													<span className="text-sm text-muted-foreground">
														{businessForm.logoInvertInDarkMode
															? "Enabled"
															: "Disabled"}
													</span>
												</div>
											</div>

											<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
												<div className="border border-border/60 dark:border-border/40 rounded-lg p-4 flex flex-col items-center gap-3 bg-white">
													<span className="text-xs uppercase tracking-wide text-muted-foreground">
														Light Mode Preview
													</span>
													<div className="h-16 w-16 rounded-lg border border-border flex items-center justify-center bg-white">
														{clerkOrganization?.imageUrl ? (
															<Image
																src={clerkOrganization.imageUrl}
																alt="Logo preview light"
																width={64}
																height={64}
																className="max-h-12 max-w-full object-contain"
															/>
														) : (
															<span className="text-xs text-muted-foreground">
																No logo
															</span>
														)}
													</div>
												</div>
												<div className="border border-border/60 dark:border-border/40 rounded-lg p-4 flex flex-col items-center gap-3 bg-zinc-900">
													<span className="text-xs uppercase tracking-wide text-muted-foreground">
														Dark Mode Preview
													</span>
													<div className="h-16 w-16 rounded-lg border border-border/40 flex items-center justify-center bg-zinc-900">
														{clerkOrganization?.imageUrl ? (
															<Image
																src={clerkOrganization.imageUrl}
																alt="Logo preview dark"
																width={64}
																height={64}
																className={`max-h-12 max-w-full object-contain transition-all duration-200 ${
																	businessForm.logoInvertInDarkMode
																		? "invert brightness-0"
																		: ""
																}`}
															/>
														) : (
															<span className="text-xs text-muted-foreground">
																No logo
															</span>
														)}
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>

								<div className="flex justify-end pt-4">
									<button
										type="button"
										onClick={handleSaveBusiness}
										disabled={!isOwner || savingBusiness}
										className={primaryActionButtonClasses}
									>
										{savingBusiness ? "Saving..." : "Save Changes"}
									</button>
								</div>
							</div>
						</TabsContent>

						<TabsContent value="payments">
							<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-2xl p-8 shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50 space-y-6">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div className="space-y-2">
										<div className="flex items-center gap-3">
											<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
											<h2 className="text-2xl font-semibold text-foreground tracking-tight">
												Payments (Stripe Connect)
											</h2>
										</div>
										<p className="text-muted-foreground ml-5 leading-relaxed">
											Onboard to Stripe to accept payments on behalf of your
											organization. Status is fetched live from Stripe each time
											you refresh this tab.
										</p>
									</div>

									{organization?.stripeConnectAccountId && (
										<div className="flex flex-wrap gap-3 justify-end">
											<Button
												intent="outline"
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
												size="md"
												intent="secondary"
											/>
										</div>
									)}
								</div>

								{!organization?.stripeConnectAccountId ? (
									<div className="rounded-xl border border-border/60 dark:border-border/50 bg-muted/20 dark:bg-muted/10 p-6 space-y-4">
										<p className="text-sm text-foreground leading-relaxed">
											Start by creating a connected account. You&apos;ll be
											redirected to Stripe&apos;s hosted onboarding to provide
											verification details. Fees are paid by the connected
											account; disputes are handled by Stripe.
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
											Note: The account ID will be stored on this organization
											so future visits reuse the same Stripe account.
										</p>
									</div>
								) : (
									<div className="space-y-4">
										<div className="rounded-xl border border-border/60 dark:border-border/40 p-5 bg-background/60 dark:bg-card/70">
											<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
												<div className="space-y-1">
													<p className="text-xs uppercase tracking-wide text-muted-foreground">
														Connected Account
													</p>
													<p className="font-mono text-sm text-foreground break-all">
														{organization.stripeConnectAccountId}
													</p>
												</div>
											</div>

											<div className="grid gap-3 sm:grid-cols-3 mt-4">
												<div
													className={`rounded-lg border p-3 ${statusTone(
														stripeStatus?.detailsSubmitted
													)}`}
												>
													<p className="text-xs text-muted-foreground uppercase tracking-wide">
														Details submitted
													</p>
													<p className="text-sm font-semibold text-foreground">
														{stripeStatus?.detailsSubmitted ? "Yes" : "Pending"}
													</p>
												</div>
												<div
													className={`rounded-lg border p-3 ${statusTone(
														stripeStatus?.chargesEnabled
													)}`}
												>
													<p className="text-xs text-muted-foreground uppercase tracking-wide">
														Charges enabled
													</p>
													<p className="text-sm font-semibold text-foreground">
														{stripeStatus?.chargesEnabled ? "Yes" : "No"}
													</p>
												</div>
												<div
													className={`rounded-lg border p-3 ${statusTone(
														stripeStatus?.payoutsEnabled
													)}`}
												>
													<p className="text-xs text-muted-foreground uppercase tracking-wide">
														Payouts enabled
													</p>
													<p className="text-sm font-semibold text-foreground">
														{stripeStatus?.payoutsEnabled ? "Yes" : "No"}
													</p>
												</div>
											</div>

											<div className="mt-4 space-y-2">
												<p className="text-sm font-medium text-foreground">
													Requirements
												</p>
												{stripeStatus?.requirements?.currently_due?.length ? (
													<ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
														{stripeStatus.requirements.currently_due.map(
															(item) => (
																<li key={item}>{item}</li>
															)
														)}
													</ul>
												) : (
													<p className="text-sm text-muted-foreground">
														No outstanding requirements reported.
													</p>
												)}
												<p className="text-xs text-muted-foreground flex items-center gap-2">
													<AlertTriangle className="h-4 w-4" />
													Status is always fetched directly from Stripe; reload
													if you make changes in the dashboard.
												</p>
											</div>
										</div>

										{/* Stripe Connect Payouts Component */}
										{onboardingComplete && isOwner && (
											<div className="rounded-xl border border-border/60 dark:border-border/40 p-5 bg-background/60 dark:bg-card/70">
												<div className="mb-4">
													<h3 className="text-lg font-semibold text-foreground">
														Payouts
													</h3>
													<p className="text-sm text-muted-foreground">
														Manage your payout schedule, view payout history,
														and perform instant or manual payouts.
													</p>
												</div>
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
											</div>
										)}

										<div className="flex flex-wrap gap-3">
											<Button
												intent="outline"
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
												size="md"
												intent="secondary"
											/>
										</div>
									</div>
								)}
							</div>
						</TabsContent>

						<TabsContent value="documents">
							<DocumentsTab />
						</TabsContent>

						<TabsContent value="skus">
							<SKUsTab />
						</TabsContent>
					</div>
				</Tabs>
			</div>
		</div>
	);
}

// Documents Tab Component
function DocumentsTab() {
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const [isUploading, setIsUploading] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const documents = useQuery(api.organizationDocuments.list);
	const generateUploadUrl = useMutation(
		api.organizationDocuments.generateUploadUrl
	);
	const createDocument = useMutation(api.organizationDocuments.create);
	const removeDocument = useMutation(api.organizationDocuments.remove);

	const handleFileUpload = async (file: File) => {
		if (file.type !== "application/pdf") {
			toast.error("Invalid file type", "Please upload a PDF file");
			return;
		}

		const maxSize = 10 * 1024 * 1024; // 10MB
		if (file.size > maxSize) {
			toast.error("File too large", "Maximum file size is 10MB");
			return;
		}

		setIsUploading(true);
		try {
			const uploadUrl = await generateUploadUrl({});

			const res = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": "application/pdf" },
				body: file,
			});

			if (!res.ok) throw new Error("Failed to upload");

			const { storageId } = await res.json();

			await createDocument({
				name: file.name.replace(".pdf", ""),
				storageId,
				fileSize: file.size,
			});

			toast.success("Document uploaded", "Your document is ready");

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		} catch (error) {
			// Log error securely to error reporting service
			logError(error, {
				action: "upload_organization_document",
				metadata: { fileName: file.name, fileSize: file.size },
			});

			// Show user-friendly error message
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Upload failed", userMessage);
		} finally {
			setIsUploading(false);
		}
	};

	const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		await handleFileUpload(file);
	};

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragging(false);

		const file = e.dataTransfer.files?.[0];
		if (!file) return;
		await handleFileUpload(file);
	};

	const handleClick = () => {
		if (isUploading) return;
		fileInputRef.current?.click();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (isUploading) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			fileInputRef.current?.click();
		}
	};

	const handleDelete = async (id: Id<"organizationDocuments">) => {
		// Open accessible confirmation modal
		const confirmed = await confirmDialog({
			title: "Delete Document",
			message:
				"This action cannot be undone. This will permanently delete the document and remove all associated data.",
			confirmLabel: "Delete Document",
			cancelLabel: "Cancel",
			variant: "destructive",
		});

		// User cancelled - exit early
		if (!confirmed) return;

		try {
			await removeDocument({ id });
			toast.success("Document deleted", "The document has been removed");
		} catch (error) {
			// Log error securely to error reporting service
			logError(error, {
				action: "delete_organization_document",
				metadata: { documentId: id },
			});

			// Show generic user-friendly error message
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Delete failed", userMessage);
		}
	};

	return (
		<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-2xl p-8 shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50 space-y-8">
			<div>
				<div className="flex items-center gap-3 mb-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<h2 className="text-2xl font-semibold text-foreground tracking-tight">
						Organization Documents
					</h2>
				</div>
				<p className="text-muted-foreground ml-5 leading-relaxed">
					Upload custom documents that can be appended to quotes and invoices.
				</p>
			</div>

			{/* Compact Upload Section */}
			<div
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				tabIndex={isUploading ? -1 : 0}
				role="button"
				aria-disabled={isUploading}
				className={`
				relative flex items-center gap-4 max-w-2xl
				px-6 py-4
				border-2 border-dashed rounded-xl
				cursor-pointer
				transition-all duration-200 ease-in-out
				focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
				${
					isDragging
						? "border-primary bg-primary/5 dark:bg-primary/10 scale-[1.02]"
						: "border-border dark:border-border bg-muted/30 dark:bg-muted/20 hover:bg-muted/50 dark:hover:bg-muted/30 hover:border-primary/50"
				}
				${isUploading ? "opacity-50 cursor-not-allowed" : ""}
			`}
			>
				<input
					ref={fileInputRef}
					type="file"
					accept="application/pdf"
					onChange={handleUpload}
					disabled={isUploading}
					className="hidden"
				/>

				<div
					className={`
						flex items-center justify-center w-12 h-12 rounded-lg shrink-0
						transition-colors duration-200
						${isDragging ? "bg-primary/20 dark:bg-primary/30" : "bg-muted dark:bg-muted/60"}
					`}
				>
					<Upload
						className={`
							w-6 h-6 transition-colors duration-200
							${isDragging ? "text-primary" : "text-muted-foreground"}
						`}
					/>
				</div>

				<div className="flex-1 min-w-0">
					{isUploading ? (
						<div className="flex items-center gap-2">
							<span className="inline-block w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
							<span className="font-medium text-foreground">
								Uploading document...
							</span>
						</div>
					) : (
						<>
							<p className="font-medium text-foreground">
								<span className="text-primary hover:underline">
									Click to upload
								</span>{" "}
								or drag and drop
							</p>
							<p className="text-sm text-muted-foreground">
								PDF files only (max 10MB)
							</p>
						</>
					)}
				</div>

				{isDragging && (
					<div className="absolute inset-0 bg-primary/5 dark:bg-primary/10 rounded-xl pointer-events-none" />
				)}
			</div>

			{/* Documents Grid */}
			{documents === undefined ? (
				<div className="text-center py-12">
					<div className="animate-pulse space-y-4">
						<div className="h-8 bg-muted rounded w-1/3 mx-auto"></div>
						<div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
					</div>
				</div>
			) : documents.length === 0 ? (
				<div className="text-center py-12 px-4 border-2 border-dashed border-border dark:border-border/60 rounded-xl bg-muted/20">
					<FileText className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
					<p className="text-foreground font-medium mb-1">
						No documents uploaded yet
					</p>
					<p className="text-sm text-muted-foreground">
						Upload your first document to get started
					</p>
				</div>
			) : (
				<div>
					<div className="flex items-center justify-between mb-4">
						<p className="text-sm text-muted-foreground">
							{documents.length} document{documents.length !== 1 ? "s" : ""}{" "}
							uploaded
						</p>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
						{documents.map((doc: DocumentCardProps["document"]) => (
							<DocumentCard
								key={doc._id}
								document={doc}
								onDelete={() => handleDelete(doc._id)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Document Card Component
interface DocumentCardProps {
	document: {
		_id: Id<"organizationDocuments">;
		name: string;
		description?: string;
		uploadedAt: number;
		fileSize?: number;
	};
	onDelete: () => void;
}

function DocumentCard({ document, onDelete }: DocumentCardProps) {
	const documentUrl = useQuery(api.organizationDocuments.getDocumentUrl, {
		id: document._id,
	});

	const formatFileSize = (bytes?: number) => {
		if (!bytes) return "";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<Card className="group bg-card dark:bg-card/80 backdrop-blur-sm border border-border dark:border-border/60 hover:border-primary/50 shadow-sm hover:shadow-md dark:shadow-black/20 ring-1 ring-border/20 dark:ring-border/30 transition-all duration-200">
			<CardContent className="p-4">
				<div className="flex items-start gap-3 mb-3">
					<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0 group-hover:bg-primary/15 dark:group-hover:bg-primary/25 transition-colors">
						<FileText className="h-5 w-5 text-primary" />
					</div>
					<div className="flex-1 min-w-0">
						<h3 className="font-semibold text-sm truncate text-foreground mb-1">
							{document.name}
						</h3>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span>{new Date(document.uploadedAt).toLocaleDateString()}</span>
							{document.fileSize && (
								<>
									<span>•</span>
									<span>{formatFileSize(document.fileSize)}</span>
								</>
							)}
						</div>
					</div>
				</div>

				{document.description && (
					<p className="text-xs text-muted-foreground mb-3 line-clamp-2">
						{document.description}
					</p>
				)}

				<div className="flex gap-1.5 pt-2 border-t border-border/50">
					{documentUrl && (
						<>
							<a
								href={documentUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="flex-1"
							>
								<Button
									intent="outline"
									size="sm"
									className="w-full h-8 text-xs hover:bg-primary/10 hover:text-primary hover:border-primary/50"
								>
									<Eye className="h-3 w-3 mr-1.5" />
									View
								</Button>
							</a>
							<a href={documentUrl} download={`${document.name}.pdf`}>
								<Button
									intent="outline"
									size="sm"
									className="h-8 px-2 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
								>
									<Download className="h-3 w-3" />
								</Button>
							</a>
						</>
					)}
					<Button
						intent="outline"
						size="sm"
						onClick={onDelete}
						className="h-8 px-2 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-900"
					>
						<Trash2 className="h-3 w-3" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// SKU Type - will be generated after Convex schema update
type SKUDoc = {
	_id: Id<"skus">;
	_creationTime: number;
	orgId: Id<"organizations">;
	name: string;
	unit: string;
	rate: number;
	cost?: number;
	isActive: boolean;
	createdAt: number;
	updatedAt: number;
};

// SKUs Tab Component
function SKUsTab() {
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [editingSKU, setEditingSKU] = useState<Id<"skus"> | null>(null);
	const [skuForm, setSKUForm] = useState({
		name: "",
		unit: "",
		rate: "",
		cost: "",
	});

	const skus = useQuery(api.skus.listAll);
	const createSKU = useMutation(api.skus.create);
	const updateSKU = useMutation(api.skus.update);
	const removeSKU = useMutation(api.skus.remove);

	const resetForm = () => {
		setSKUForm({
			name: "",
			unit: "",
			rate: "",
			cost: "",
		});
		setEditingSKU(null);
	};

	const closeForm = () => {
		resetForm();
		setIsEditing(false);
		setIsSaving(false);
	};

	const handleCreate = () => {
		resetForm();
		setIsEditing(true);
	};

	const handleEdit = (sku: SKUDoc) => {
		if (!sku) return;
		setSKUForm({
			name: sku.name,
			unit: sku.unit,
			rate: sku.rate.toString(),
			cost: sku.cost !== undefined ? sku.cost.toString() : "",
		});
		setEditingSKU(sku._id);
		setIsEditing(true);
	};

	const handleSave = async () => {
		// Prevent duplicate submissions
		if (isSaving) return;

		if (!skuForm.name.trim()) {
			toast.warning("Name required", "Please enter a SKU name");
			return;
		}

		if (!skuForm.unit.trim()) {
			toast.warning("Unit required", "Please enter a unit");
			return;
		}

		const rate = parseFloat(skuForm.rate);
		if (isNaN(rate) || rate < 0) {
			toast.warning("Invalid rate", "Please enter a valid rate");
			return;
		}

		const cost = skuForm.cost.trim() ? parseFloat(skuForm.cost) : undefined;
		if (cost !== undefined && (isNaN(cost) || cost < 0)) {
			toast.warning("Invalid cost", "Please enter a valid cost");
			return;
		}

		try {
			setIsSaving(true);
			if (editingSKU) {
				await updateSKU({
					id: editingSKU,
					name: skuForm.name.trim(),
					unit: skuForm.unit.trim(),
					rate,
					cost,
				});
				toast.success("SKU updated", "SKU has been successfully updated");
			} else {
				await createSKU({
					name: skuForm.name.trim(),
					unit: skuForm.unit.trim(),
					rate,
					cost,
				});
				toast.success("SKU created", "SKU has been successfully created");
			}
			closeForm();
		} catch (error) {
			logError(error, {
				action: editingSKU ? "update_sku" : "create_sku",
				metadata: { skuForm },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error(editingSKU ? "Update failed" : "Create failed", userMessage);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (id: Id<"skus">) => {
		const confirmed = await confirmDialog({
			title: "Delete SKU",
			message:
				"Are you sure you want to delete this SKU? It will be marked as inactive and won't appear in new quotes.",
			confirmLabel: "Delete SKU",
			cancelLabel: "Cancel",
			variant: "destructive",
		});

		if (!confirmed) return;

		try {
			await removeSKU({ id });
			toast.success("SKU deleted", "The SKU has been removed");
		} catch (error) {
			logError(error, {
				action: "delete_sku",
				metadata: { skuId: id },
			});
			const userMessage = getUserFriendlyErrorMessage(error);
			toast.error("Delete failed", userMessage);
		}
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	};

	const calculateMargin = (rate: number, cost?: number) => {
		if (cost === undefined || rate === 0) return null;
		return ((rate - cost) / rate) * 100;
	};

	return (
		<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-2xl p-8 shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-2">
						<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
						<h2 className="text-2xl font-semibold text-foreground tracking-tight">
							SKUs (Stock Keeping Units)
						</h2>
					</div>
					<p className="text-muted-foreground ml-5 leading-relaxed">
						Create reusable SKUs with predefined rates and costs to quickly add
						line items to quotes.
					</p>
				</div>
				{!isEditing && skus && skus.length > 0 && (
					<Button intent="outline" size="sm" onPress={handleCreate}>
						<Plus className="h-4 w-4 mr-2" />
						Add SKU
					</Button>
				)}
			</div>

			{/* SKUs Table */}
			{skus === undefined ? (
				<div className="text-center py-12">
					<div className="animate-pulse space-y-4">
						<div className="h-8 bg-muted rounded w-1/3 mx-auto"></div>
						<div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
					</div>
				</div>
			) : skus.length === 0 && !isEditing ? (
				<div className="text-center py-16 px-4 border-2 border-dashed border-border dark:border-border/60 rounded-xl bg-muted/20">
					<Building2 className="h-16 w-16 text-muted-foreground/60 mx-auto mb-4" />
					<p className="text-lg font-semibold text-foreground mb-2">
						No SKUs created yet
					</p>
					<p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
						Create your first SKU to streamline your quote creation process with
						reusable line items.
					</p>
					<StyledButton
						intent="primary"
						size="lg"
						onClick={handleCreate}
						icon={<Plus className="h-5 w-5" />}
						label="Create Your First SKU"
					/>
				</div>
			) : (
				<div className="border border-border dark:border-border/60 rounded-xl overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="bg-muted/50 border-b border-border">
								<tr>
									<th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Name
									</th>
									<th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Unit
									</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Rate
									</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Cost
									</th>
									<th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Margin
									</th>
									<th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Status
									</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border dark:divide-border/60 bg-card">
								{/* Editing Row */}
								{isEditing && (
									<tr className="bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-l-blue-500">
										<td className="px-4 py-3">
											<Input
												value={skuForm.name}
												onChange={(e) =>
													setSKUForm((prev) => ({
														...prev,
														name: e.target.value,
													}))
												}
												placeholder="Enter SKU name..."
												className="w-full"
												autoFocus
											/>
										</td>
										<td className="px-4 py-3">
											<Input
												value={skuForm.unit}
												onChange={(e) =>
													setSKUForm((prev) => ({
														...prev,
														unit: e.target.value,
													}))
												}
												placeholder="hour, day, item"
												className="w-full"
											/>
										</td>
										<td className="px-4 py-3">
											<Input
												type="number"
												value={skuForm.rate}
												onChange={(e) =>
													setSKUForm((prev) => ({
														...prev,
														rate: e.target.value,
													}))
												}
												placeholder="0.00"
												min="0"
												step="0.01"
												className="w-full text-right"
											/>
										</td>
										<td className="px-4 py-3">
											<Input
												type="number"
												value={skuForm.cost}
												onChange={(e) =>
													setSKUForm((prev) => ({
														...prev,
														cost: e.target.value,
													}))
												}
												placeholder="0.00"
												min="0"
												step="0.01"
												className="w-full text-right"
											/>
										</td>
										<td className="px-4 py-3 text-center">
											<span className="text-xs text-muted-foreground">-</span>
										</td>
										<td className="px-4 py-3 text-center">
											<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
												{editingSKU ? "Editing" : "New"}
											</span>
										</td>
										<td className="px-4 py-3">
											<div className="flex gap-1 justify-end">
												<Button
													intent="outline"
													size="sq-sm"
													onPress={handleSave}
													isDisabled={isSaving}
													aria-label={isSaving ? "Saving..." : "Save SKU"}
													className="bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
												>
													<Check className="h-3 w-3" />
												</Button>
												<Button
													intent="outline"
													size="sq-sm"
													onPress={closeForm}
													isDisabled={isSaving}
													aria-label="Cancel"
													className="hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400"
												>
													<X className="h-3 w-3" />
												</Button>
											</div>
										</td>
									</tr>
								)}

								{/* Existing SKUs */}
								{skus.map((sku: SKUDoc) => {
									const margin = calculateMargin(sku.rate, sku.cost);
									return (
										<tr
											key={sku._id}
											className={`hover:bg-muted/30 transition-colors ${
												!sku.isActive ? "opacity-50" : ""
											}`}
										>
											<td className="px-4 py-3 text-sm font-medium text-foreground">
												{sku.name}
											</td>
											<td className="px-4 py-3 text-sm text-muted-foreground">
												{sku.unit}
											</td>
											<td className="px-4 py-3 text-sm text-right font-medium text-foreground">
												{formatCurrency(sku.rate)}
											</td>
											<td className="px-4 py-3 text-sm text-right text-muted-foreground">
												{sku.cost !== undefined
													? formatCurrency(sku.cost)
													: "-"}
											</td>
											<td className="px-4 py-3 text-sm text-center">
												{margin !== null ? (
													<span
														className={`font-medium ${
															margin >= 0
																? "text-green-600 dark:text-green-400"
																: "text-red-600 dark:text-red-400"
														}`}
													>
														{margin.toFixed(1)}%
													</span>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
											</td>
											<td className="px-4 py-3 text-center">
												{sku.isActive ? (
													<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
														Active
													</span>
												) : (
													<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300">
														Inactive
													</span>
												)}
											</td>
											<td className="px-4 py-3">
												<div className="flex gap-1 justify-end">
													<Button
														intent="outline"
														size="sq-sm"
														onPress={() => handleEdit(sku)}
														aria-label="Edit SKU"
														className="hover:bg-primary/10 hover:text-primary"
													>
														<Edit className="h-3 w-3" />
													</Button>
													{sku.isActive && (
														<Button
															intent="outline"
															size="sq-sm"
															onPress={() => handleDelete(sku._id)}
															aria-label="Delete SKU"
															className="hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400"
														>
															<Trash2 className="h-3 w-3" />
														</Button>
													)}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Footer with count - only show when not editing and have SKUs */}
			{skus && skus.length > 0 && !isEditing && (
				<div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
					<p>
						{skus.filter((s: SKUDoc) => s.isActive).length} active SKU
						{skus.filter((s: SKUDoc) => s.isActive).length !== 1
							? "s"
							: ""} • {skus.length} total
					</p>
				</div>
			)}
		</div>
	);
}
