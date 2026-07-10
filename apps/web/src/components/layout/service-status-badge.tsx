"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type Health = "operational" | "degraded" | "outage";

export function ServiceStatusBadge() {
	const services = useQuery(api.serviceStatus.getAll);

	if (!services || services.length === 0) return null;

	const operationalCount = services.filter(
		(s) => s.status === "operational"
	).length;
	const totalCount = services.length;

	const health: Health =
		operationalCount === totalCount
			? "operational"
			: operationalCount >= totalCount / 2
				? "degraded"
				: "outage";

	const theme = {
		operational: {
			dot: "bg-success",
			pill: "bg-success/10 text-success-foreground ring-success/20 hover:bg-success/15",
			tile: "bg-success/10 text-success-foreground",
			icon: CheckCircle2,
			label: "All systems operational",
		},
		degraded: {
			dot: "bg-warning",
			pill: "bg-warning/10 text-warning-foreground ring-warning/20 hover:bg-warning/15",
			tile: "bg-warning/10 text-warning-foreground",
			icon: AlertTriangle,
			label: `${operationalCount}/${totalCount} operational`,
		},
		outage: {
			dot: "bg-destructive",
			pill: "bg-destructive/10 text-destructive-foreground ring-destructive/20 hover:bg-destructive/15",
			tile: "bg-destructive/10 text-destructive-foreground",
			icon: AlertCircle,
			label: `${operationalCount}/${totalCount} operational`,
		},
	}[health];

	const HealthIcon = theme.icon;

	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						className={cn(
							"inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							theme.pill
						)}
					/>
				}
			>
				<span className="relative flex size-2">
					<span
						className={cn(
							"absolute inline-flex h-full w-full rounded-full opacity-75",
							theme.dot,
							health === "operational" && "motion-safe:animate-ping"
						)}
					/>
					<span
						className={cn(
							"relative inline-flex size-2 rounded-full",
							theme.dot
						)}
					/>
				</span>
				<span className="whitespace-nowrap">{theme.label}</span>
			</PopoverTrigger>
			<PopoverContent
				align="center"
				sideOffset={10}
				className="w-80 rounded-xl border-border p-0 shadow-xl"
			>
				<div className="flex items-center gap-3 border-b border-border px-4 py-3">
					<span
						className={cn(
							"flex size-9 items-center justify-center rounded-full",
							theme.tile
						)}
					>
						<HealthIcon className="size-5" />
					</span>
					<div className="min-w-0">
						<p className="text-sm font-semibold text-foreground">
							{theme.label}
						</p>
						<p className="text-xs text-muted-foreground">
							{operationalCount} of {totalCount} services online
						</p>
					</div>
				</div>
				<div className="p-2">
					{services.map((service) => (
						<ServiceStatusItem key={service._id} service={service} />
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ServiceStatusItem({ service }: { service: Doc<"serviceStatus"> }) {
	const meta = (status: string) => {
		switch (status) {
			case "operational":
				return {
					dot: "bg-success",
					label: "Operational",
					text: "text-success-foreground",
				};
			case "degraded":
			case "partial_outage":
				return {
					dot: "bg-warning",
					label: "Degraded",
					text: "text-warning-foreground",
				};
			case "major_outage":
				return {
					dot: "bg-destructive",
					label: "Outage",
					text: "text-destructive-foreground",
				};
			default:
				return {
					dot: "bg-muted-foreground",
					label: "Unknown",
					text: "text-muted-foreground",
				};
		}
	};

	const getDisplayName = (serviceName: string) => {
		if (serviceName === "boldsign_esignature") return "E-Signature";
		return serviceName
			.replace(/_/g, " ")
			.replace(/\b\w/g, (l) => l.toUpperCase());
	};

	const m = meta(service.status);

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
			<div className="flex min-w-0 items-center gap-2.5">
				<span className={cn("size-2 shrink-0 rounded-full", m.dot)} />
				<span className="truncate text-sm font-medium text-foreground">
					{getDisplayName(service.serviceName)}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<span className={cn("text-xs font-medium", m.text)}>{m.label}</span>
				<span className="text-[11px] text-muted-foreground">
					{formatDistanceToNow(service.lastChecked, { addSuffix: true })}
				</span>
			</div>
		</div>
	);
}
