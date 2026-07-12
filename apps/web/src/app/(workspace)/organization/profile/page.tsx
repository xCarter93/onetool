"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
	AlertTriangle,
	Briefcase,
	CreditCard,
	FileText,
	LayoutGrid,
	Lock,
	ShieldCheck,
	Tags,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { EmptyState } from "@/components/domain/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { usePermissions } from "@/hooks/use-permissions";
import type { PermissionObject } from "@onetool/backend/convex/lib/permissionKeys";
import { useOrgOwner } from "./_hooks/use-org-owner";
import {
	SettingsSaveProvider,
	useSettingsSaveFooter,
} from "./_hooks/use-settings-save";
import {
	SettingsNavChips,
	SettingsNavRail,
	type SettingsNavItem,
} from "./_components/settings-nav";
import { OverviewTab } from "./_components/overview-tab";
import { BusinessInfoTab } from "./_components/business-info-tab";
import { PaymentsTab } from "./_components/payments-tab";
import { DocumentsTab } from "./_components/documents-tab";
import { SKUsTab } from "./_components/skus-tab";

const TAB_VALUES = [
	"overview",
	"business",
	"payments",
	"documents",
	"skus",
] as const;
type TabValue = (typeof TAB_VALUES)[number];

const PREMIUM_TABS: readonly TabValue[] = ["payments", "documents", "skus"];

// Granular-permission gating per tab (§5.4); tabs absent here are role/premium-gated only.
const TAB_PERMISSIONS: Partial<Record<TabValue, PermissionObject>> = {
	documents: "orgDocuments",
	skus: "skus",
};

// Stripe payouts stay role-gated (no matrix object in v1); Overview and
// Business Info remain viewable read-only for members.
const ADMIN_TABS: readonly TabValue[] = ["payments"];

const isTabValue = (value: string): value is TabValue =>
	TAB_VALUES.includes(value as TabValue);

/**
 * Unified footer for the whole settings container: an "unsaved changes"
 * indicator + Save/Discard, wired to whichever tab registered a save handle.
 * Tabs without an editable form fall back to the sync hint.
 */
