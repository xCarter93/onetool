"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import {
	Mail,
	FileText,
	XCircle,
	CheckCircle,
	Send,
	RotateCcw,
} from "lucide-react";
import {
	ActionButtonGroup,
	type RecordAction,
} from "@/components/domain/action-button-group";
import { AnimatePresence, motion } from "motion/react";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

const getInvoiceStatus = (
	status: InvoiceStatus,
	dueDate?: number
): InvoiceStatus => {
	if (status === "sent" && dueDate && dueDate < Date.now()) return "overdue";
	return status;
};

interface InvoiceDetailHeaderProps {
	invoice: Doc<"invoices">;
	currentStatus: InvoiceStatus;
	onStatusChange: (status: InvoiceStatus) => void;
	onMarkPaid: () => void;
	onSendToClient: () => void;
	onGeneratePdf: () => void;
	onCancel: () => void;
}

export function InvoiceDetailHeader({
	invoice,
	currentStatus,
	onStatusChange,
	onMarkPaid,
	onSendToClient,
	onGeneratePdf,
	onCancel,
}: InvoiceDetailHeaderProps) {
	const { can } = usePermissions();
	const canModify = can("invoices", "modify");

	// Status-dependent actions. The primary next step for each status is pinned
	// left ("start"); everything else is secondary and collapses into the ⋯ menu.
	const statusActions: RecordAction[] = (() => {
		switch (currentStatus) {
			case "draft":
				return [
					{
						key: "mark-sent",
						label: "Mark as Sent",
						icon: <Send className="h-4 w-4" />,
						slot: "start",
						variant: "default",
						onClick: () => onStatusChange("sent"),
						disabled: !canModify,
					},
					{
						// TODO(reui-rebuild): success button intent mapped to default
						key: "mark-paid",
						label: "Mark as Paid",
						icon: <CheckCircle className="h-4 w-4" />,
						slot: "start",
						variant: "default",
						onClick: onMarkPaid,
						disabled: !canModify,
					},
				];
			case "sent":
			case "overdue":
				return [
					{
						// TODO(reui-rebuild): success button intent mapped to default
						key: "mark-paid",
						label: "Mark as Paid",
						icon: <CheckCircle className="h-4 w-4" />,
						slot: "start",
						variant: "default",
						onClick: onMarkPaid,
						disabled: !canModify,
					},
					{
						key: "revert-draft",
						label: "Revert to Draft",
						icon: <RotateCcw className="h-4 w-4" />,
						slot: "secondary",
						variant: "outline",
						onClick: () => onStatusChange("draft"),
						disabled: !canModify,
					},
				];
			case "paid":
				return [
					{
						key: "reopen",
						label: "Reopen",
						icon: <RotateCcw className="h-4 w-4" />,
						slot: "start",
						variant: "outline",
						onClick: () => onStatusChange("sent"),
						disabled: !canModify,
					},
				];
			case "cancelled":
				return [
					{
						key: "reopen",
						label: "Reopen (Draft)",
						icon: <RotateCcw className="h-4 w-4" />,
						slot: "start",
						variant: "outline",
						onClick: () => onStatusChange("draft"),
						disabled: !canModify,
					},
				];
			default:
				return [];
		}
	})();

	const actions: RecordAction[] = [
		...statusActions,
		{
			key: "send-to-client",
			label: "Send to Client",
			icon: <Mail className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onSendToClient,
			disabled: !canModify,
		},
		{
			key: "generate-pdf",
			label: "Generate PDF",
			icon: <FileText className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onGeneratePdf,
			disabled: !canModify,
		},
		{
			key: "cancel",
			label: "Cancel",
			icon: <XCircle className="h-4 w-4" />,
			slot: "end",
			variant: "destructive",
			onClick: onCancel,
			disabled: !canModify,
			hidden: currentStatus === "cancelled",
		},
	];

	const computedStatus = getInvoiceStatus(
		invoice.status as InvoiceStatus,
		invoice.dueDate
	);

	return (
		<StickyDetailHeader>
			{(isSticky) => (
				<div className="flex items-center justify-between gap-4">
					<div className="shrink-0">
						<h1
							className={cn(
								"font-bold text-foreground truncate transition-all duration-300",
								isSticky ? "text-lg" : "text-2xl"
							)}
						>
							{invoice.invoiceNumber ||
								`Invoice #${invoice._id.slice(-6)}`}
						</h1>
						{!isSticky && (
							<p className="text-sm text-muted-foreground">Invoice</p>
						)}
					</div>
					<AnimatePresence initial={false}>
						{!isSticky && (
							<motion.div
								className="flex-1 min-w-0 max-w-3xl"
								initial={{ opacity: 0, height: 0, scaleY: 0 }}
								animate={{ opacity: 1, height: "auto", scaleY: 1 }}
								exit={{ opacity: 0, height: 0, scaleY: 0 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
								style={{ originY: 0 }}
							>
								<StatusProgressBar
									status={computedStatus}
									steps={[
										{ id: "draft", name: "Draft", order: 1 },
										{ id: "sent", name: "Sent", order: 2 },
										{ id: "paid", name: "Paid", order: 3 },
									]}
									events={[
										...(invoice._creationTime
											? [
													{
														type: "draft",
														timestamp: invoice._creationTime,
													},
												]
											: []),
										...(invoice.issuedDate
											? [
													{
														type: "sent",
														timestamp: invoice.issuedDate,
													},
												]
											: []),
										...(invoice.paidAt
											? [
													{
														type: "paid",
														timestamp: invoice.paidAt,
													},
												]
											: []),
									]}
									failureStatuses={["overdue", "cancelled"]}
									successStatuses={["paid"]}
								/>
							</motion.div>
						)}
					</AnimatePresence>
					<ActionButtonGroup actions={actions} className="shrink-0" />
				</div>
			)}
		</StickyDetailHeader>
	);
}
