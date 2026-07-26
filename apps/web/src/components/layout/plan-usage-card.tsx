"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, Briefcase, FileSignature } from "lucide-react";
import {
	Frame,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SidebarGroup } from "@/components/ui/sidebar";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { usePermissions } from "@/hooks/use-permissions";
import {
	formatLimit,
	getUsagePercentage,
	isAtLimit,
	isNearLimit,
} from "@/lib/plan-limits";
import { cn } from "@/lib/utils";

function UsageMeter({
	icon,
	label,
	used,
	limit,
}: {
	icon: React.ReactNode;
	label: string;
	used: number;
	limit: number | "unlimited";
}) {
	const indicatorClass = isAtLimit(used, limit)
		? "**:data-[slot=progress-indicator]:bg-destructive"
		: isNearLimit(used, limit)
			? "**:data-[slot=progress-indicator]:bg-warning"
			: "**:data-[slot=progress-indicator]:bg-primary";

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs leading-none">
				<div className="flex items-center gap-1.5 text-muted-foreground">
					{icon}
					<span>{label}</span>
				</div>
				<span className="text-muted-foreground">
					<span className="font-semibold text-foreground">{used}</span> /{" "}
					{formatLimit(limit)}
				</span>
			</div>
			{/* Striped underlay marks the unused remainder (app-shell-3 pattern). */}
			<div className="relative h-1.5 overflow-hidden rounded-sm bg-muted/55">
				<div
					className="pointer-events-none absolute inset-0 text-muted-foreground opacity-20"
					aria-hidden="true"
					style={{
						backgroundImage:
							"repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 0, transparent 4px)",
					}}
				/>
				<Progress
					value={getUsagePercentage(used, limit)}
					aria-label={label}
					className={cn(
						"absolute inset-0 gap-0 **:data-[slot=progress-indicator]:rounded-none **:data-[slot=progress-track]:h-full **:data-[slot=progress-track]:rounded-none **:data-[slot=progress-track]:bg-transparent",
						indicatorClass
					)}
				/>
			</div>
		</div>
	);
}

/**
 * Free-plan usage meters pinned above the sidebar footer. Hidden for premium
 * orgs and while access is loading; the icon-collapsed rail hides it via the
 * group variant. The upgrade CTA needs the billing grant — members without it
 * still see their meters.
 */
export function PlanUsageCard() {
	const router = useRouter();
	const {
		hasPremiumAccess,
		hasOrganization,
		planLimits,
		currentUsage,
		isLoading,
	} = useFeatureAccess();
	const { can } = usePermissions();

	if (isLoading || hasPremiumAccess || !hasOrganization || !currentUsage) {
		return null;
	}

	return (
		<SidebarGroup className="overflow-hidden group-data-[collapsible=icon]:hidden">
			<Frame spacing="xs" dense className="shrink-0 border border-border">
				<FrameHeader>
					<FrameTitle className="text-xs">Free plan</FrameTitle>
				</FrameHeader>
				<FramePanel className="space-y-3">
					<UsageMeter
						icon={<Briefcase className="size-3.5" />}
						label="Clients"
						used={currentUsage.clientsCount}
						limit={planLimits.clients}
					/>
					<UsageMeter
						icon={<FileSignature className="size-3.5" />}
						label="E-signatures"
						used={currentUsage.esignaturesSentThisMonth}
						limit={planLimits.esignaturesPerMonth}
					/>
					{can("billing") && (
						<Button
							size="sm"
							className="w-full justify-center"
							onClick={() =>
								router.push("/organization/profile?tab=billing")
							}
						>
							<ArrowUpRight className="size-4" />
							Upgrade
						</Button>
					)}
				</FramePanel>
			</Frame>
		</SidebarGroup>
	);
}
