"use client";

import { useRouter } from "next/navigation";
import {
	ArrowUpRight,
	BarChart3,
	FileSignature,
	MessageSquare,
	Send,
	Upload,
} from "lucide-react";
import type { MeterUsage } from "@onetool/backend";
import {
	Frame,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SidebarGroup } from "@/components/ui/sidebar";
import { useAuth } from "@clerk/nextjs";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePermissions } from "@/hooks/use-permissions";
import { LAUNCH_PROMO, useLaunchPromoActive } from "@/lib/promo";
import { cn } from "@/lib/utils";

/** Display order + chrome for the finite-limit meters the backend can return. */
const METER_DISPLAY: {
	key: MeterUsage["key"];
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		key: "clientSends",
		label: "Document sends",
		icon: <Send className="size-3.5" />,
	},
	{
		key: "esignatures",
		label: "E-signatures",
		icon: <FileSignature className="size-3.5" />,
	},
	{
		key: "assistantMessages",
		label: "Assistant messages today",
		icon: <MessageSquare className="size-3.5" />,
	},
	{
		key: "savedReports",
		label: "Saved reports",
		icon: <BarChart3 className="size-3.5" />,
	},
	{
		key: "importedRows",
		label: "Imported rows",
		icon: <Upload className="size-3.5" />,
	},
];

/** The sidebar shows the top of the list only; the billing tab shows them all. */
const SIDEBAR_METER_LIMIT = 3;

// Meter limits arrive from the entitlements query, where null = unlimited.
function formatLimit(limit: number | null): string {
	return limit === null ? "Unlimited" : limit.toString();
}

function isAtLimit(used: number, limit: number | null): boolean {
	return limit === null ? false : used >= limit;
}

function isNearLimit(used: number, limit: number | null): boolean {
	return limit === null ? false : used >= limit * 0.8;
}

function getUsagePercentage(used: number, limit: number | null): number {
	return limit === null ? 0 : Math.min(100, (used / limit) * 100);
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
	const { isBusiness, isLoading, meter } = useEntitlements();
	const { orgId } = useAuth();
	const { can } = usePermissions();
	const promoActive = useLaunchPromoActive();
	const rows = METER_DISPLAY.flatMap((row) => {
		const usage = meter(row.key);
		return usage ? [{ ...row, usage }] : [];
	}).slice(0, SIDEBAR_METER_LIMIT);

	if (isLoading || isBusiness || !orgId || rows.length === 0) {
		return null;
	}

	return (
		<SidebarGroup className="overflow-hidden group-data-[collapsible=icon]:hidden">
			<Frame spacing="xs" dense className="shrink-0 border border-border">
				<FrameHeader>
					<FrameTitle className="text-xs">Free plan</FrameTitle>
				</FrameHeader>
				<FramePanel className="space-y-3">
					{rows.map((row) => (
						<UsageMeter
							key={row.key}
							icon={row.icon}
							label={row.label}
							used={row.usage.used}
							limit={row.usage.limit}
						/>
					))}
					{can("billing") && (
						<div className="space-y-1.5">
							{promoActive && (
								<p className="text-center text-[11px] font-medium text-primary">
									Launch offer: {LAUNCH_PROMO.headline} through{" "}
									{LAUNCH_PROMO.endsLabel}
								</p>
							)}
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
						</div>
					)}
				</FramePanel>
			</Frame>
		</SidebarGroup>
	);
}
