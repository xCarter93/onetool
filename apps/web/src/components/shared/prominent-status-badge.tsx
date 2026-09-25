import {
	CheckCircleIcon,
	ClockIcon,
	XCircleIcon,
	ExclamationCircleIcon,
	PaperAirplaneIcon,
	BanknotesIcon,
	DocumentCheckIcon,
} from "@heroicons/react/24/solid";

type StatusSize = "default" | "large" | "xl";
type EntityType = "client" | "project" | "quote" | "invoice" | "task";

interface ProminentStatusBadgeProps {
	status: string;
	size?: StatusSize;
	showIcon?: boolean;
	entityType?: EntityType;
	className?: string;
}

const getStatusIcon = (status: string) => {
	const iconClass = "shrink-0";

	// Map common statuses to icons
	switch (status.toLowerCase()) {
		case "active":
		case "completed":
		case "approved":
			return <CheckCircleIcon className={iconClass} />;
		case "sent":
			return <PaperAirplaneIcon className={iconClass} />;
		case "paid":
			return <BanknotesIcon className={iconClass} />;
		case "pending":
		case "draft":
		case "planned":
			return <ClockIcon className={iconClass} />;
		case "declined":
		case "cancelled":
		case "archived":
			return <XCircleIcon className={iconClass} />;
		case "overdue":
		case "expired":
			return <ExclamationCircleIcon className={iconClass} />;
		case "in-progress":
			return <ClockIcon className={iconClass} />;
		case "prospect":
		case "lead":
			return <DocumentCheckIcon className={iconClass} />;
		default:
			return <ClockIcon className={iconClass} />;
	}
};

const getStatusColor = (status: string) => {
	const statusLower = status.toLowerCase();

	// Color mapping based on status
	switch (statusLower) {
		case "active":
		case "completed":
		case "paid":
		case "approved":
			return "border-success/30 bg-success/10 text-success-foreground";
		case "in-progress":
		case "sent":
			return "border-warning/30 bg-warning/10 text-warning-foreground";
		case "pending":
		case "draft":
		case "planned":
			return "border-info/30 bg-info/10 text-info-foreground";
		case "lead":
			return "border-primary/30 bg-primary/10 text-primary";
		case "cancelled":
		case "declined":
		case "archived":
		case "inactive":
			return "border-border bg-muted text-muted-foreground";
		case "overdue":
		case "expired":
			return "border-danger/30 bg-danger/10 text-danger-foreground";
		default:
			return "border-border bg-muted text-muted-foreground";
	}
};

const getSizeClasses = (size: StatusSize, showIcon: boolean) => {
	switch (size) {
		case "xl":
			return {
				container: "px-6 py-3 text-lg font-bold border-2 rounded-xl",
				icon: showIcon ? "w-7 h-7 mr-3" : "",
			};
		case "large":
			return {
				container:
					"px-4 py-2 text-base font-semibold border-2 rounded-lg",
				icon: showIcon ? "w-5 h-5 mr-2" : "",
			};
		case "default":
		default:
			return {
				container: "px-3 py-1.5 text-sm font-medium border rounded-md",
				icon: showIcon ? "w-4 h-4 mr-1.5" : "",
			};
	}
};

const formatStatusText = (status: string) => {
	// Convert status to proper case
	return status
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
};

export function ProminentStatusBadge({
	status,
	size = "default",
	showIcon = true,
	className = "",
}: ProminentStatusBadgeProps) {
	const colorClasses = getStatusColor(status);
	const sizeClasses = getSizeClasses(size, showIcon);
	const icon = showIcon ? getStatusIcon(status) : null;

	return (
		<div
			className={`inline-flex items-center justify-center ${sizeClasses.container} ${colorClasses} ${className}`}
		>
			{icon && <span className={sizeClasses.icon}>{icon}</span>}
			<span>{formatStatusText(status)}</span>
		</div>
	);
}
