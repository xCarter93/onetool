import { View, Text } from "react-native";
import { colors, radius, spacing, fontFamily } from "@/lib/theme";

type ClientStatus = "lead" | "active" | "inactive" | "archived";
type ProjectStatus = "planned" | "in-progress" | "completed" | "cancelled";
type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";
type TaskStatus = "pending" | "in-progress" | "completed" | "cancelled";
type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

type Status = ClientStatus | ProjectStatus | QuoteStatus | TaskStatus | InvoiceStatus;

const statusConfig: Record<
	Status,
	{ backgroundColor: string; textColor: string; label: string }
> = {
	// Client statuses
	lead: { backgroundColor: "#dbeafe", textColor: "#1d4ed8", label: "Lead" },
	active: { backgroundColor: "#dcfce7", textColor: "#16a34a", label: "Active" },
	inactive: {
		backgroundColor: "#f3f4f6",
		textColor: "#6b7280",
		label: "Inactive",
	},
	archived: {
		backgroundColor: "#f3f4f6",
		textColor: "#6b7280",
		label: "Archived",
	},

	// Project statuses
	planned: {
		backgroundColor: "#dbeafe",
		textColor: "#1d4ed8",
		label: "Planned",
	},
	"in-progress": {
		backgroundColor: "#fef3c7",
		textColor: "#d97706",
		label: "In Progress",
	},
	completed: {
		backgroundColor: "#dcfce7",
		textColor: "#16a34a",
		label: "Completed",
	},
	cancelled: {
		backgroundColor: "#fee2e2",
		textColor: "#dc2626",
		label: "Cancelled",
	},

	// Quote statuses
	draft: { backgroundColor: "#f3f4f6", textColor: "#6b7280", label: "Draft" },
	sent: { backgroundColor: "#dbeafe", textColor: "#1d4ed8", label: "Sent" },
	approved: {
		backgroundColor: "#dcfce7",
		textColor: "#16a34a",
		label: "Approved",
	},
	declined: {
		backgroundColor: "#fee2e2",
		textColor: "#dc2626",
		label: "Declined",
	},
	expired: {
		backgroundColor: "#f3f4f6",
		textColor: "#6b7280",
		label: "Expired",
	},

	// Task statuses
	pending: {
		backgroundColor: "#f3f4f6",
		textColor: "#6b7280",
		label: "Pending",
	},

	// Invoice statuses
	paid: {
		backgroundColor: "#dcfce7",
		textColor: "#16a34a",
		label: "Paid",
	},
	overdue: {
		backgroundColor: "#fee2e2",
		textColor: "#dc2626",
		label: "Overdue",
	},
};

interface StatusBadgeProps {
	status: Status;
	customLabel?: string;
}

export function StatusBadge({ status, customLabel }: StatusBadgeProps) {
	const config = statusConfig[status] || {
		backgroundColor: colors.muted,
		textColor: colors.mutedForeground,
		label: status,
	};

	return (
		<View
			style={{
				backgroundColor: config.backgroundColor,
				paddingHorizontal: spacing.sm,
				paddingVertical: spacing.xs,
				borderRadius: radius.full,
			}}
		>
			<Text
				style={{
					color: config.textColor,
					fontSize: 11,
					fontFamily: fontFamily.medium,
				}}
			>
				{customLabel || config.label}
			</Text>
		</View>
	);
}
