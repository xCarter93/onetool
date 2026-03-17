"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { Circle, AlertCircle, AlertTriangle } from "lucide-react";
import { Doc } from "@onetool/backend/convex/_generated/dataModel";

export function ServiceStatusBadge() {
	const services = useQuery(api.serviceStatus.getAll);

	if (!services || services.length === 0) return null;

	const operationalCount = services.filter(
		(s) => s.status === "operational"
	).length;
	const totalCount = services.length;
	const hasIssues = operationalCount < totalCount;

	const statusColor =
		operationalCount === totalCount
			? "bg-emerald-400" // green for all operational
			: operationalCount >= totalCount / 2
				? "bg-amber-400" // amber for some issues
				: "bg-red-400"; // red for major issues

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button className="relative flex items-center gap-3 rounded-full px-4 py-2 transition-all duration-200 cursor-pointer hover:ring-2 hover:ring-primary/30">
					<span
						className={`relative inline-flex h-2.5 w-2.5 ${hasIssues ? "" : "animate-pulse"}`}
					>
						<span
							className={`absolute inline-flex h-full w-full rounded-full ${statusColor} opacity-60 blur-sm`}
						/>
						<span
							className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusColor}`}
						/>
					</span>
					<span className="text-sm font-medium text-foreground/80">
						{operationalCount}/{totalCount} services operational
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-80 bg-background! border-border shadow-xl">
				<div className="space-y-4">
					<h3 className="font-semibold text-sm">Service Status</h3>
					{services.map((service) => (
						<ServiceStatusItem key={service._id} service={service} />
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ServiceStatusItem({ service }: { service: Doc<"serviceStatus"> }) {
	const getStatusIcon = (status: string) => {
		switch (status) {
			case "operational":
				return <Circle className="h-3 w-3 fill-emerald-400 text-emerald-400" />;
			case "degraded":
			case "partial_outage":
				return <AlertTriangle className="h-3 w-3 text-amber-400" />;
			case "major_outage":
				return <AlertCircle className="h-3 w-3 text-red-400" />;
			default:
				return <Circle className="h-3 w-3 text-gray-400" />;
		}
	};

	// Custom display name mapping
	const getDisplayName = (serviceName: string) => {
		if (serviceName === "boldsign_esignature") {
			return "E-Signature";
		}
		return serviceName
			.replace(/_/g, " ")
			.replace(/\b\w/g, (l) => l.toUpperCase());
	};

	const displayName = getDisplayName(service.serviceName);

	return (
		<div className="flex items-center justify-between text-sm">
			<div className="flex items-center gap-2">
				{getStatusIcon(service.status)}
				<span>{displayName}</span>
			</div>
			<div className="text-xs text-muted-foreground">
				{formatDistanceToNow(service.lastChecked, { addSuffix: true })}
			</div>
		</div>
	);
}
