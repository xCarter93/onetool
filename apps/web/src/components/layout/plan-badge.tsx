"use client";

import { useState } from "react";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useIsAdmin } from "@/hooks/use-role-access";
import { useRouter } from "next/navigation";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Crown,
	Users,
	FileSignature,
	Briefcase,
	ArrowUpRight,
	Check,
} from "lucide-react";
import { formatLimit, getUsagePercentage } from "@/lib/plan-limits";
import { motion } from "motion/react";

export function PlanBadge() {
	const [open, setOpen] = useState(false);
	const {
		hasPremiumAccess,
		planLimits,
		currentUsage,
		isLoading,
		hasOrganization,
	} = useFeatureAccess();
	const isAdmin = useIsAdmin();
	const router = useRouter();

	if (isLoading) {
		return <Skeleton className="h-9 w-28 rounded-full" />;
	}

	const planName = hasPremiumAccess ? "Business" : "Free";

	const handleManageSubscription = () => {
		setOpen(false);
		router.push("/subscription");
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<motion.button
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					className={`group inline-flex items-center gap-2.5 font-semibold transition-all duration-200 rounded-lg ring-1 shadow-sm hover:shadow-md backdrop-blur-sm ${
						hasPremiumAccess
							? "px-4 py-2 text-sm bg-warning/15 hover:bg-warning/20 ring-warning/30 hover:ring-warning/50 text-warning-foreground border border-warning/20"
							: "px-4 py-2 text-sm text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
					}`}
				>
					{hasPremiumAccess ? (
						<Crown className="h-4 w-4 text-warning drop-shadow-sm" />
					) : (
						<Users className="h-4 w-4" />
					)}
					<span className="font-bold tracking-tight">{planName}</span>
					{hasPremiumAccess && (
						<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning-foreground border border-warning/30">
							PRO
						</span>
					)}
				</motion.button>
			</PopoverTrigger>
			<PopoverContent
				className="w-80 p-0 bg-background! backdrop-blur-xl border-border shadow-xl"
				align="end"
			>
				<div className="p-4 border-b border-border bg-background">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							{hasPremiumAccess ? (
								<Crown className="h-5 w-5 text-warning" />
							) : (
								<Users className="h-5 w-5 text-muted-foreground" />
							)}
							<h3 className="font-semibold text-foreground">{planName} Plan</h3>
						</div>
					</div>
					<p className="text-sm text-muted-foreground">
						{!hasOrganization
							? "Create an organization to start using OneTool"
							: hasPremiumAccess
							? "Enjoy unlimited access to all features"
							: "You're on the free plan with limited features"}
					</p>
				</div>

				{/* Usage Stats for Free Plan */}
				{!hasPremiumAccess && hasOrganization && currentUsage && (
					<div className="p-4 space-y-4 bg-background">
						{/* Clients Usage */}
						<div className="space-y-2">
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									<Briefcase className="h-4 w-4 text-muted-foreground" />
									<span className="font-medium">Clients</span>
								</div>
								<span className="text-muted-foreground">
									{currentUsage.clientsCount} /{" "}
									{formatLimit(planLimits.clients)}
								</span>
							</div>
							<Progress
								value={getUsagePercentage(
									currentUsage.clientsCount,
									planLimits.clients
								)}
								className="h-2"
							/>
						</div>

						{/* E-signatures Usage */}
						<div className="space-y-2">
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									<FileSignature className="h-4 w-4 text-muted-foreground" />
									<span className="font-medium">E-signatures (monthly)</span>
								</div>
								<span className="text-muted-foreground">
									{currentUsage.esignaturesSentThisMonth} /{" "}
									{formatLimit(planLimits.esignaturesPerMonth)}
								</span>
							</div>
							<Progress
								value={getUsagePercentage(
									currentUsage.esignaturesSentThisMonth,
									planLimits.esignaturesPerMonth
								)}
								className="h-2"
							/>
						</div>
					</div>
				)}

				{/* No Organization CTA */}
				{!hasOrganization && (
					<div className="p-4 space-y-3 bg-background">
						<p className="text-sm text-muted-foreground">
							Create an organization to unlock OneTool features and start
							managing your clients and projects.
						</p>
						<StyledButton
							onClick={() => {
								setOpen(false);
								router.push("/organization/complete");
							}}
							intent="primary"
							size="md"
							icon={<ArrowUpRight className="h-4 w-4" />}
							className="w-full justify-center"
							showArrow={false}
						>
							Create Organization
						</StyledButton>
					</div>
				)}

				{/* Premium Plan Features */}
				{hasPremiumAccess && hasOrganization && (
					<div className="p-4 space-y-3 bg-background">
						<div className="space-y-2 text-sm">
							<div className="flex items-center gap-2 text-muted-foreground">
								<Check className="size-3.5 shrink-0 text-success" />
								<span>Unlimited clients</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground">
								<Check className="size-3.5 shrink-0 text-success" />
								<span>Unlimited projects</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground">
								<Check className="size-3.5 shrink-0 text-success" />
								<span>Unlimited e-signatures</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground">
								<Check className="size-3.5 shrink-0 text-success" />
								<span>Custom SKUs</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground">
								<Check className="size-3.5 shrink-0 text-success" />
								<span>Organization documents</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground">
								<Check className="size-3.5 shrink-0 text-success" />
								<span>AI import</span>
							</div>
						</div>
					</div>
				)}

				{/* Manage Subscription Button - Admin only */}
				{hasOrganization && isAdmin && (
					<div className="p-4 border-t border-border bg-background">
						<StyledButton
							onClick={handleManageSubscription}
							intent={hasPremiumAccess ? "outline" : "primary"}
							size="md"
							icon={<ArrowUpRight className="h-4 w-4" />}
							className="w-full justify-center"
							showArrow={false}
						>
							Manage Subscription
						</StyledButton>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
