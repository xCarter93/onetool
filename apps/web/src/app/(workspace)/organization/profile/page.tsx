"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";

import {
	StyledTabs,
	StyledTabsContent,
	StyledTabsList,
	StyledTabsTrigger,
} from "@/components/ui/styled";
import { DotField } from "@/components/ui/dot-field";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useOrgOwner } from "./_hooks/use-org-owner";
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

const isTabValue = (value: string): value is TabValue =>
	TAB_VALUES.includes(value as TabValue);

export default function OrganizationProfilePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const { hasPremiumAccess } = useFeatureAccess();
	const { organization, isLoading } = useOrgOwner();

	// Get active tab from search params
	const tabParam = searchParams.get("tab");
	const activeTab: TabValue =
		tabParam && isTabValue(tabParam) ? tabParam : "overview";

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
		[router, hasPremiumAccess, toast],
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
		<div className="relative p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col">
			<div className="flex-1 flex flex-col py-8">
				<div className="relative mb-10 overflow-hidden">
					<DotField className="text-muted-foreground opacity-[0.55] [mask-image:radial-gradient(55%_170%_at_100%_-20%,black,transparent_68%)] [-webkit-mask-image:radial-gradient(55%_170%_at_100%_-20%,black,transparent_68%)]" />
					<div className="relative">
						<div className="flex items-center gap-3 mb-3">
							<div className="w-2 h-8 bg-linear-to-b from-primary to-primary/60 rounded-full" />
							<h1 className="text-3xl font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent tracking-tight">
								Organization Settings
							</h1>
						</div>
						<p className="text-muted-foreground ml-5 leading-relaxed max-w-2xl">
							Manage the active organization&apos;s profile, team, and
							operational preferences from one cohesive workspace.
						</p>
					</div>
				</div>

				<StyledTabs
					value={activeTab}
					onValueChange={handleTabChange}
					className="flex-1"
				>
					<StyledTabsList className="overflow-x-auto">
						<StyledTabsTrigger value="overview">Overview</StyledTabsTrigger>
						<StyledTabsTrigger value="business">Business Info</StyledTabsTrigger>
						<StyledTabsTrigger
							value="payments"
							disabled={!hasPremiumAccess}
							className={!hasPremiumAccess ? "cursor-not-allowed" : ""}
						>
							{!hasPremiumAccess && <Lock className="h-3 w-3 mr-1" />}
							Payments
						</StyledTabsTrigger>
						<StyledTabsTrigger
							value="documents"
							disabled={!hasPremiumAccess}
							className={!hasPremiumAccess ? "cursor-not-allowed" : ""}
						>
							{!hasPremiumAccess && <Lock className="h-3 w-3 mr-1" />}
							Documents
						</StyledTabsTrigger>
						<StyledTabsTrigger
							value="skus"
							disabled={!hasPremiumAccess}
							className={!hasPremiumAccess ? "cursor-not-allowed" : ""}
						>
							{!hasPremiumAccess && <Lock className="h-3 w-3 mr-1" />}
							SKUs
						</StyledTabsTrigger>
					</StyledTabsList>

					<div className="mt-8 space-y-8">
						<StyledTabsContent value="overview" className="mt-0">
							<OverviewTab />
						</StyledTabsContent>

						<StyledTabsContent value="business" className="mt-0">
							<BusinessInfoTab />
						</StyledTabsContent>

						<StyledTabsContent value="payments" className="mt-0">
							<PaymentsTab />
						</StyledTabsContent>

						<StyledTabsContent value="documents" className="mt-0">
							<DocumentsTab />
						</StyledTabsContent>

						<StyledTabsContent value="skus" className="mt-0">
							<SKUsTab />
						</StyledTabsContent>
					</div>
				</StyledTabs>
			</div>
		</div>
	);
}
