"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import {
	PenLine,
	FileText,
	Trash2,
	Check,
	Send,
	RotateCcw,
	Receipt,
} from "lucide-react";
import {
	ActionButtonGroup,
	type RecordAction,
} from "@/components/domain/action-button-group";
import { AnimatePresence, motion } from "motion/react";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

interface QuoteDetailHeaderProps {
	quote: Doc<"quotes">;
	currentStatus: QuoteStatus;
	onStatusChange: (status: QuoteStatus) => void;
	onSendToClient: () => void;
	/** Disable "Send for e-signature" when the monthly e-signature cap is reached. */
	sendDisabled?: boolean;
	sendDisabledReason?: string;
	onGeneratePdf: () => void;
	onDelete: () => void;
	onConvertToInvoice: () => void;
}

export function QuoteDetailHeader({
	quote,
	currentStatus,
	onStatusChange,
	onSendToClient,
	sendDisabled = false,
	sendDisabledReason,
	onGeneratePdf,
	onDelete,
	onConvertToInvoice,
}: QuoteDetailHeaderProps) {
	const { can } = usePermissions();
	const canModifyQuote = can("quotes", "modify");
	const canDeleteQuote = can("quotes", "delete");
	const canModifyInvoice = can("invoices", "modify");

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
						disabled: !canModifyQuote,
					},
				];
			case "sent":
				return [
					{
						// TODO(reui-rebuild): success button intent mapped to default
						key: "mark-approved",
						label: "Mark Approved",
						icon: <Check className="h-4 w-4" />,
						slot: "start",
						variant: "default",
						onClick: () => onStatusChange("approved"),
						disabled: !canModifyQuote,
					},
				];
			case "approved":
				return [
					{
						key: "convert",
						label: "Convert to Invoice",
						icon: <Receipt className="h-4 w-4" />,
						slot: "start",
						variant: "default",
						onClick: onConvertToInvoice,
						disabled: !canModifyInvoice,
					},
					{
						key: "reopen",
						label: "Reopen",
						icon: <RotateCcw className="h-4 w-4" />,
						slot: "secondary",
						variant: "outline",
						onClick: () => onStatusChange("draft"),
						disabled: !canModifyQuote,
					},
				];
			case "declined":
			case "expired":
				return [
					{
						key: "reopen",
						label: "Reopen",
						icon: <RotateCcw className="h-4 w-4" />,
						slot: "start",
						variant: "outline",
						onClick: () => onStatusChange("draft"),
						disabled: !canModifyQuote,
					},
				];
			default:
				return [];
		}
	})();

	const actions: RecordAction[] = [
		...statusActions,
		{
			key: "send-esign",
			label: "Send for e-signature",
			icon: <PenLine className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onSendToClient,
			disabled: sendDisabled || !canModifyQuote,
			disabledReason: sendDisabled ? sendDisabledReason : undefined,
		},
		{
			key: "generate-pdf",
			label: "Generate PDF",
			icon: <FileText className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onGeneratePdf,
			disabled: !canModifyQuote,
		},
		{
			key: "delete",
			label: "Delete",
			icon: <Trash2 className="h-4 w-4" />,
			slot: "end",
			variant: "destructive",
			onClick: onDelete,
			disabled: !canDeleteQuote,
		},
	];

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
							Quote {quote.quoteNumber || `#${quote._id.slice(-6)}`}
						</h1>
						{!isSticky && (
							<p className="text-sm text-muted-foreground">
								{quote.title || "Untitled Quote"}
							</p>
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
									status={currentStatus}
									steps={[
										{ id: "draft", name: "Draft", order: 1 },
										{ id: "sent", name: "Sent", order: 2 },
										{ id: "approved", name: "Approved", order: 3 },
									]}
									events={[
										...(quote._creationTime
											? [{ type: "draft", timestamp: quote._creationTime }]
											: []),
										...(quote.sentAt
											? [{ type: "sent", timestamp: quote.sentAt }]
											: []),
										...(quote.approvedAt
											? [{ type: "approved", timestamp: quote.approvedAt }]
											: []),
										...(quote.declinedAt
											? [{ type: "declined", timestamp: quote.declinedAt }]
											: []),
									]}
									failureStatuses={["declined", "expired"]}
									successStatuses={["approved"]}
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
