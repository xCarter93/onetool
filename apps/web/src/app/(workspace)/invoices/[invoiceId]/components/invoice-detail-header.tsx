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
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AnimatePresence, motion } from "motion/react";
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
	const renderStatusActions = () => {
		switch (currentStatus) {
			case "draft":
				return (
					<>
						<StyledButton
							intent="primary"
							size="sm"
							onClick={() => onStatusChange("sent")}
							icon={<Send className="h-4 w-4" />}
							label="Mark as Sent"
							showArrow={false}
						/>
						<StyledButton
							intent="success"
							size="sm"
							onClick={onMarkPaid}
							icon={<CheckCircle className="h-4 w-4" />}
							label="Mark as Paid"
							showArrow={false}
						/>
					</>
				);
			case "sent":
			case "overdue":
				return (
					<>
						<StyledButton
							intent="success"
							size="sm"
							onClick={onMarkPaid}
							icon={<CheckCircle className="h-4 w-4" />}
							label="Mark as Paid"
							showArrow={false}
						/>
						<StyledButton
							intent="outline"
							size="sm"
							onClick={() => onStatusChange("draft")}
							icon={<RotateCcw className="h-4 w-4" />}
							label="Revert to Draft"
							showArrow={false}
						/>
					</>
				);
			case "paid":
				return (
					<StyledButton
						intent="outline"
						size="sm"
						onClick={() => onStatusChange("sent")}
						icon={<RotateCcw className="h-4 w-4" />}
						label="Reopen"
						showArrow={false}
					/>
				);
			case "cancelled":
				return (
					<StyledButton
						intent="outline"
						size="sm"
						onClick={() => onStatusChange("draft")}
						icon={<RotateCcw className="h-4 w-4" />}
						label="Reopen (Draft)"
						showArrow={false}
					/>
				);
			default:
				return null;
		}
	};

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
						{currentStatus !== "cancelled" && (
							<StyledButton
								intent="destructive"
								size="sm"
								onClick={onCancel}
								icon={<XCircle className="h-4 w-4" />}
								label="Cancel"
								showArrow={false}
							/>
						)}
					</div>
				</div>
			)}
		</StickyDetailHeader>
	);
}
