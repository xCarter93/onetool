"use client";

import React from "react";
import { SignedIn } from "@clerk/nextjs";
import {
	SubscriptionDetailsButton,
	CheckoutButton,
	usePlans,
} from "@clerk/nextjs/experimental";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Crown,
	Users,
	Check,
	X,
	ArrowLeft,
	Loader2,
	CreditCard,
	Calendar,
	TrendingUp,
	Briefcase,
	FileSignature,
	Package,
	FolderOpen,
	Sparkles,
	Headphones,
} from "lucide-react";

export default function SubscriptionPage() {
	const router = useRouter();
	const { hasPremiumAccess, isLoading, hasOrganization } = useFeatureAccess();
	const { resolvedTheme } = useTheme();
	// True only after client hydration; avoids theme hydration mismatch
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false
	);

	// Fetch organization plans from Clerk
	const { data: plans, isLoading: plansLoading } = usePlans({
		for: "organization",
	});

	// Find the Business plan by slug
	const businessPlan = plans?.find(
		(plan) => plan.slug === "onetool_business_plan_org"
	);

	const isDark = mounted ? resolvedTheme === "dark" : false;

	// Feature comparison data
	const featureCategories = [
		{
			name: "Core Features",
			features: [
				{
					name: "Clients",
					icon: <Briefcase className="h-4 w-4" />,
					free: "10",
					business: "Unlimited",
				},
				{
					name: "Active Projects per Client",
					icon: <CreditCard className="h-4 w-4" />,
					free: "3",
					business: "Unlimited",
				},
				{
					name: "E-signatures per month",
					icon: <FileSignature className="h-4 w-4" />,
					free: "5",
					business: "Unlimited",
				},
			],
		},
		{
			name: "Advanced Features",
			features: [
				{
					name: "Custom SKU Creation",
					icon: <Package className="h-4 w-4" />,
					free: false,
					business: true,
				},
				{
					name: "Organization Documents",
					icon: <FolderOpen className="h-4 w-4" />,
					free: false,
					business: true,
				},
				{
					name: "AI Import",
					icon: <Sparkles className="h-4 w-4" />,
					free: false,
					business: true,
				},
			],
		},
		{
			name: "Support",
			features: [
				{
					name: "Support SLA",
					icon: <Headphones className="h-4 w-4" />,
					free: "Best effort",
					business: "24 hours",
				},
			],
		},
	];

	if (isLoading || plansLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
					<p className="text-muted-foreground">
						Loading subscription details...
					</p>
				</div>
			</div>
		);
	}

	const planName = hasPremiumAccess ? "Business" : "Free";

	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto py-8 px-4">
				{/* Header */}
				<div className="mb-8">
					<StyledButton
						onClick={() => router.push("/home")}
						intent="outline"
						size="sm"
						icon={<ArrowLeft className="w-4 h-4" />}
						showArrow={false}
						className="mb-6"
					>
						Back to Home
					</StyledButton>

					<div className="flex items-center gap-4 mb-4">
						{hasPremiumAccess ? (
							<div className="p-3 rounded-xl bg-linear-to-br from-amber-500/10 via-amber-400/15 to-yellow-500/10 border border-amber-500/20">
								<Crown className="h-8 w-8 text-amber-500" />
							</div>
						) : (
							<div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
								<Users className="h-8 w-8 text-primary" />
							</div>
						)}
						<div>
							<h1 className="text-3xl font-bold text-foreground">
								Subscription Management
							</h1>
							<p className="text-muted-foreground">
								Manage your {planName} plan and billing
							</p>
						</div>
					</div>
				</div>

				{!hasOrganization ? (
					<Card className="border-2 border-dashed border-border">
						<CardContent className="p-12 text-center">
							<Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
							<h2 className="text-xl font-semibold mb-2">
								No Organization Found
							</h2>
							<p className="text-muted-foreground mb-6 max-w-md mx-auto">
								You need to create an organization before managing
								subscriptions.
							</p>
							<StyledButton
								onClick={() => router.push("/organization/complete")}
								intent="primary"
								size="lg"
							>
								Create Organization
							</StyledButton>
						</CardContent>
					</Card>
				) : (
					<div className="mx-auto space-y-6">
						{/* Current Plan Card */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<CreditCard className="h-5 w-5 text-primary" />
									Current Plan
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<div className="p-4 rounded-lg bg-muted/50 border border-border">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												{hasPremiumAccess ? (
													<Crown className="h-6 w-6 text-amber-500" />
												) : (
													<Users className="h-6 w-6 text-primary" />
												)}
												<div>
													<p className="font-semibold text-lg">
														{planName} Plan
													</p>
													<p className="text-sm text-muted-foreground">
														{hasPremiumAccess
															? "Full access to all features"
															: "Limited features"}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-3">
												{hasPremiumAccess && (
													<div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
														<span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
															ACTIVE
														</span>
													</div>
												)}
												{/* Subscription Details Button Inline */}
												<SignedIn>
													<SubscriptionDetailsButton
														for="organization"
														subscriptionDetailsProps={{
															appearance: {
																elements: {
																	drawerRoot: {
																		zIndex: 40,
																	},
																	card: {
																		backgroundColor: isDark
																			? "oklch(0.21 0.006 285.885)"
																			: "oklch(1 0 0)",
																		border: `1px solid ${
																			isDark
																				? "oklch(0.27 0.013 285.805)"
																				: "oklch(0.911 0.006 286.286)"
																		}`,
																		borderRadius: "var(--radius-lg)",
																		opacity: "1",
																		zIndex: "99999",
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
															intent="outline"
															size="sm"
															icon={<Calendar className="h-3.5 w-3.5" />}
															showArrow={false}
														>
															View Details
														</StyledButton>
													</SubscriptionDetailsButton>
												</SignedIn>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Feature Comparison Table */}
						<Card>
							<CardHeader>
								<CardTitle>Feature Comparison</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead>
											<tr className="border-b border-border">
												<th className="text-left py-3 px-4 font-semibold text-foreground">
													Features
												</th>
												<th className="text-center py-3 px-4 font-semibold text-foreground min-w-[180px]">
													<div className="flex flex-col items-center gap-2">
														<span>Free</span>
														{!hasPremiumAccess && (
															<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
																Current
															</span>
														)}
													</div>
												</th>
												<th className="text-center py-3 px-4 font-semibold text-foreground min-w-[180px]">
													<div className="flex flex-col items-center gap-2">
														<div className="flex items-center gap-1">
															<span>Business</span>
															{hasPremiumAccess && (
																<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
																	Current
																</span>
															)}
														</div>
														{!hasPremiumAccess && (
															<div className="flex gap-2 mt-1">
																<SignedIn>
																	<CheckoutButton
																		planId={businessPlan?.id || ""}
																		for="organization"
																		planPeriod="month"
																		newSubscriptionRedirectUrl="/subscription"
																		onSubscriptionComplete={() => {
																			window.location.reload();
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
																			intent="primary"
																			size="sm"
																			icon={<TrendingUp className="h-3 w-3" />}
																			showArrow={false}
																		>
																			Buy Monthly Plan
																		</StyledButton>
																	</CheckoutButton>
																</SignedIn>
																<SignedIn>
																	<CheckoutButton
																		planId={businessPlan?.id || ""}
																		for="organization"
																		planPeriod="annual"
																		newSubscriptionRedirectUrl="/subscription"
																		onSubscriptionComplete={() => {
																			window.location.reload();
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
																			icon={<Crown className="h-3 w-3" />}
																			showArrow={false}
																		>
																			Buy Annual Plan
																		</StyledButton>
																	</CheckoutButton>
																</SignedIn>
															</div>
														)}
													</div>
												</th>
											</tr>
										</thead>
										<tbody>
											{featureCategories.map((category, categoryIndex) => (
												<React.Fragment key={`category-${categoryIndex}`}>
													<tr>
														<td
															colSpan={3}
															className="py-3 px-4 font-semibold text-sm text-muted-foreground bg-muted/30 border-b border-border"
														>
															{category.name}
														</td>
													</tr>
													{category.features.map((feature, featureIndex) => (
														<tr
															key={`feature-${categoryIndex}-${featureIndex}`}
															className="border-b border-border/50 hover:bg-muted/20 transition-colors"
														>
															<td className="py-3 px-4">
																<div className="flex items-center gap-2">
																	<span className="text-muted-foreground">
																		{feature.icon}
																	</span>
																	<span className="text-sm font-medium">
																		{feature.name}
																	</span>
																</div>
															</td>
															<td className="py-3 px-4 text-center">
																{typeof feature.free === "boolean" ? (
																	feature.free ? (
																		<Check className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto" />
																	) : (
																		<X className="h-5 w-5 text-muted-foreground/40 mx-auto" />
																	)
																) : (
																	<span className="text-sm font-medium text-foreground">
																		{feature.free}
																	</span>
																)}
															</td>
															<td className="py-3 px-4 text-center">
																{typeof feature.business === "boolean" ? (
																	feature.business ? (
																		<Check className="h-5 w-5 text-primary mx-auto" />
																	) : (
																		<X className="h-5 w-5 text-muted-foreground/40 mx-auto" />
																	)
																) : (
																	<span
																		className={`text-sm font-medium ${
																			feature.business === "Unlimited"
																				? "text-primary font-semibold"
																				: "text-foreground"
																		}`}
																	>
																		{feature.business}
																	</span>
																)}
															</td>
														</tr>
													))}
												</React.Fragment>
											))}
										</tbody>
									</table>
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</div>
	);
}
