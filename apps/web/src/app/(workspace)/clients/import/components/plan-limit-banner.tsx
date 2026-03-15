"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { SignedIn } from "@clerk/nextjs";
import { CheckoutButton, usePlans } from "@clerk/nextjs/experimental";
import { useTheme } from "next-themes";
import { StyledButton } from "@/components/ui/styled/styled-button";

interface PlanLimitBannerProps {
	currentCount: number;
	importableCount: number;
	clientLimit: number | "unlimited";
	hasPremiumAccess: boolean;
}

export function PlanLimitBanner({
	currentCount,
	importableCount,
	clientLimit,
	hasPremiumAccess,
}: PlanLimitBannerProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	const { data: plans } = usePlans({ for: "organization" });
	const businessPlan = plans?.find(
		(plan) => plan.slug === "onetool_business_plan_org"
	);

	useEffect(() => {
		setMounted(true);
	}, []);

	const isDark = mounted ? resolvedTheme === "dark" : false;

	// Don't render for premium users or unlimited plans
	if (hasPremiumAccess || clientLimit === "unlimited") {
		return null;
	}

	const wouldExceedBy = Math.max(
		0,
		currentCount + importableCount - clientLimit
	);
	const maxImportable = Math.max(0, clientLimit - currentCount);

	// Don't render if import wouldn't exceed limit
	if (wouldExceedBy <= 0) {
		return null;
	}

	return (
		<div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
			<div className="flex items-start gap-3">
				<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
				<div className="flex-1 space-y-2">
					<p className="text-sm text-yellow-800 dark:text-yellow-200">
						You have{" "}
						<span className="font-semibold">
							{currentCount}/{clientLimit}
						</span>{" "}
						clients. Importing {importableCount} would exceed your
						limit by {wouldExceedBy}. Only the first{" "}
						<span className="font-semibold">{maxImportable}</span>{" "}
						rows will import.
					</p>
					<div className="flex items-center gap-2">
						<SignedIn>
							<CheckoutButton
								planId={businessPlan?.id || ""}
								for="organization"
								planPeriod="month"
								newSubscriptionRedirectUrl="/clients/import?step=review"
								onSubscriptionComplete={() => {
									// No-op: Convex useQuery reactivity will auto-update useFeatureAccess
								}}
								checkoutProps={{
									appearance: {
										elements: {
											drawerRoot: {
												zIndex: "40",
											},
											drawerContent: {
												zIndex: "40",
											},
										},
										variables: {
											colorPrimary: "rgb(0, 166, 244)",
											colorText: isDark
												? "oklch(0.985 0 0)"
												: "oklch(0.141 0.005 285.823)",
											colorBackground: isDark
												? "oklch(0.21 0.006 285.885)"
												: "oklch(1 0 0)",
											borderRadius: "0.5rem",
											fontFamily: "var(--font-geist-sans)",
										},
									},
								}}
							>
								<StyledButton
									intent="warning"
									size="sm"
									icon={
										<TrendingUp className="h-3.5 w-3.5" />
									}
									showArrow={false}
								>
									Upgrade Plan
								</StyledButton>
							</CheckoutButton>
						</SignedIn>
					</div>
				</div>
			</div>
		</div>
	);
}
