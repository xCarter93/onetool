"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import {
	Mail,
	FileText,
	Trash2,
	Check,
	Send,
	RotateCcw,
	Receipt,
} from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "expired";

interface QuoteDetailHeaderProps {
	quote: Doc<"quotes">;
	currentStatus: QuoteStatus;
	onStatusChange: (status: QuoteStatus) => void;
	onSendToClient: () => void;
	onGeneratePdf: () => void;
	onDelete: () => void;
	onConvertToInvoice: () => void;
}

export function QuoteDetailHeader({
	quote,
	currentStatus,
	onStatusChange,
	onSendToClient,
	onGeneratePdf,
	onDelete,
	onConvertToInvoice,
}: QuoteDetailHeaderProps) {
	const renderStatusActions = () => {
		switch (currentStatus) {
			case "draft":
				return (
					<StyledButton
						intent="primary"
						size="sm"
						onClick={() => onStatusChange("sent")}
						icon={<Send className="h-4 w-4" />}
						label="Mark as Sent"
						showArrow={false}
					/>
				);
			case "sent":
				return (
					<StyledButton
						intent="success"
						size="sm"
						onClick={() => onStatusChange("approved")}
						icon={<Check className="h-4 w-4" />}
						label="Mark Approved"
						showArrow={false}
					/>
				);
			case "approved":
				return (
					<>
						<StyledButton
							intent="primary"
							size="sm"
							onClick={onConvertToInvoice}
							icon={<Receipt className="h-4 w-4" />}
							label="Convert to Invoice"
							showArrow={false}
						/>
						<StyledButton
							intent="outline"
							size="sm"
							onClick={() => onStatusChange("draft")}
							icon={<RotateCcw className="h-4 w-4" />}
							label="Reopen"
							showArrow={false}
						/>
					</>
				);
			case "declined":
			case "expired":
				return (
					<StyledButton
						intent="outline"
						size="sm"
						onClick={() => onStatusChange("draft")}
						icon={<RotateCcw className="h-4 w-4" />}
						label="Reopen"
						showArrow={false}
					/>
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
						<StyledButton
							intent="outline"
							size="sm"
							onClick={onSendToClient}
							icon={<Mail className="h-4 w-4" />}
							label="Send to Client"
							showArrow={false}
						/>
						<StyledButton
							intent="outline"
							size="sm"
							onClick={onGeneratePdf}
							icon={<FileText className="h-4 w-4" />}
							label="Generate PDF"
							showArrow={false}
						/>
						<StyledButton
							intent="destructive"
							size="sm"
							onClick={onDelete}
							icon={<Trash2 className="h-4 w-4" />}
							label="Delete"
							showArrow={false}
						/>
					</div>
				</div>
			)}
		</StickyDetailHeader>
	);
}
