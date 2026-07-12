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
import { Button } from "@/components/ui/button";
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
	const renderStatusActions = () => {
		switch (currentStatus) {
			case "draft":
				return (
					<Button
						size="sm"
						onClick={() => onStatusChange("sent")}
						disabled={!can("quotes", "modify")}
					>
						<Send className="h-4 w-4" />
						Mark as Sent
					</Button>
				);
			case "sent":
				return (
					// TODO(reui-rebuild): success button intent mapped to default
					<Button
						size="sm"
						onClick={() => onStatusChange("approved")}
						disabled={!can("quotes", "modify")}
					>
						<Check className="h-4 w-4" />
						Mark Approved
					</Button>
				);
			case "approved":
				return (
					<>
						<Button
							size="sm"
							onClick={onConvertToInvoice}
							disabled={!can("invoices", "modify")}
						>
							<Receipt className="h-4 w-4" />
							Convert to Invoice
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onStatusChange("draft")}
							disabled={!can("quotes", "modify")}
						>
							<RotateCcw className="h-4 w-4" />
							Reopen
						</Button>
					</>
				);
			case "declined":
			case "expired":
				return (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onStatusChange("draft")}
						disabled={!can("quotes", "modify")}
					>
						<RotateCcw className="h-4 w-4" />
						Reopen
					</Button>
				);
			default:
				return null;
		}
	};

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
					<div className="flex items-center gap-2 shrink-0">
						{renderStatusActions()}
						{/* Tooltip lives on the wrapper: a disabled button won't
						    reliably surface a native title on hover. */}
						<span
							className="inline-flex"
							title={sendDisabled ? sendDisabledReason : undefined}
						>
							<Button
								variant="outline"
								size="sm"
								onClick={onSendToClient}
								disabled={sendDisabled || !can("quotes", "modify")}
							>
								<PenLine className="h-4 w-4" />
								Send for e-signature
							</Button>
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={onGeneratePdf}
							disabled={!can("quotes", "modify")}
						>
							<FileText className="h-4 w-4" />
							Generate PDF
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={onDelete}
							disabled={!can("quotes", "delete")}
						>
							<Trash2 className="h-4 w-4" />
							Delete
						</Button>
					</div>
				</div>
			)}
		</StickyDetailHeader>
	);
}
