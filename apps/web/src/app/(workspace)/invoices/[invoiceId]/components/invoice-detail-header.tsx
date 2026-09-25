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
import { usePermissions } from "@/hooks/use-permissions";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

interface InvoiceDetailHeaderProps {
	invoice: Doc<"invoices">;
	currentStatus: InvoiceStatus;
	onStatusChange: (status: InvoiceStatus) => void;
	onMarkPaid: () => void;
	/** Opens the send-email modal (portal template or custom email). */
	onSendEmail: () => void;
	/** Disable draft sends when the monthly document-send meter is exhausted (resends never debit). */
	sendCapReached?: boolean;
	sendCapReason?: string;
	onGeneratePdf: () => void;
	onCancel: () => void;
}

export function InvoiceDetailHeader({
	invoice,
	currentStatus,
	onStatusChange,
	onMarkPaid,
	onSendEmail,
	sendCapReached = false,
	sendCapReason,
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
						disabled: !canModify || sendCapReached,
						disabledReason: sendCapReached ? sendCapReason : undefined,
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
			// Opens the send modal. Hidden on paid/cancelled invoices, which the
			// backend rejects; sent/overdue re-send the same link.
			key: "send-to-client",
			label: invoice.firstSentAt ? "Resend to Client" : "Send to Client",
			icon: <Mail className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onSendEmail,
			disabled: !canModify || sendCapReached,
			disabledReason: sendCapReached ? sendCapReason : undefined,
			hidden: currentStatus === "paid" || currentStatus === "cancelled",
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

	return (
		<StickyDetailHeader>
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-bold text-foreground truncate shrink-0">
					{invoice.invoiceNumber ||
						`Invoice #${invoice._id.slice(-6)}`}
				</h1>
				<div className="flex-1 min-w-0 max-w-3xl">
					<StatusProgressBar
						status={currentStatus}
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
							// firstSentAt is the real send instant; issuedDate is a
							// user-entered UTC-midnight day stamp, not a send time.
							...(invoice.firstSentAt
								? [
										{
											type: "sent",
											timestamp: invoice.firstSentAt,
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
				</div>
				<ActionButtonGroup actions={actions} className="shrink-0" />
			</div>
		</StickyDetailHeader>
	);
}