function SettingsSaveFooter() {
	const handle = useSettingsSaveFooter();

	if (!handle) {
		return (
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
				Changes sync across your workspace.
			</div>
		);
	}

	const { dirty, saving, canSave, save, discard, saveLabel } = handle;

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-h-7 items-center">
				{dirty ? (
					<Badge variant="warning-light" radius="full" className="gap-2 px-3">
						<span
							aria-hidden="true"
							className="size-2 rounded-full bg-amber-500 motion-safe:animate-pulse"
						/>
						Unsaved changes
					</Badge>
				) : (
					<span className="text-xs text-muted-foreground">
						All changes saved
					</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={discard}
					disabled={!dirty || saving}
				>
					Discard
				</Button>
				<Button
					size="sm"
					onClick={save}
					disabled={!dirty || saving || !canSave}
				>
					{saving ? "Saving…" : (saveLabel ?? "Save changes")}
				</Button>
			</div>
		</div>
	);
}

export default function OrganizationProfilePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const { hasPremiumAccess, isLoading: featureLoading } = useFeatureAccess();
	const { can, hasFullAccess, isLoading: permsLoading } = usePermissions();
	const { organization, isLoading } = useOrgOwner();

	// Get active tab from search params
	const tabParam = searchParams.get("tab");
	const activeTab: TabValue =
		tabParam && isTabValue(tabParam) ? tabParam : "overview";

	// The nav rail locks premium tabs, but typing ?tab=payments directly bypasses
	// handleTabChange. Once access resolves, deny premium tabs to non-premium users:
	// render the overview and replace the URL to match. (This is UI gating only —
	// the durable boundary must live in the backend.)
	const deniedPremium =
		!featureLoading && PREMIUM_TABS.includes(activeTab) && !hasPremiumAccess;
	const tabPermission = TAB_PERMISSIONS[activeTab];
	// Role/grant denials render an in-place no-access panel (no redirect, no
	// error toast) — pasting ?tab=payments as a member shows the empty state.
	const deniedAccess =
		!permsLoading &&
		((ADMIN_TABS.includes(activeTab) && !hasFullAccess) ||
			(tabPermission !== undefined && !can(tabPermission)));
	const renderTab: TabValue = deniedPremium ? "overview" : activeTab;

	React.useEffect(() => {
		if (deniedPremium) {
			toast.error("Premium Feature", "Upgrade to access this feature");
			router.replace("/organization/profile");
		}
	}, [deniedPremium, router, toast]);

	const handleTabChange = React.useCallback(
		(value: string) => {
			if (!isTabValue(value)) {
				return;
			}

			// Block premium features without premium access
			if (PREMIUM_TABS.includes(value) && !hasPremiumAccess) {
				toast.error("Premium Feature", "Upgrade to access this feature");
				return;
			}

			// Role/grant-locked tabs don't navigate; the rail already shows the lock.
			if (!permsLoading && ADMIN_TABS.includes(value) && !hasFullAccess) {
				return;
			}
			const permission = TAB_PERMISSIONS[value];
			if (permission !== undefined && !permsLoading && !can(permission)) {
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
		[router, hasPremiumAccess, toast, can, permsLoading, hasFullAccess],
	);

	const navItems: SettingsNavItem[] = React.useMemo(
		() => [
			{
				value: "overview",
				label: "Overview",
				sublabel: "Profile & team",
				icon: LayoutGrid,
			},
			{
				value: "business",
				label: "Business Info",
				sublabel: "Contact & address",
				icon: Briefcase,
			},
			{
				value: "payments",
				label: "Payments",
				sublabel: "Stripe & payouts",
				icon: CreditCard,
				locked: !hasPremiumAccess || (!permsLoading && !hasFullAccess),
			},
			{
				value: "documents",
				label: "Documents",
				sublabel: "Quote & invoice files",
				icon: FileText,
				locked:
					!hasPremiumAccess || (!permsLoading && !can("orgDocuments")),
			},
			{
				value: "skus",
				label: "SKUs",
				sublabel: "Reusable line items",
				icon: Tags,
				locked: !hasPremiumAccess || (!permsLoading && !can("skus")),
			},
		],
		[hasPremiumAccess, can, permsLoading, hasFullAccess],
	);

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
		<SettingsSaveProvider>
			{/* Fills the fixed-height card interior on desktop; the content pane
			    scrolls internally while the rail + footer stay pinned. Extra bottom
			    padding clears the floating assistant tab. */}
			<div className="relative flex flex-col p-4 sm:p-6 lg:h-full lg:min-h-0 lg:p-8 lg:pb-10">
				{/* Page header */}
				<div className="mb-6 shrink-0">
					<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
						Settings
					</p>
					<h1 className="text-3xl font-bold tracking-tight">
						Organization Settings
					</h1>
					<p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
						Manage the active organization&apos;s profile, team, and
						operational preferences from one cohesive workspace.
					</p>
				</div>

				{/* Unified settings container: nav rail + scrolling content + footer */}
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
					<div className="grid min-h-0 flex-1 lg:grid-cols-[262px_1fr] lg:overflow-hidden">
						<SettingsNavRail
							items={navItems}
							activeValue={renderTab}
							onSelect={handleTabChange}
						/>
						<div className="relative flex min-w-0 flex-col lg:overflow-hidden">
							<div className="px-5 pt-5 sm:px-6 lg:hidden">
								<SettingsNavChips
									items={navItems}
									activeValue={renderTab}
									onSelect={handleTabChange}
								/>
							</div>
							<div className="min-h-0 flex-1 p-5 sm:p-6 lg:overflow-y-auto lg:p-8">
								{deniedAccess ? (
									<div className="flex min-h-[40vh] items-center justify-center">
										<EmptyState
											size="md"
											icon={<Lock className="h-6 w-6" aria-hidden="true" />}
											title="You don't have access to this area"
											description={
												ADMIN_TABS.includes(activeTab)
													? "Only organization admins can access payment settings."
													: "Ask an organization admin to grant you access from the team settings."
											}
										/>
									</div>
								) : (
									<>
										{renderTab === "overview" && <OverviewTab />}
										{renderTab === "business" && <BusinessInfoTab />}
										{renderTab === "payments" && <PaymentsTab />}
										{renderTab === "documents" && <DocumentsTab />}
										{renderTab === "skus" && <SKUsTab />}
									</>
								)}
							</div>
						</div>
					</div>

					{/* Unified save footer spanning the whole container */}
					<div className="shrink-0 border-t border-border bg-muted/40 px-5 py-3 sm:px-6">
						<SettingsSaveFooter />
					</div>
				</div>
			</div>
		</SettingsSaveProvider>
	);
}
