"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useIsAdmin } from "@/hooks/use-role-access";
import { useRouter } from "next/navigation";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Users, ArrowUpRight, Check } from "lucide-react";
import {
	BUSINESS_SEATS,
	PLAN_MATRIX,
} from "@onetool/backend/convex/lib/planMatrix";

/** What Business actually adds: the seat bump plus the matrix's paid-only switches. */
const BUSINESS_BENEFITS = [
	`${BUSINESS_SEATS} team members`,
	"Unlimited sends, e-signatures, AI, reports and imports",
	...PLAN_MATRIX.filter(
		(row) => row.business === true && row.free === false
	).map((row) => row.label),
];

export function PlanBadge() {
	const [open, setOpen] = useState(false);
	const { isBusiness, isLoading } = useEntitlements();
	const { isLoaded, orgId } = useAuth();
	const hasOrganization = !!orgId;
	const isAdmin = useIsAdmin();
	const router = useRouter();

	if (isLoading || !isLoaded) {
		return <Skeleton className="h-8 w-24 rounded-lg" />;
	}

	const planName = isBusiness ? "Business" : "Free";

	const handleManageSubscription = () => {
		setOpen(false);
		router.push("/organization/profile?tab=billing");
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						className={`group inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold shadow-sm ring-1 transition-colors duration-200 ${
							isBusiness
								? "bg-warning/15 hover:bg-warning/20 ring-warning/30 hover:ring-warning/50 text-warning-foreground"
								: "text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
						}`}
					/>
				}
			>
				{isBusiness ? (
					<Crown className="size-3.5 text-warning drop-shadow-sm" />
				) : (
					<Users className="size-3.5" />
				)}
				<span className="font-bold tracking-tight">{planName}</span>
				{isBusiness && (
					<span className="rounded bg-warning/20 px-1 py-px text-[9px] font-semibold text-warning-foreground ring-1 ring-warning/30">
						PRO
					</span>
				)}
			</PopoverTrigger>
			<PopoverContent
				className="w-80 p-0 bg-background! backdrop-blur-xl border-border shadow-xl"
				align="end"
			>
				<div className="p-4 border-b border-border bg-background">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							{isBusiness ? (
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
							: isBusiness
							? "Enjoy unlimited access to all features"
							: "You're on the free plan. Everything's included, with usage limits."}
					</p>
				</div>

				{/* No Organization CTA */}
				{!hasOrganization && (
					<div className="p-4 space-y-3 bg-background">
						<p className="text-sm text-muted-foreground">
							Create an organization to unlock OneTool features and start
							managing your clients and projects.
						</p>
						<Button
							onClick={() => {
								setOpen(false);
								router.push("/organization/complete");
							}}
							className="w-full justify-center"
						>
							<ArrowUpRight className="h-4 w-4" />
							Create Organization
						</Button>
					</div>
				)}

				{/* Business plan benefits */}
				{isBusiness && hasOrganization && (
					<div className="p-4 space-y-3 bg-background">
						<div className="space-y-2 text-sm">
							{BUSINESS_BENEFITS.map((benefit) => (
								<div
									key={benefit}
									className="flex items-center gap-2 text-muted-foreground"
								>
									<Check className="size-3.5 shrink-0 text-success" />
									<span>{benefit}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Manage Subscription Button - Admin only */}
				{hasOrganization && isAdmin && (
					<div className="p-4 border-t border-border bg-background">
						<Button
							onClick={handleManageSubscription}
							variant={isBusiness ? "outline" : "default"}
							className="w-full justify-center"
						>
							<ArrowUpRight className="h-4 w-4" />
							Manage Subscription
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
