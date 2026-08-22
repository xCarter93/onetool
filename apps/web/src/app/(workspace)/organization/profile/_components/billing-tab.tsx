"use client";

import * as React from "react";
import { useSyncExternalStore } from "react";
import { SignedIn } from "@clerk/nextjs";
import {
	CheckoutButton,
	SubscriptionDetailsButton,
	usePlans,
} from "@clerk/nextjs/experimental";
import { useTheme } from "next-themes";
import {
	Briefcase,
	Calendar,
	Check,
	CreditCard,
	Crown,
	FileSignature,
	FolderOpen,
	Headphones,
	Package,
	Sparkles,
	Users,
	Workflow,
	X,
	Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { LearnMoreLink } from "@/components/help/learn-more";
import { PLAN_MATRIX } from "@onetool/backend/convex/lib/planMatrix";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePermissions } from "@/hooks/use-permissions";
import {
	SectionHeading,
	SettingsCard,
	SettingsCardBody,
	SettingsCardHeader,
} from "./settings-card";

const BUSINESS_PLAN_SLUG = "onetool_business_plan_org";

type BillingPeriod = "month" | "annual";

/** Shared Clerk drawer theming for the checkout + subscription-details drawers. */
function useBillingDrawerAppearance() {
	const { resolvedTheme } = useTheme();
	// True only after client hydration; avoids theme hydration mismatch
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
	const isDark = mounted ? resolvedTheme === "dark" : false;

	return React.useMemo(
		() => ({
			elements: {
				drawerRoot: { zIndex: 40 },
				drawerContent: { zIndex: 40 },
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
		}),
		[isDark],
	);
}

/** Row icons, keyed by PLAN_MATRIX row key — the labels/values come from the matrix. */
const FEATURE_ICONS: Record<string, React.ReactNode> = {
	clients: <Briefcase className="size-4" />,
	activeProjectsPerClient: <CreditCard className="size-4" />,
	esignatures: <FileSignature className="size-4" />,
	aiAssistant: <Sparkles className="size-4" />,
	automationPublish: <Workflow className="size-4" />,
	llmCsvImport: <Zap className="size-4" />,
	stripeConnect: <CreditCard className="size-4" />,
	customSkus: <Package className="size-4" />,
	orgDocuments: <FolderOpen className="size-4" />,
	supportSla: <Headphones className="size-4" />,
};

const MATRIX_CATEGORIES = [...new Set(PLAN_MATRIX.map((row) => row.category))];

/** Unlimited meters come back as a null limit. */
function formatLimit(limit: number | null): string {
	return limit === null ? "Unlimited" : limit.toString();
}

function getUsagePercentage(usage: number, limit: number | null): number {
	if (limit === null) {
		return 0;
	}
	return Math.min(100, (usage / limit) * 100);
}

function FeatureCell({ value, paid }: { value: string | boolean; paid: boolean }) {
	if (typeof value === "boolean") {
		return value ? (
			<Check
				className={`mx-auto size-4.5 ${paid ? "text-primary" : "text-success"}`}
				aria-label="Included"
			/>
		) : (
			<X
				className="mx-auto size-4.5 text-muted-foreground/40"
				aria-label="Not included"
			/>
		);
	}
	return (
		<span
			className={`text-sm ${
				value === "Unlimited"
					? "font-semibold text-primary"
					: "font-medium text-foreground"
			}`}
		>
			{value}
		</span>
	);
}

function UsageMeter({
	icon,
	label,
	used,
	limit,
}: {
	icon: React.ReactNode;
	label: string;
	used: number;
	limit: number | null;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between text-sm">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">{icon}</span>
					<span className="font-medium">{label}</span>
				</div>
				<span className="text-muted-foreground">
					{used} / {formatLimit(limit)}
				</span>
			</div>
			<Progress value={getUsagePercentage(used, limit)} className="h-2" />
		</div>
	);
}

export function BillingTab() {
	const { isBusiness, meter, isLoading: accessLoading } = useEntitlements();
	const { data: plans, isLoading: plansLoading } = usePlans({
		for: "organization",
	});
	// billing:view shows the tab; billing:modify unlocks checkout + manage.
	const { can } = usePermissions();
	const canManageBilling = can("billing", "modify");
	const drawerAppearance = useBillingDrawerAppearance();
	const [period, setPeriod] = React.useState<BillingPeriod>("annual");

	const businessPlan = plans?.find((plan) => plan.slug === BUSINESS_PLAN_SLUG);

	// Effective monthly price for the selected period; annual falls back to the
	// monthly fee when the plan has no annual pricing configured.
	const monthlyFee = businessPlan?.fee;
	const annualMonthlyFee = businessPlan?.annualMonthlyFee ?? null;
	const displayedFee =
		period === "annual" && annualMonthlyFee ? annualMonthlyFee : monthlyFee;
	const annualSavingsPercent =
		monthlyFee && annualMonthlyFee && monthlyFee.amount > 0
			? Math.round((1 - annualMonthlyFee.amount / monthlyFee.amount) * 100)
			: 0;

	const planName = isBusiness ? "Business" : "Free";
	const clientsMeter = meter("clients");
	const esignaturesMeter = meter("esignatures");

	if (accessLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-16 w-full max-w-md rounded-xl" />
				<Skeleton className="h-40 w-full rounded-xl" />
				<Skeleton className="h-96 w-full rounded-xl" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SectionHeading
				title="Plan & Billing"
				description="Manage your subscription and see everything included in each plan."
				aside={
					isBusiness ? (
						<Badge variant="warning-light" radius="full" className="gap-1.5 px-3">
							<Crown className="size-3.5" aria-hidden="true" />
							Business plan
						</Badge>
					) : (
						<Badge variant="primary-light" radius="full" className="px-3">
							Free plan
						</Badge>
					)
				}
			/>

			{/* Current plan */}
			<SettingsCard>
				<SettingsCardHeader gradient texture>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-3">
							<div
								className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] border ${
									isBusiness
										? "border-warning/25 bg-warning/10"
										: "border-primary/20 bg-primary/10"
								}`}
							>
								{isBusiness ? (
									<Crown className="size-5 text-warning" aria-hidden="true" />
								) : (
									<Users className="size-5 text-primary" aria-hidden="true" />
								)}
							</div>
							<div>
								<p className="text-base font-semibold leading-tight">
									{planName} plan
								</p>
								<p className="mt-0.5 text-sm text-muted-foreground">
									{isBusiness
										? "Full access to every OneTool feature."
										: "Core features with usage limits."}
								</p>
							</div>
						</div>
						{isBusiness && canManageBilling && (
							<SignedIn>
								<SubscriptionDetailsButton
									for="organization"
									subscriptionDetailsProps={{ appearance: drawerAppearance }}
								>
									<Button variant="outline" size="sm">
										<Calendar className="size-3.5" />
										Manage subscription
									</Button>
								</SubscriptionDetailsButton>
							</SignedIn>
						)}
					</div>
				</SettingsCardHeader>
				{!isBusiness && clientsMeter && esignaturesMeter && (
					<SettingsCardBody className="grid gap-5 border-t border-border sm:grid-cols-2">
						<UsageMeter
							icon={<Briefcase className="size-4" />}
							label="Clients"
							used={clientsMeter.used}
							limit={clientsMeter.limit}
						/>
						<UsageMeter
							icon={<FileSignature className="size-4" />}
							label="E-signatures this month"
							used={esignaturesMeter.used}
							limit={esignaturesMeter.limit}
						/>
					</SettingsCardBody>
				)}
			</SettingsCard>

			{/* Plan comparison */}
			<SettingsCard>
				<SettingsCardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 className="text-base font-semibold tracking-tight">
							Compare plans
						</h3>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Everything in Free, plus unlimited usage and the full business
							toolkit on Business.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<LearnMoreLink
							article="settings-and-team/plans-and-billing"
							label="Compare plans in detail"
						/>
						{!isBusiness && (
							<SegmentedControl<BillingPeriod>
								value={period}
								onValueChange={setPeriod}
								options={[
									{ value: "month", label: "Monthly" },
									{
										value: "annual",
										label:
											annualSavingsPercent > 0
												? `Annual · save ${annualSavingsPercent}%`
												: "Annual",
									},
								]}
							/>
						)}
					</div>
				</SettingsCardHeader>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[560px] border-t border-border">
						<thead>
							<tr className="border-b border-border">
								<th
									scope="col"
									className="w-2/5 px-[22px] py-4 text-left text-sm font-semibold"
								>
									Features
								</th>
								<th scope="col" className="px-4 py-4 text-center align-top">
									<div className="flex flex-col items-center gap-1.5">
										<span className="text-sm font-semibold">Free</span>
										<span className="text-xs text-muted-foreground">
											$0 forever
										</span>
										{!isBusiness && (
											<Badge variant="primary-light" radius="full">
												Current
											</Badge>
										)}
									</div>
								</th>
								<th
									scope="col"
									className="bg-primary/4 px-4 py-4 text-center align-top"
								>
									<div className="flex flex-col items-center gap-1.5">
										<span className="flex items-center gap-1.5 text-sm font-semibold">
											<Crown
												className="size-3.5 text-warning"
												aria-hidden="true"
											/>
											Business
										</span>
										{plansLoading ? (
											<Skeleton className="h-4 w-24 rounded" />
										) : displayedFee ? (
											<span className="text-xs text-muted-foreground">
												{displayedFee.currencySymbol}
												{displayedFee.amountFormatted}/month
												{period === "annual" &&
													businessPlan?.annualFee &&
													` · billed annually (${businessPlan.annualFee.currencySymbol}${businessPlan.annualFee.amountFormatted})`}
											</span>
										) : (
											<span className="text-xs text-muted-foreground">
												Pricing at checkout
											</span>
										)}
										{isBusiness ? (
											<Badge variant="warning-light" radius="full">
												Current
											</Badge>
										) : !canManageBilling ? (
											<span className="mt-1 text-xs text-muted-foreground">
												Ask an admin to upgrade
											</span>
										) : businessPlan ? (
											<SignedIn>
												<CheckoutButton
													planId={businessPlan.id}
													for="organization"
													planPeriod={period}
													newSubscriptionRedirectUrl="/organization/profile?tab=billing"
													onSubscriptionComplete={() => {
														window.location.reload();
													}}
													checkoutProps={{ appearance: drawerAppearance }}
												>
													<Button size="sm" className="mt-1">
														<Crown className="size-3.5" />
														Upgrade to Business
													</Button>
												</CheckoutButton>
											</SignedIn>
										) : (
											<Button size="sm" className="mt-1" disabled>
												<Crown className="size-3.5" />
												{plansLoading
													? "Loading plans…"
													: "Plan unavailable"}
											</Button>
										)}
									</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{MATRIX_CATEGORIES.map((category) => (
								<React.Fragment key={category}>
									<tr>
										<td
											colSpan={3}
											className="border-b border-border bg-muted/40 px-[22px] py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
										>
											{category}
										</td>
									</tr>
									{PLAN_MATRIX.filter((row) => row.category === category).map(
										(row) => (
											<tr
												key={row.key}
												className="border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/20"
											>
												<th
													scope="row"
													className="px-[22px] py-3 text-left font-normal"
												>
													<div className="flex items-center gap-2.5">
														<span className="text-muted-foreground">
															{FEATURE_ICONS[row.key]}
														</span>
														<span className="text-sm font-medium">
															{row.label}
														</span>
													</div>
												</th>
												<td className="px-4 py-3 text-center">
													<FeatureCell value={row.free} paid={false} />
												</td>
												<td className="bg-primary/4 px-4 py-3 text-center">
													<FeatureCell value={row.business} paid />
												</td>
											</tr>
										),
									)}
								</React.Fragment>
							))}
						</tbody>
					</table>
				</div>
			</SettingsCard>
		</div>
	);
}
