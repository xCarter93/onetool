"use client";

import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { StatusProgressBar } from "@/components/shared/status-progress-bar";
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
		<div className="border-b border-border pb-4 mb-0">
			<div className="flex items-center justify-between gap-4">
				<div className="shrink-0">
					<h1 className="text-2xl font-bold text-foreground truncate">
						Quote {quote.quoteNumber || `#${quote._id.slice(-6)}`}
					</h1>
					<p className="text-sm text-muted-foreground">
						{quote.title || "Untitled Quote"}
					</p>
				</div>
				<div className="flex-1 min-w-0 max-w-3xl">
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
				</div>
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
		</div>
	);
}
