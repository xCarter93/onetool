"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import {
	PenLine,
	Mail,
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
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { todayUtcMidnightMs } from "@/lib/dates";
import { cn } from "@/lib/utils";

type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

interface QuoteDetailHeaderProps {
	quote: Doc<"quotes">;
	currentStatus: QuoteStatus;
	onStatusChange: (status: QuoteStatus) => void;
	/** Emails the client a portal invite for this quote (quotes.sendToClient). */
	onSendToClient: () => void;
	/** True while the send-to-client mutation is in flight. */
	sending?: boolean;
	onSendForSignature: () => void;
	/** Disable "Send for e-signature" when the monthly e-signature cap is reached. */
	sendDisabled?: boolean;
	sendDisabledReason?: string;
	onGeneratePdf: () => void;
	onDelete: () => void;
	onConvertToInvoice: () => void;
	/** True while a convert-to-invoice mutation is in flight — disables the action to prevent duplicate invoices. */
	converting?: boolean;
}

export function QuoteDetailHeader({
	quote,
	currentStatus,
	onStatusChange,
	onSendToClient,
	sending = false,
	onSendForSignature,
	sendDisabled = false,
	sendDisabledReason,
	onGeneratePdf,
	onDelete,
	onConvertToInvoice,
	converting = false,
}: QuoteDetailHeaderProps) {
	const { can } = usePermissions();
	const canModifyQuote = can("quotes", "modify");
	const canDeleteQuote = can("quotes", "delete");
	const canModifyInvoice = can("invoices", "modify");

	// The backend refuses to send a quote whose valid-until day has passed; the
	// sidebar's Valid until field is the revive path. Compared as calendar days,
	// same as the backend, so the final valid day still sends.
	const validUntilPassed =
		typeof quote.validUntil === "number" &&
		quote.validUntil < todayUtcMidnightMs();

	// Reverting a sent quote pulls it out of the client's portal, so it confirms.
	const [showRevertConfirm, setShowRevertConfirm] = useState(false);

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
					{
						key: "revert-to-draft",
						label: "Revert to draft",
						icon: <RotateCcw className="h-4 w-4" />,
						slot: "secondary",
						variant: "outline",
						onClick: () => setShowRevertConfirm(true),
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
						disabled: !canModifyInvoice || converting,
						loading: converting,
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
			// Emails the portal invite. Hidden on approved quotes — the backend
			// rejects those (convert to an invoice instead), same as mobile.
			key: "send-to-client",
			label:
				currentStatus === "sent" ? "Resend to Client" : "Send to Client",
			icon: <Mail className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onSendToClient,
			disabled: !canModifyQuote || sending || validUntilPassed,
			disabledReason: validUntilPassed
				? "Extend the valid-until date before sending"
				: undefined,
			loading: sending,
			loadingLabel: "Sending…",
			hidden: currentStatus === "approved",
		},
		{
			key: "send-esign",
			label: "Send for e-signature",
			icon: <PenLine className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onSendForSignature,
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

					{/* Portals out — no effect on the header layout. */}
					<AlertDialog
						open={showRevertConfirm}
						onOpenChange={setShowRevertConfirm}
					>
						<AlertDialogContent size="sm">
							<AlertDialogHeader>
								<AlertDialogTitle>
									Revert this quote to draft?
								</AlertDialogTitle>
								<AlertDialogDescription>
									The client&apos;s link will stop working until you
									resend.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Keep it sent</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => {
										setShowRevertConfirm(false);
										onStatusChange("draft");
									}}
								>
									Revert to draft
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			)}
		</StickyDetailHeader>
	);
}
