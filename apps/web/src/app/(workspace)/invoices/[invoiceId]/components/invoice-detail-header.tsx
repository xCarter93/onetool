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
import { Button } from "@/components/ui/button";
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
	const renderStatusActions = () => {
		switch (currentStatus) {
			case "draft":
				return (
					<>
						<Button
							size="sm"
							onClick={() => onStatusChange("sent")}
							disabled={!canModify}
						>
							<Send className="h-4 w-4" />
							Mark as Sent
						</Button>
						{/* TODO(reui-rebuild): success button intent mapped to default */}
						<Button size="sm" onClick={onMarkPaid} disabled={!canModify}>
							<CheckCircle className="h-4 w-4" />
							Mark as Paid
						</Button>
					</>
				);
			case "sent":
			case "overdue":
				return (
					<>
						{/* TODO(reui-rebuild): success button intent mapped to default */}
						<Button size="sm" onClick={onMarkPaid} disabled={!canModify}>
							<CheckCircle className="h-4 w-4" />
							Mark as Paid
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onStatusChange("draft")}
							disabled={!canModify}
						>
							<RotateCcw className="h-4 w-4" />
							Revert to Draft
						</Button>
					</>
				);
			case "paid":
				return (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onStatusChange("sent")}
						disabled={!canModify}
					>
						<RotateCcw className="h-4 w-4" />
						Reopen
					</Button>
				);
			case "cancelled":
				return (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onStatusChange("draft")}
						disabled={!canModify}
					>
						<RotateCcw className="h-4 w-4" />
						Reopen (Draft)
					</Button>
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
						<Button
							variant="outline"
							size="sm"
							onClick={onSendToClient}
							disabled={!canModify}
						>
							<Mail className="h-4 w-4" />
							Send to Client
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={onGeneratePdf}
							disabled={!canModify}
						>
							<FileText className="h-4 w-4" />
							Generate PDF
						</Button>
						{currentStatus !== "cancelled" && (
							<Button
								variant="destructive"
								size="sm"
								onClick={onCancel}
								disabled={!canModify}
							>
								<XCircle className="h-4 w-4" />
								Cancel
							</Button>
						)}
					</div>
				</div>
			)}
		</StickyDetailHeader>
	);
}
